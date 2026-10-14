import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { dur, prefersReducedMotion } from "../../motion/utils.js";
import "./orb.css";

// The orb is drawn at a fixed size (BASE pixels) and then moved and scaled
// to fit wherever it should be:
//   mode "hero" -> big, in the empty spot above the heading
//   mode "chat" -> small, in the top bar
// Both spots are empty <div>s ("anchors") elsewhere on the page. We measure
// the anchor and tween the orb to match it.
const BASE = 420;

// Can this browser draw WebGL graphics at all?
function webglAvailable() {
  try {
    const test = document.createElement("canvas");
    return !!(test.getContext("webgl2") || test.getContext("webgl"));
  } catch {
    return false;
  }
}

// Props:
//   mode      "hero" | "chat"
//   state     "idle" | "focus" | "thinking"
//   sendTick  goes up by one each time a question is sent  -> pulse
//   answerTick goes up by one each time an answer arrives  -> softer pulse
export default function Orb({ mode, state, sendTick, answerTick }) {
  const floatRef = useRef(null);
  const canvasRef = useRef(null);
  const fallbackRef = useRef(null);
  const sceneRef = useRef(null);
  const placedOnce = useRef(false);

  // If WebGL is missing or fails, we show a simple CSS orb instead.
  const [useFallback, setUseFallback] = useState(() => !webglAvailable());

  // Remember the latest values so they can be applied as soon as the 3D scene is ready.
  const latest = useRef({ mode, state });
  latest.current = { mode, state };

  // ---------- 3D scene: create once, clean up on exit ----------
  useEffect(() => {
    if (useFallback) return;
    let cancelled = false;
    let scene = null;

    // The 3D library is loaded on demand, so the chat appears immediately.
    import("./orbScene.js")
      .then(({ createOrbScene }) => {
        if (cancelled || !canvasRef.current) return;
        try {
          scene = createOrbScene(canvasRef.current, {
            reducedMotion: prefersReducedMotion(),
            lowPower: window.innerWidth < 700,
          });
        } catch {
          setUseFallback(true);
          return;
        }
        sceneRef.current = scene;
        scene.onContextLost(() => setUseFallback(true));
        scene.setMode(latest.current.mode, false);
        scene.setState(latest.current.state);
        scene.intro();
        if (import.meta.env.DEV) window.__orb = scene; // handy for debugging
      })
      .catch(() => setUseFallback(true));

    return () => {
      cancelled = true;
      if (scene) scene.dispose();
      sceneRef.current = null;
    };
  }, [useFallback]);

  // ---------- react to what is happening in the chat ----------
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setState(state);
  }, [state]);

  useEffect(() => {
    if (sendTick > 0 && sceneRef.current) sceneRef.current.pulse(1);
  }, [sendTick]);

  useEffect(() => {
    if (answerTick > 0 && sceneRef.current) sceneRef.current.pulse(0.6);
  }, [answerTick]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setMode(mode, true);
  }, [mode]);

  // Entrance for the simple CSS orb.
  useLayoutEffect(() => {
    if (!useFallback || !fallbackRef.current) return;
    gsap.from(fallbackRef.current, {
      scale: 0.55,
      opacity: 0,
      duration: dur(1.6),
      ease: "power3.out",
    });
  }, [useFallback]);

  // ---------- placement: glide to the anchor that matches the mode ----------
  const place = useCallback(
    (animate) => {
      const el = floatRef.current;
      if (!el) return;
      const anchor = document.getElementById(
        mode === "hero" ? "orb-anchor-hero" : "orb-anchor-compact"
      );
      if (!anchor) return;

      const main = el.parentElement.getBoundingClientRect();
      const box = anchor.getBoundingClientRect();
      const size = Math.min(box.width, box.height);
      // The orb starts out centred horizontally (by CSS). `x` is how far the
      // spot is from the centre: 0 on the first screen and on desktop, but on a
      // phone the small orb sits beside the "+" button, to the right of the middle.
      const target = {
        x: box.left + box.width / 2 - (main.left + main.width / 2),
        y: box.top - main.top + box.height / 2 - BASE / 2,
        scale: size / BASE,
      };

      if (animate && placedOnce.current) {
        gsap.to(el, { ...target, duration: dur(1), ease: "power3.inOut", overwrite: true });
      } else {
        gsap.set(el, target);
      }
      placedOnce.current = true;
    },
    [mode]
  );

  useLayoutEffect(() => {
    place(true);
  }, [place]);

  // If the window is resized (or fonts finish loading and shift the layout),
  // snap to the right place without animating.
  useEffect(() => {
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    // On short screens the welcome text can scroll; the orb follows its spot.
    // (capture: true also catches scrolling inside child elements)
    window.addEventListener("scroll", onResize, true);
    // On iPhones the keyboard shrinks the visible area without a window resize.
    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", onResize);
    if (document.fonts) document.fonts.ready.then(onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      if (vv) vv.removeEventListener("resize", onResize);
    };
  }, [place]);

  return (
    <div className="orb-float" ref={floatRef} data-mode={mode} data-state={state} aria-hidden="true">
      {useFallback ? (
        <div className="orb-fallback" ref={fallbackRef} />
      ) : (
        <canvas ref={canvasRef} />
      )}
    </div>
  );
}
