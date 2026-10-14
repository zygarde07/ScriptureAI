import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import "./TempleOverlay.css";

/*
  The decorative artwork behind the orb: an ornate temple arch, manuscript
  panels on both sides, flowing gold lines and a lotus. It is one transparent
  PNG (public/art/temple-arch-lotus-overlay-transparent.png), shown as a
  separate layer BEHIND the orb. It never touches the orb or its animation.

  Where it goes: we measure the empty spot reserved for the orb on the first
  screen (#orb-anchor-hero) and place the picture so that the orb sits in the
  middle of the arch, like in the reference design.
*/

const SRC = "/art/temple-arch-lotus-overlay-transparent.png";
// A smaller copy for phones (about a third of the download). The browser picks
// whichever fits; `sizes` tells it the picture is shown fairly small on a phone.
const SRC_SMALL = "/art/temple-arch-lotus-overlay-transparent-1000.png";
const SRCSET = `${SRC_SMALL} 1000w, ${SRC} 1824w`;
const SIZES = "(max-width: 700px) 300px, 1368px";

// Facts about the picture itself (its own pixel size) ...
const NATIVE_WIDTH = 1824;
const NATIVE_HEIGHT = 862;
// ... and the spot inside the picture where the orb should sit (the middle of the arch).
const ORB_X = 923;
const ORB_Y = 445;

// How big the picture is compared with the orb's spot. In the reference
// design it is about 4.8 times as wide. It is never smaller than 3.1 times
// (so the arch always frames the orb, and on a phone the sides just crop)
// and, when the screen is wide enough to fit it, never wider than the screen.
const WIDTH_PER_ORB = 4.8;
const MIN_WIDTH_PER_ORB = 3.1;

// `visible`  true on the first screen; false once a conversation starts (the artwork fades out)
// `anchored` true while the first screen exists, so the orb's spot can be measured
export default function TempleOverlay({ visible, anchored }) {
  const rootRef = useRef(null);
  const imgRef = useRef(null);

  const place = useCallback(() => {
    const root = rootRef.current;
    const img = imgRef.current;
    const anchor = document.getElementById("orb-anchor-hero");
    if (!root || !img || !anchor) return; // no first screen right now: keep the last position

    const area = root.getBoundingClientRect();
    const box = anchor.getBoundingClientRect();
    const orbSize = Math.min(box.width, box.height);
    const centreX = box.left - area.left + box.width / 2;
    const centreY = box.top - area.top + box.height / 2;

    const width = Math.max(MIN_WIDTH_PER_ORB * orbSize, Math.min(WIDTH_PER_ORB * orbSize, area.width));
    const scale = width / NATIVE_WIDTH;

    img.style.width = `${width}px`;
    img.style.height = `${NATIVE_HEIGHT * scale}px`;
    img.style.left = `${centreX - ORB_X * scale}px`;
    img.style.top = `${centreY - ORB_Y * scale}px`;
  }, []);

  // Position it as soon as the first screen exists.
  useLayoutEffect(() => {
    if (anchored) place();
  }, [anchored, place]);

  // Keep it in place when the window is resized, the sidebar slides, fonts
  // load, or the first screen scrolls on a short phone.
  useEffect(() => {
    const update = () => place();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    if (document.fonts) document.fonts.ready.then(update);
    // the sidebar opening changes the width of the chat area without a window resize
    const observer = new ResizeObserver(update);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer.disconnect();
    };
  }, [place]);

  return (
    <div
      className="temple-overlay"
      ref={rootRef}
      data-visible={visible ? "true" : "false"}
      aria-hidden="true"
    >
      {/* A colour filter that warms the artwork to the soft copper of the reference design */}
      <svg className="temple-overlay__defs" width="0" height="0" focusable="false">
        <filter id="temple-warm" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0   0 0.66 0 0 0   0 0 0.5 0 0   0 0 0 1 0"
          />
        </filter>
      </svg>
      <img
        ref={imgRef}
        className="temple-overlay__img"
        src={SRC}
        srcSet={SRCSET}
        sizes={SIZES}
        alt=""
        draggable="false"
        onLoad={place}
      />
    </div>
  );
}
