import { Capacitor } from "@capacitor/core";

/**
 * Ensures the currently focused input/textarea stays visible while the
 * Android/iOS soft keyboard is open. Combined with Manifest
 * `windowSoftInputMode="adjustResize"` and the Capacitor Keyboard plugin
 * `resize: 'native'` setting, this guarantees the chat input rides above
 * the keyboard instead of being covered by it.
 *
 * Web: no-op.
 */
let installed = false;

export async function installNativeKeyboardHandling(): Promise<void> {
  if (installed) return;
  try {
    if (!Capacitor.isNativePlatform()) return;
  } catch {
    return;
  }
  installed = true;

  try {
    const { Keyboard } = await import("@capacitor/keyboard");

    Keyboard.addListener("keyboardWillShow", (info) => {
      // Expose keyboard height as a CSS var so layouts can pad if needed.
      document.documentElement.style.setProperty(
        "--keyboard-height",
        `${info.keyboardHeight}px`
      );
      document.body.classList.add("keyboard-open");
      // Scroll the focused element into view after the resize settles.
      requestAnimationFrame(() => {
        const el = document.activeElement as HTMLElement | null;
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ block: "nearest", behavior: "auto" });
        }
      });
    });

    Keyboard.addListener("keyboardDidShow", () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest", behavior: "auto" });
      }
    });

    Keyboard.addListener("keyboardWillHide", () => {
      document.documentElement.style.setProperty("--keyboard-height", "0px");
      document.body.classList.remove("keyboard-open");
    });
  } catch (e) {
    console.warn("[NativeKeyboard] setup failed", e);
  }
}