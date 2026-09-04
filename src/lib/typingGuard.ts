/**
 * Typing guard for realtime reloads.
 *
 * Every portal view subscribes to Supabase realtime and reloads its data when a
 * row changes — including the echo of its OWN debounced/blur auto-saves. If that
 * reload lands while someone is still typing, any box whose value is (re)derived
 * from props snaps back to the saved value and the keystrokes since are lost
 * ("things get deleted all the time"). Instead of chasing every box, reloads
 * wait until the user is idle: no keystroke for `idleMs` AND no text field
 * focused. A hard cap (`maxWaitMs`) guarantees the reload still happens even if
 * a cursor is left sitting in a box.
 */

let lastInputAt = 0;
if (typeof document !== "undefined") {
  const bump = () => { lastInputAt = Date.now(); };
  document.addEventListener("keydown", bump, true);
  document.addEventListener("input", bump, true);
  document.addEventListener("compositionstart", bump, true);
}

const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "hidden", "image",
]);

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUT_TYPES.has(((el as HTMLInputElement).type || "text").toLowerCase());
  return (el as HTMLElement).isContentEditable === true;
}

/** True while the user is typing or has a text box focused. */
export function isUserTyping(idleMs = 2500): boolean {
  if (typeof document === "undefined") return false;
  if (Date.now() - lastInputAt < idleMs) return true;
  return isTextField(document.activeElement);
}

export type IdleReloader = {
  /** Ask for a reload; coalesces repeated asks and waits for the user to go idle. */
  request: () => void;
  /** Cancel anything pending (call on unmount). */
  cancel: () => void;
};

/**
 * Wrap a reload function so it runs only when the user is idle.
 *   debounceMs — coalesce bursts of realtime events (like the old setTimeout).
 *   idleMs     — how long since the last keystroke counts as idle.
 *   maxWaitMs  — never defer longer than this (a cursor parked in a box).
 */
export function createIdleReloader(
  fn: () => void | Promise<void>,
  opts: { debounceMs?: number; idleMs?: number; maxWaitMs?: number } = {},
): IdleReloader {
  const debounceMs = opts.debounceMs ?? 1500;
  const idleMs = opts.idleMs ?? 2500;
  const maxWaitMs = opts.maxWaitMs ?? 120_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstAskAt: number | null = null;

  const attempt = () => {
    timer = null;
    const waited = firstAskAt ? Date.now() - firstAskAt : 0;
    if (isUserTyping(idleMs) && waited < maxWaitMs) {
      timer = setTimeout(attempt, 500);
      return;
    }
    firstAskAt = null;
    void fn();
  };

  return {
    request: () => {
      if (firstAskAt === null) firstAskAt = Date.now();
      if (timer) clearTimeout(timer);
      timer = setTimeout(attempt, debounceMs);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      firstAskAt = null;
    },
  };
}
