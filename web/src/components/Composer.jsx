import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { SendIcon, StopIcon } from "./icons.jsx";

const MAX_HEIGHT = 144; // about six lines
const MAX_LENGTH = 2000;

// The message box. Enter sends, Shift+Enter adds a new line.
// While an answer is loading, the send button becomes a Stop button.
const Composer = forwardRef(function Composer(
  { onSend, onStop, isLoading, anyLoading, onFocusChange },
  ref
) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  // Lets the parent call composerRef.current.focus()
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  function resize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + "px";
  }

  function submit() {
    const question = text.trim();
    if (!question || anyLoading) return;
    onSend(question);
    setText("");
    // wait for React to clear the box, then shrink it back
    requestAnimationFrame(resize);
  }

  function handleKeyDown(event) {
    // isComposing: ignore Enter while typing with an input method (e.g. Hindi, Japanese)
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const canSend = text.trim().length > 0 && !anyLoading;

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="composer-input" className="sr-only">
          Ask a question
        </label>
        <textarea
          id="composer-input"
          ref={inputRef}
          className="composer__input"
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder="Ask about your texts…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            resize();
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
        />

        {isLoading ? (
          <button type="button" className="composer__btn composer__btn--stop" onClick={onStop} aria-label="Stop">
            <StopIcon size={18} />
          </button>
        ) : (
          <button type="submit" className="composer__btn" disabled={!canSend} aria-label="Send question">
            <SendIcon size={20} />
          </button>
        )}
      </form>
      <p className="composer__hint">
        Enter to send · Shift+Enter for a new line · Answers are grounded in your library's texts and may be incomplete.
      </p>
    </div>
  );
});

export default Composer;
