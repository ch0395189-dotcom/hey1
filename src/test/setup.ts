import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

window.PointerEvent = window.PointerEvent || (MouseEvent as unknown as typeof PointerEvent);
HTMLElement.prototype.scrollIntoView = HTMLElement.prototype.scrollIntoView || (() => {});
