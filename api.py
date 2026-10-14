"""A small web API so the React site can use the same RAG pipeline as app.py.

Start it from the project folder:
    uvicorn api:app --port 8000
(On a hosting service use:  --host 0.0.0.0 --port $PORT --no-proxy-headers
 Do NOT trust forwarded-address headers there: visitors can fake them. Without them the
 per-visitor limits below act as limits shared by everyone, which cannot be dodged.)

Endpoints:
    GET  /api/health   is the server up and ready?  (public, reveals nothing sensitive)
    POST /api/access   check an access code
    POST /api/ask      {"question": "..."}  ->  {"answer": "..."}

The knowledge sources are confidential: the response contains only the answer
text, never file names, passages or other retrieval details.
The Gemini key and the access code stay on the server (environment variables).
The browser never sees them.

Settings (environment variables, all optional unless marked):
    ENVIRONMENT            "production" makes the server refuse questions unless ACCESS_CODE is set
    ACCESS_CODE            the code visitors must enter (if empty, the gate is off, e.g. on your own PC)
    ALLOWED_ORIGINS        websites allowed to call this API, comma separated, e.g. https://my-app.vercel.app
    RATE_PER_MINUTE        questions per visitor per minute            (default 6)
    RATE_PER_DAY           questions per visitor per day               (default 100)
                           (on a hosting service every visitor counts as one, so raise these a little)
    DAILY_ANSWER_CAP       questions for everyone together per day     (default 500)
    MAX_QUESTION_LENGTH    longest accepted question in characters      (default 1000)
If the website has been built (web/dist), this server also serves it, so
http://127.0.0.1:8000 shows the whole product with no extra tools.
"""

import hmac
import logging
import os
import re
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

import rag

log = logging.getLogger("scriptureai")

# =========================
# SETTINGS
# =========================
PRODUCTION = (os.getenv("ENVIRONMENT") or "").strip().lower() == "production"
ACCESS_CODE = (os.getenv("ACCESS_CODE") or "").strip()
RATE_PER_MINUTE = int(os.getenv("RATE_PER_MINUTE", "6"))
RATE_PER_DAY = int(os.getenv("RATE_PER_DAY", "100"))
DAILY_ANSWER_CAP = int(os.getenv("DAILY_ANSWER_CAP", "500"))
MAX_QUESTION_LENGTH = int(os.getenv("MAX_QUESTION_LENGTH", "1000"))
FAILED_CODE_LIMIT = 8  # wrong access codes allowed per visitor ...
FAILED_CODE_WINDOW = 600  # ... within this many seconds
MAX_BODY_BYTES = 16 * 1024  # a question never needs more than this


def _allowed_origins():
    origins = []
    for item in (os.getenv("ALLOWED_ORIGINS") or "").split(","):
        item = item.strip().rstrip("/")
        if not item:
            continue
        if item == "*" and PRODUCTION:
            log.error("ALLOWED_ORIGINS=* is ignored in production; list your website's address instead")
            continue
        origins.append(item)
    return origins


# =========================
# RATE LIMITING (in memory: fine for one small server; resets when it restarts)
# =========================
class SlidingWindowLimiter:
    """Allows `limit` events per `window` seconds for each key (for example each visitor)."""

    def __init__(self, limit, window, max_keys=20000):
        self.limit, self.window, self.max_keys = limit, window, max_keys
        self._events = {}
        self._lock = threading.Lock()

    def _prune(self, key, now):
        events = self._events.get(key)
        if events is None:
            return None
        while events and events[0] <= now - self.window:
            events.popleft()
        if not events:
            del self._events[key]
            return None
        return events

    def retry_after(self, key):
        """0 if another event is allowed now, otherwise the seconds to wait."""
        now = time.time()
        with self._lock:
            events = self._prune(key, now)
            if events is None or len(events) < self.limit:
                return 0
            return max(1, int(events[0] + self.window - now) + 1)

    def record(self, key):
        now = time.time()
        with self._lock:
            if key not in self._events and len(self._events) >= self.max_keys:
                self._events.pop(next(iter(self._events)))  # make room: forget the oldest visitor
            self._events.setdefault(key, deque()).append(now)


per_minute = SlidingWindowLimiter(RATE_PER_MINUTE, 60)
per_day = SlidingWindowLimiter(RATE_PER_DAY, 24 * 3600)
failed_codes = SlidingWindowLimiter(FAILED_CODE_LIMIT, FAILED_CODE_WINDOW)


class DailyCap:
    """A limit for everyone together, which resets at midnight UTC."""

    def __init__(self, cap):
        self.cap, self.day, self.count = cap, None, 0
        self._lock = threading.Lock()

    def take(self):
        today = datetime.now(timezone.utc).date()
        with self._lock:
            if self.day != today:
                self.day, self.count = today, 0
            if self.count >= self.cap:
                return False
            self.count += 1
            return True


daily_cap = DailyCap(DAILY_ANSWER_CAP)


def visitor(request: Request):
    """Who is asking: the address of the connection. Behind a hosting proxy this is the proxy itself, so
    all visitors share one key (deliberate: the alternative, trusting X-Forwarded-For, can be faked)."""
    return request.client.host if request.client else "unknown"


# =========================
# APP
# =========================
@asynccontextmanager
async def lifespan(app):
    if PRODUCTION and not ACCESS_CODE:
        log.error("ENVIRONMENT=production but ACCESS_CODE is not set: questions will be refused")
    elif PRODUCTION and len(ACCESS_CODE) < 12:
        log.warning("ACCESS_CODE is short; use a long random code (16+ characters)")
    # Load the slow models once at start-up, so the first question is quick.
    try:
        rag.warm_up()
    except Exception:
        log.exception("Warm-up failed; the first question may be slow")
    yield


# No public documentation pages: they are only useful to attackers.
app = FastAPI(title="ScriptureAI", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

origins = _allowed_origins()
if origins:
    # Only the listed websites may call this API from a browser.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Access-Code"],
        allow_credentials=False,
        max_age=600,
    )


def error(status_code, kind, retry_after=None):
    # The website turns `kind` into a friendly message for the user.
    headers = {"Retry-After": str(retry_after)} if retry_after else None
    return JSONResponse(status_code=status_code, content={"error": kind}, headers=headers)


@app.middleware("http")
async def basic_protections(request: Request, call_next):
    # Refuse unreasonably large requests before reading them.
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
        return error(413, "invalid_request")
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


# Errors always come back as short, generic JSON: never details, stack traces or the visitor's input.
@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    return error(400, "invalid_request")


@app.exception_handler(StarletteHTTPException)
async def http_problem(request, exc):
    return error(exc.status_code, "not_found" if exc.status_code == 404 else "unknown")


@app.exception_handler(Exception)
async def unexpected(request, exc):
    log.exception("Unexpected error")
    return error(500, "unknown")


def check_access(request: Request):
    """Returns None if the visitor may continue, otherwise the error response to send."""
    if not ACCESS_CODE:
        # No code configured. On a public server that is a mistake, so refuse rather than leave it open.
        return error(503, "not_configured") if PRODUCTION else None

    who = visitor(request)
    wait = failed_codes.retry_after(who)
    if wait:
        return error(429, "rate_limited", wait)

    given = (request.headers.get("x-access-code") or "").strip()
    # compare_digest takes the same time however many characters match (no clues for guessers)
    if not hmac.compare_digest(given.encode("utf-8"), ACCESS_CODE.encode("utf-8")):
        failed_codes.record(who)
        return error(401, "access_denied")
    return None


@app.get("/api/health")
def health():
    # Public: says whether the server is up, ready, and whether a code is needed. Nothing else.
    return {"ok": True, "ready": rag.is_ready(), "accessRequired": bool(ACCESS_CODE)}


@app.post("/api/access")
def access(request: Request):
    denied = check_access(request)
    return denied if denied else {"ok": True}


class AskRequest(BaseModel):
    question: str  # length is checked in ask(), so the error message is a friendly one


_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


# These are plain `def` functions (not async), so FastAPI runs them in a
# worker thread and a slow answer never blocks other requests.
@app.post("/api/ask")
def ask(request: Request, body: AskRequest):
    denied = check_access(request)
    if denied:
        return denied

    question = _CONTROL_CHARS.sub("", body.question).strip()
    if not question:
        return error(400, "empty_question")
    if len(question) > MAX_QUESTION_LENGTH:
        return error(400, "question_too_long")

    if not rag.api_key_configured():
        return error(503, "not_configured")

    # Limits: each visitor per minute and per day, then everyone together per day.
    who = visitor(request)
    wait = max(per_minute.retry_after(who), per_day.retry_after(who))
    if wait:
        return error(429, "rate_limited", wait)
    if not daily_cap.take():
        return error(429, "daily_limit", 3600)
    per_minute.record(who)
    per_day.record(who)

    try:
        result = rag.answer_question(question)
    except rag.ConfigurationError:
        return error(503, "not_configured")
    except rag.NotReadyError:
        return error(503, "not_ready")
    except rag.BusyError:
        return error(503, "busy", 10)
    except Exception as problem:
        # Details go to the server log, never to the browser. (The question is not logged.)
        log.exception("Answering failed")
        if getattr(problem, "code", None) == 429:
            # Google says our own quota is used up: to the visitor that simply means "busy"
            return error(503, "busy", 30)
        return error(502, "upstream")

    if not result["answer"].strip():
        return error(502, "upstream")

    # Send ONLY the answer text. (An explicit allow-list: whatever else the
    # pipeline works with internally can never reach the browser by accident.)
    return {"answer": result["answer"]}


# Serve the built website if it exists (after `npm run build` in web/).
# This must come last, so it does not hide the /api routes above.
DIST = Path(__file__).parent / "web" / "dist"
if DIST.is_dir():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
