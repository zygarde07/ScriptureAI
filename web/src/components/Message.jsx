import { useLayoutEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import gsap from "gsap";
import { dur } from "../motion/utils.js";
import SourcesPanel from "./SourcesPanel.jsx";
import { RetryIcon } from "./icons.jsx";

// Links in answers open in a new tab, safely.
const markdownComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

// One message in the conversation: yours, an answer, or a note
// explaining that a request failed or was stopped.
export default function Message({ message, onRetry, retryDisabled }) {
  const ref = useRef(null);

  // A just-arrived answer reveals itself block by block.
  useLayoutEffect(() => {
    if (message.role !== "assistant" || !message.fresh || message.status !== "done") return;
    const ctx = gsap.context(() => {
      gsap.from(".prose > *, .sources", {
        y: 14,
        opacity: 0,
        duration: dur(0.7),
        ease: "power2.out",
        stagger: 0.08,
        clearProps: "transform,opacity",
      });
    }, ref);
    return () => ctx.revert();
    // run once, when the message first appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (message.role === "user") {
    return (
      <div className="msg msg--user" ref={ref}>
        <p>{message.content}</p>
      </div>
    );
  }

  if (message.status === "error" || message.status === "stopped") {
    const text =
      message.status === "stopped" ? "You stopped this request." : message.errorText;
    return (
      <div className="msg msg--note" ref={ref} role="alert">
        <p>{text}</p>
        <button type="button" className="retry" onClick={() => onRetry(message.id)} disabled={retryDisabled}>
          <RetryIcon size={15} />
          {message.status === "stopped" ? "Ask again" : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <article className="msg msg--bot" ref={ref}>
      <div className="prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
      </div>
      <SourcesPanel sources={message.sources} />
    </article>
  );
}
