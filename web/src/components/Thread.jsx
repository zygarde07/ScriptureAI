import { useEffect, useRef } from "react";
import Message from "./Message.jsx";
import { prefersReducedMotion } from "../motion/utils.js";

// The shimmering "working on it" indicator shown while an answer is on its way.
function Thinking() {
  return (
    <div className="thinking" role="status">
      <span className="thinking__wave" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </span>
      <span className="thinking__label">Searching the texts…</span>
    </div>
  );
}

// The scrolling list of messages. It follows new messages down, but
// leaves you alone if you have scrolled up to re-read something.
export default function Thread({ messages, isLoading, onRetry, anyLoading }) {
  const scrollRef = useRef(null);
  const lastCount = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    const grew = messages.length > lastCount.current;
    const lastIsUser = messages[messages.length - 1]?.role === "user";
    lastCount.current = messages.length;

    if (nearBottom || (grew && lastIsUser)) {
      el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }, [messages, isLoading]);

  return (
    <div className="thread" ref={scrollRef}>
      {/* role="log" + aria-live: screen readers announce new answers politely */}
      <div className="thread__col" role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((m) => (
          <Message key={m.id} message={m} onRetry={onRetry} retryDisabled={anyLoading} />
        ))}
        {isLoading && <Thinking />}
      </div>
    </div>
  );
}
