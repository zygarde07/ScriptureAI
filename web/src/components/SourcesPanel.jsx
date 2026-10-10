import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { dur } from "../motion/utils.js";
import { BookIcon, ChevronIcon } from "./icons.jsx";

// "Sources" under an answer. It lists the REAL passages the backend
// returned for that answer: the file name and the passage text. Nothing is made up.
export default function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const firstRender = useRef(true);

  // Slide the panel open and closed. autoAlpha also sets
  // `visibility: hidden` when closed, so hidden links can't be tabbed to.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (firstRender.current) {
      firstRender.current = false;
      gsap.set(el, { height: 0, autoAlpha: 0 });
      return;
    }
    gsap.to(el, {
      height: open ? "auto" : 0,
      autoAlpha: open ? 1 : 0,
      duration: dur(0.4),
      ease: "power2.inOut",
    });
  }, [open]);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="sources">
      <button
        type="button"
        className="sources__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <BookIcon size={16} />
        Sources · {sources.length}
        <ChevronIcon size={16} className={open ? "is-open" : ""} />
      </button>

      <div className="sources__panel" ref={panelRef}>
        <ul className="sources__list">
          {sources.map((s, i) => (
            <li key={i}>
              <details className="source">
                <summary className="source__name">{s.source}</summary>
                <blockquote className="source__text">{s.text}</blockquote>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
