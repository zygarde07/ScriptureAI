import { forwardRef, useLayoutEffect } from "react";
import gsap from "gsap";
import { dur } from "../motion/utils.js";
import { OpenBookIcon, LotusIcon, MeditationIcon, BowIcon, ChevronRightIcon } from "./icons.jsx";

// Suggestions to get started. They are only ideas for questions:
// clicking one simply sends it like any other question.
// The icons and chevrons are shown on phones (see app.css), where the
// suggestions are stacked cards.
const SUGGESTIONS = [
  // (no book titles here: the library's contents are confidential)
  { text: "What is dharma, and how should one live by it?", Icon: OpenBookIcon, tone: "ember" },
  { text: "Explain karma yoga in simple words", Icon: LotusIcon, tone: "rose" },
  { text: "What do these texts say about breath and health?", Icon: MeditationIcon, tone: "gold" },
  { text: "How was archery taught in ancient India?", Icon: BowIcon, tone: "ember" },
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
        your library.
      </p>

      <ul className="chips welcome__reveal" aria-label="Suggested questions">
        {SUGGESTIONS.map(({ text, Icon, tone }) => (
          <li key={text}>
            <button type="button" className="chip" onClick={() => onPick(text)}>
              <span className={`chip__icon chip__icon--${tone}`}>
                <Icon size={26} />
              </span>
              <span className="chip__text">{text}</span>
              <ChevronRightIcon className="chip__chevron" size={20} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});

export default Welcome;
