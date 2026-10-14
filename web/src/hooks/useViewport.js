import { useEffect, useState } from "react";

/*
  Phones change the size of the screen while you type: the on-screen keyboard
  covers the bottom part. Android Chrome can resize the page for us (see the
  `interactive-widget` setting in index.html), but iPhones do not: only the
  "visual viewport" (the part you can actually see) shrinks.

  This hook copies the visible size into two CSS variables the layout uses:
    --app-height   the height of the part of the screen you can see
    --app-offset   how far iOS has scrolled that part down
  and tells the app whether the keyboard seems to be open, so it can make room.
*/
export default function useViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined; // very old browsers: the CSS falls back to 100dvh
    const root = document.documentElement;

    // The tallest the visible area has been = the height without a keyboard.
    let fullHeight = vv.height;
    let lastWidth = vv.width;

    const update = () => {
      // When the visitor pinch-zooms, the visible area shrinks too. That is not a
      // keyboard, so in that case we leave the layout alone.
      if (vv.scale > 1.02) {
        root.style.removeProperty("--app-height");
        root.style.removeProperty("--app-offset");
        return;
      }
      // A different width means the phone was rotated: measure again.
      if (Math.abs(vv.width - lastWidth) > 40) {
        fullHeight = vv.height;
        lastWidth = vv.width;
      }
      fullHeight = Math.max(fullHeight, vv.height);

      root.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
      root.style.setProperty("--app-offset", `${Math.round(vv.offsetTop)}px`);
      // More than ~120px missing from the height = the keyboard is up.
      setKeyboardOpen(fullHeight - vv.height > 120);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-offset");
    };
  }, []);

  return { keyboardOpen };
}
