// Talks to the real backend. Nothing here is faked: if the server is
// down or fails, we throw an error with an honest message for the user.

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
  upstream: "The answer service didn't respond. Please try again in a moment.",
  empty_question: "Please type a question first.",
  unknown: "Something went wrong while answering. Please try again.",
};

// Sends one question and returns { answer, sources }.
//   sources = [{ source: "file name", text: "passage text" }, ...]
// `signal` lets the caller cancel the request (the Stop button).
export async function askQuestion(question, signal) {
  let response;
  try {
    response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    throw new ApiError(kind, MESSAGES[kind] || MESSAGES.unknown);
  }

  if (!data || typeof data.answer !== "string") {
    throw new ApiError("unknown", MESSAGES.unknown);
  }

  return {
    answer: data.answer,
    sources: Array.isArray(data.sources) ? data.sources : [],
  };
}
