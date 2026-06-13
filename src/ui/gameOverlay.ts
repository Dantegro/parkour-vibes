import { applyA11y } from "./a11y.js";

export interface GameStartOverlay {
  element: HTMLButtonElement;
  show: () => void;
  hide: () => void;
}

/**
 * Full-screen overlay prompting pointer lock. Mapped as button in
 * accessibility-devtools.config.yml (buildGameStartOverlay).
 */
export function buildGameStartOverlay(): GameStartOverlay {
  const overlay = document.createElement("button");
  overlay.type = "button";
  overlay.className = "game-start-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;color:#ccc;font-family:sans-serif;text-align:center;z-index:10;background:linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.2));user-select:none;cursor:pointer;border:none;padding:0;margin:0;width:100%;";

  applyA11y(overlay, {
    "aria-label":
      "Start playing. Captures mouse and enters fullscreen. WASD to move, Space to jump, mouse to look.",
  });

  overlay.innerHTML =
    '<span aria-hidden="true">Click to start<br><small>WASD to move • Space to jump • Mouse to look</small><br><small>(enters fullscreen for immersion)</small></span>';

  return {
    element: overlay,
    show: () => {
      overlay.style.display = "grid";
    },
    hide: () => {
      overlay.style.display = "none";
    },
  };
}
