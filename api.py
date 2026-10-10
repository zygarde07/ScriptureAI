"""A small web API so the React site can use the same RAG pipeline as app.py.

Start it from the project folder:
    uvicorn api:app --port 8000

Endpoints:
    GET  /api/health   is the server up?
    POST /api/ask      {"question": "..."}  ->  {"answer": "...", "sources": [...]}

The Gemini key stays on the server (in .env). The browser never sees it.
If the website has been built (web/dist), this server also serves it, so
http://127.0.0.1:8000 shows the whole product with no extra tools.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import rag

log = logging.getLogger("scriptureai")


@asynccontextmanager
async def lifespan(app):
    # Load the slow models once at start-up, so the first question is quick.
    try:
        rag.warm_up()
    except Exception:
        log.exception("Warm-up failed; the first question may be slow")
    yield


app = FastAPI(title="ScriptureAI", lifespan=lifespan)


class AskRequest(BaseModel):
    question: str = Field(..., max_length=2000)


def error(status_code, kind):
    # The website turns `kind` into a friendly message for the user.
    return JSONResponse(status_code=status_code, content={"error": kind})


@app.get("/api/health")
def health():
    return {"ok": True, "configured": rag.api_key_configured()}


# These are plain `def` functions (not async), so FastAPI runs them in a
# worker thread and a slow answer never blocks other requests.
@app.post("/api/ask")
def ask(request: AskRequest):
    question = request.question.strip()
    if not question:
        return error(400, "empty_question")

    if not rag.api_key_configured():
        return error(503, "not_configured")

    try:
        result = rag.answer_question(question)
    except rag.ConfigurationError:
        return error(503, "not_configured")
    except Exception:
        # Details go to the server log, never to the browser.
        log.exception("Answering failed")
        return error(502, "upstream")

    if not result["answer"].strip():
        return error(502, "upstream")

    return result


# Serve the built website if it exists (after `npm run build` in web/).
# This must come last, so it does not hide the /api routes above.
DIST = Path(__file__).parent / "web" / "dist"
if DIST.is_dir():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
