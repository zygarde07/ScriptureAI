import { forwardRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { dur } from "../motion/utils.js";

// Suggestions to get started. They are only ideas for questions:
// clicking one simply sends it like any other question.
const SUGGESTIONS = [
  "What does the Bhagavad Gita say about dharma?",
  "Explain karma yoga in simple words",
  "What do these texts say about breath and health?",
  "How was archery taught in ancient India?",
];

// The first screen: a heading, a short description and four ideas.
// The glowing orb sits in the empty space at the top (the "hero anchor").
const Welcome = forwardRef(function Welcome({ onPick }, ref) {
  // Gentle entrance: the text rises into place just after the orb appears.
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".welcome__reveal", {
        y: 18,
        opacity: 0,
        duration: dur(0.8),
        ease: "power3.out",
        stagger: 0.1,
        delay: dur(0.5),
      });
    }, ref);
    return () => ctx.revert();
  }, [ref]);

  return (
    <div className="welcome" ref={ref}>
      <div id="orb-anchor-hero" className="welcome__orb" aria-hidden="true" />

      <h1 className="welcome__title welcome__reveal">
        Ask the texts. <em>Find the meaning.</em>
      </h1>

      <p className="welcome__text welcome__reveal">
        Ask a question and read answers drawn from the scriptures and books in
        your library, with the passages behind them.
      </p>

      <ul className="chips welcome__reveal" aria-label="Suggested questions">
        {SUGGESTIONS.map((q) => (
          <li key={q}>
            <button type="button" className="chip" onClick={() => onPick(q)}>
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});

export default Welcome;
