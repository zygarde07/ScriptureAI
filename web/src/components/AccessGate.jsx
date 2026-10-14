import { useState } from "react";
import "../styles/gate.css";

const PROBLEMS = {
  denied: "That access code isn't valid. Please check it and try again.",
  limited: "Too many attempts. Please wait a few minutes and try again.",
  unavailable: "Couldn't check the code right now. Please try again in a moment.",
};

// The screen shown before the chat when an access code is needed, or while a
// sleeping server wakes up. `mode` is "locked" or "waking".
export default function AccessGate({ mode, onSubmit }) {
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setProblem("");
    const verdict = await onSubmit(code);
    if (verdict !== "ok") setProblem(PROBLEMS[verdict] || PROBLEMS.unavailable);
    setBusy(false);
  }

  return (
    <main className="gate">
      <div className="gate__card">
        <h1 className="wordmark gate__brand">
          Scripture<em>AI</em>
        </h1>

        {mode === "waking" ? (
          <div role="status">
            <p className="gate__title">Waking up the server…</p>
            <p className="gate__text">
              This can take up to a minute the first time. The page will continue by itself.
            </p>
            <span className="thinking__wave gate__wave" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="gate__title">Enter your access code</p>
            <p className="gate__text">ScriptureAI is shared with invited readers only.</p>
            <label htmlFor="access-code" className="sr-only">
              Access code
            </label>
            <input
              id="access-code"
              className="gate__input"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              maxLength={200}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Access code"
            />
            <button type="submit" className="gate__button" disabled={busy || !code.trim()}>
              {busy ? "Checking…" : "Continue"}
            </button>
            <p className="gate__problem" role="alert">
              {problem}
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
