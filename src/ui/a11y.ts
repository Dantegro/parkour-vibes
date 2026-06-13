/** Apply ARIA / accessibility attributes to a DOM element. */
export function applyA11y(
  el: HTMLElement,
  attrs: Record<string, string | boolean | null | undefined>,
): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") {
      if (value) el.setAttribute(key, "");
      else el.removeAttribute(key);
    } else {
      el.setAttribute(key, value);
    }
  }
}

/** Visually hidden text for screen readers. */
export function srOnly(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "sr-only";
  span.textContent = text;
  return span;
}

let srOnlyStyleInjected = false;

export function ensureSrOnlyStyles(): void {
  if (srOnlyStyleInjected) return;
  srOnlyStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `;
  document.head.appendChild(style);
}
