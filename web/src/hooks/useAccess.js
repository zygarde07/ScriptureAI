import { useCallback, useEffect, useState } from "react";
import {
  LOCKED_EVENT,
  clearAccessCode,
  fetchStatus,
  getAccessCode,
  setAccessCode,
  verifyAccessCode,
} from "../api/client.js";

/*
  Decides what to show first: the chat, the access-code screen, or a
  "waking up" message.

    checking  asking the server (usually over in a blink: nothing is shown)
    waking    the server is slow to answer (a sleeping hosted server needs up to a
              minute to wake up), so we say so and keep trying
    locked    a code is needed and we don't have a valid one yet
    open      go ahead and show the chat

  This screen is only a convenience. The real lock is on the server, which
  checks the code on every question.
*/
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_ATTEMPTS = 24; // about 1.5 minutes of waiting for a sleeping server

export default function useAccess() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // If the first reply takes a moment, say what is happening.
      const slow = setTimeout(() => setStatus((s) => (s === "checking" ? "waking" : s)), 1500);

      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled; attempt++) {
        const result = await fetchStatus();
        if (cancelled) break;

        if (result.kind === "unreachable") break; // nothing there: let the chat open and report errors honestly

        if (result.kind === "ok") {
          clearTimeout(slow);
          if (!result.data.accessRequired) return setStatus("open");
          const saved = getAccessCode();
          if (saved) {
            const verdict = await verifyAccessCode(saved);
            if (cancelled) return;
            if (verdict === "ok") return setStatus("open");
            if (verdict === "denied") clearAccessCode();
          }
          return setStatus("locked");
        }

        setStatus("waking");
        await sleep(4000);
      }
      clearTimeout(slow);
      if (!cancelled) setStatus("open");
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  // If the server later rejects the saved code, go back to the code screen.
  useEffect(() => {
    const lock = () => setStatus("locked");
    window.addEventListener(LOCKED_EVENT, lock);
    return () => window.removeEventListener(LOCKED_EVENT, lock);
  }, []);

  // Called by the code screen. Returns "ok" | "denied" | "limited" | "unavailable".
  const unlock = useCallback(async (code) => {
    const verdict = await verifyAccessCode(code.trim());
    if (verdict === "ok") {
      setAccessCode(code.trim());
      setStatus("open");
    }
    return verdict;
  }, []);

  return { status, unlock };
}
