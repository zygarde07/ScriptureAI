// Talks to the real backend. Nothing here is faked: if the server is
// down or fails, we throw an error with an honest message for the user.

// Where the backend lives.
//   - On your own computer this is empty: requests go to the same address as the
//     website, and the dev server forwards /api to the Python server.
//   - When the website is hosted separately (for example on Vercel), set
//     VITE_API_BASE_URL to the backend's address, e.g. https://my-api.onrender.com
// This is only an ADDRESS. Never put a secret in a VITE_ variable: every
// visitor can read them.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
const url = (path) => `${API_BASE}${path}`;

// An error whose `userMessage` is safe and friendly to show on screen.
export class ApiError extends Error {
  constructor(kind, userMessage) {
    super(userMessage);
    this.kind = kind;
    this.userMessage = userMessage;
  }
}

const MESSAGES = {
  network: "Couldn't reach ScriptureAI. Check your connection and try again.",
  not_configured: "ScriptureAI isn't fully set up on the server yet.",
  not_ready: "ScriptureAI is still starting up. Please try again in a minute.",
  busy: "ScriptureAI is busy right now. Please try again in a few seconds.",
  upstream: "The answer service didn't respond. Please try again in a moment.",
  rate_limited: "You're asking a little too quickly. Please wait a moment and try again.",
  daily_limit: "ScriptureAI has reached its limit for today. Please try again tomorrow.",
  access_denied: "That access code isn't valid. Please enter it again.",
  empty_question: "Please type a question first.",
  question_too_long: "That question is a little too long. Please shorten it.",
  invalid_request: "That question couldn't be sent. Please try again.",
  unknown: "Something went wrong while answering. Please try again.",
};

// ---------------------------------------------------------------
// The access code (asked once; remembered in this browser)
// ---------------------------------------------------------------
const CODE_KEY = "scriptureai.access";
// Sent when the server says the saved code is no longer valid.
export const LOCKED_EVENT = "scriptureai:locked";

export function getAccessCode() {
  try {
    return localStorage.getItem(CODE_KEY) || "";
  } catch {
    return "";
  }
}

export function setAccessCode(code) {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {
    /* storage blocked: the code just won't be remembered */
  }
}

export function clearAccessCode() {
  try {
    localStorage.removeItem(CODE_KEY);
  } catch {
    /* nothing to do */
  }
}

function authHeaders(extra = {}) {
  const code = getAccessCode();
  return code ? { ...extra, "X-Access-Code": code } : extra;
}

// Is the server up, and is a code needed?
// Returns { kind: "ok", data } | { kind: "waking" } | { kind: "unreachable" }
//   waking      = something answered but not with our JSON (a sleeping hosted server wakes up slowly)
//   unreachable = nothing could be contacted (server off, or blocked)
export async function fetchStatus() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url("/api/health"), { signal: controller.signal });
    const data = await response.json();
    if (response.ok && data && data.ok) return { kind: "ok", data };
    return { kind: "waking" };
  } catch (err) {
    if (err.name === "AbortError") return { kind: "waking" }; // took too long: still starting
    if (err instanceof SyntaxError) return { kind: "waking" }; // an answer, but not JSON
    return { kind: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

// Checks a code with the server. Returns "ok" | "denied" | "limited" | "unavailable".
export async function verifyAccessCode(code) {
  try {
    const response = await fetch(url("/api/access"), {
      method: "POST",
      headers: { "X-Access-Code": code },
    });
    if (response.ok) return "ok";
    if (response.status === 401) return "denied";
    if (response.status === 429) return "limited";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

// ---------------------------------------------------------------
// Asking a question
// ---------------------------------------------------------------
// Sends one question and returns { answer }.
// The backend sends nothing but the answer text: the knowledge sources are
// confidential, and this code never reads anything else from the reply.
// `signal` lets the caller cancel the request (the Stop button).
export async function askQuestion(question, signal) {
  let response;
  try {
    response = await fetch(url("/api/ask"), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ question }),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err; // the user pressed Stop
    throw new ApiError("network", MESSAGES.network);
  }

  // The backend always replies with JSON. If there is no JSON at all, the
  // request never reached it (for example the server is not running).
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const kind = data && data.error ? data.error : data ? "unknown" : "network";
    if (kind === "access_denied") {
      // the saved code is wrong or was changed: forget it and show the code screen again
      clearAccessCode();
      window.dispatchEvent(new Event(LOCKED_EVENT));
    }
    throw new ApiError(kind, MESSAGES[kind] || MESSAGES.unknown);
  }

  if (!data || typeof data.answer !== "string") {
    throw new ApiError("unknown", MESSAGES.unknown);
  }

  return { answer: data.answer };
}
