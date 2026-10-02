/* ============================================================
 * Chaos Launcher - GLFW-Keycodes
 *
 * Der Chaos Client (Fabric-Mod) arbeitet mit GLFW-Keycodes. Damit die
 * Menütaste im Launcher eingestellt werden kann, übersetzen wir
 * KeyboardEvent.code ↔ GLFW-Code und liefern lesbare Namen.
 * ============================================================ */

export const GLFW_KEY_RIGHT_SHIFT = 344;

const CODE_TO_GLFW: Record<string, number> = {
  Space: 32, Quote: 39, Comma: 44, Minus: 45, Period: 46, Slash: 47,
  Digit0: 48, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52, Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,
  Semicolon: 59, Equal: 61,
  KeyA: 65, KeyB: 66, KeyC: 67, KeyD: 68, KeyE: 69, KeyF: 70, KeyG: 71, KeyH: 72, KeyI: 73, KeyJ: 74, KeyK: 75, KeyL: 76, KeyM: 77,
  KeyN: 78, KeyO: 79, KeyP: 80, KeyQ: 81, KeyR: 82, KeyS: 83, KeyT: 84, KeyU: 85, KeyV: 86, KeyW: 87, KeyX: 88, KeyY: 89, KeyZ: 90,
  BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96,
  Escape: 256, Enter: 257, Tab: 258, Backspace: 259, Insert: 260, Delete: 261,
  ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265,
  PageUp: 266, PageDown: 267, Home: 268, End: 269,
  CapsLock: 280, ScrollLock: 281, NumLock: 282, PrintScreen: 283, Pause: 284,
  F1: 290, F2: 291, F3: 292, F4: 293, F5: 294, F6: 295, F7: 296, F8: 297, F9: 298, F10: 299, F11: 300, F12: 301,
  F13: 302, F14: 303, F15: 304, F16: 305, F17: 306, F18: 307, F19: 308, F20: 309, F21: 310, F22: 311, F23: 312, F24: 313,
  Numpad0: 320, Numpad1: 321, Numpad2: 322, Numpad3: 323, Numpad4: 324, Numpad5: 325, Numpad6: 326, Numpad7: 327, Numpad8: 328, Numpad9: 329,
  NumpadDecimal: 330, NumpadDivide: 331, NumpadMultiply: 332, NumpadSubtract: 333, NumpadAdd: 334, NumpadEnter: 335, NumpadEqual: 336,
  ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, MetaLeft: 343,
  ShiftRight: 344, ControlRight: 345, AltRight: 346, MetaRight: 347, ContextMenu: 348,
};

const NAMES: Record<number, string> = {
  32: "SPACE", 39: "'", 44: ",", 45: "-", 46: ".", 47: "/", 59: ";", 61: "=", 91: "[", 92: "\\", 93: "]", 96: "`",
  256: "ESC", 257: "ENTER", 258: "TAB", 259: "BACKSPACE", 260: "INSERT", 261: "DELETE",
  262: "→", 263: "←", 264: "↓", 265: "↑", 266: "PAGE UP", 267: "PAGE DOWN", 268: "HOME", 269: "END",
  280: "CAPS LOCK", 281: "SCROLL LOCK", 282: "NUM LOCK", 283: "PRINT", 284: "PAUSE",
  330: "NUM .", 331: "NUM /", 332: "NUM *", 333: "NUM -", 334: "NUM +", 335: "NUM ENTER", 336: "NUM =",
  340: "LEFT SHIFT", 341: "LEFT CTRL", 342: "LEFT ALT", 343: "LEFT WIN", 344: "RIGHT SHIFT", 345: "RIGHT CTRL", 346: "RIGHT ALT", 347: "RIGHT WIN", 348: "MENU",
};

/** KeyboardEvent.code → GLFW-Keycode (oder null, wenn unbekannt). */
export function glfwFromEvent(e: KeyboardEvent): number | null {
  return CODE_TO_GLFW[e.code] ?? null;
}

/** Lesbarer Name eines GLFW-Keycodes. -1 = Standard (RIGHT SHIFT). */
export function glfwKeyName(code: number | null | undefined): string {
  if (code == null || code < 0) return "RIGHT SHIFT (Standard)";
  if (NAMES[code]) return NAMES[code];
  if (code >= 48 && code <= 57) return String.fromCharCode(code);
  if (code >= 65 && code <= 90) return String.fromCharCode(code);
  if (code >= 290 && code <= 313) return `F${code - 289}`;
  if (code >= 320 && code <= 329) return `NUM ${code - 320}`;
  return `KEY ${code}`;
}
