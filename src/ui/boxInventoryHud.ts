/**
 * In-game box inventory HUD (open world placement).
 */
import { applyA11y } from "./a11y.js";
import type { BoxInventoryState } from "../systems/boxPlacement.js";

export interface BoxInventoryHud {
  element: HTMLDivElement;
  setState(state: BoxInventoryState): void;
  remove(): void;
}

export function createBoxInventoryHud(): BoxInventoryHud {
  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "top:18px",
    "right:18px",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "padding:8px 12px",
    "background:rgba(0,0,0,0.45)",
    "border:1px solid #3a3a44",
    "border-radius:4px",
    "z-index:20",
    "pointer-events:none",
    "font-family:sans-serif",
    "font-size:13px",
    "color:#ccc",
  ].join(";");

  const icon = document.createElement("div");
  icon.style.cssText = [
    "width:28px",
    "height:28px",
    "border:2px solid #8a9a7a",
    "background:linear-gradient(135deg,#5a7a5a 0%,#4a6a4a 100%)",
    "box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)",
    "flex-shrink:0",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "Box ready — click to place";

  container.append(icon, label);

  applyA11y(container, {
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
    "aria-label": "Box ready. Click to place.",
  });

  const PLACED_LABEL_TIMEOUT_MS = 5000;
  let lastState: BoxInventoryState | undefined;
  let placedLabelTimer: ReturnType<typeof setTimeout> | undefined;

  function setState(state: BoxInventoryState) {
    if (state === "available") {
      if (placedLabelTimer !== undefined) {
        clearTimeout(placedLabelTimer);
        placedLabelTimer = undefined;
      }
      icon.style.opacity = "1";
      icon.style.borderColor = "#8a9a7a";
      icon.style.background = "linear-gradient(135deg,#5a7a5a 0%,#4a6a4a 100%)";
      label.textContent = "Box ready — click to place";
      label.style.display = "";
      container.setAttribute("aria-label", "Box ready. Click to place.");
    } else {
      icon.style.opacity = "0.35";
      icon.style.borderColor = "#555";
      icon.style.background = "transparent";
      container.setAttribute("aria-label", "Box placed.");

      if (lastState !== "placed") {
        label.textContent = "Placed";
        label.style.display = "";
        placedLabelTimer = setTimeout(() => {
          label.style.display = "none";
          placedLabelTimer = undefined;
        }, PLACED_LABEL_TIMEOUT_MS);
      }
    }
    lastState = state;
  }

  function remove() {
    if (placedLabelTimer !== undefined) {
      clearTimeout(placedLabelTimer);
      placedLabelTimer = undefined;
    }
    container.remove();
  }

  return {
    element: container,
    setState,
    remove,
  };
}
