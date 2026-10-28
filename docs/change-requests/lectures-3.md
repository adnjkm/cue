1. **Need**: `components/cue/chat/Composer.tsx` draws the send button at full ink while the box is empty, and dims it only when asking is blocked (budget).
2. **Why**: Paper 22E-0 shows the note taker's empty composer with an ink send button; the shared Composer disables it on empty input, so it renders at 40% opacity and the lectures-live shot differs from the artboard at x 915, y 499 (also true for Study's 21L-0).
3. **Proposed diff**: send `Button` gets `disabled={blocked}` and `aria-disabled={!text.trim() || undefined}` instead of `disabled={!text.trim() || blocked}`; `submit()` already ignores empty text, so a click on an empty box stays a no-op and screen readers still hear it as unavailable.
4. **Workaround in use**: none inside lectures paths; the note taker passes its inline `Composer` through unchanged and the live screenshot keeps the dimmed button.
5. **Unblocks**: an exact match of `lectures-live-1440.png` against Paper 22E-0 in the Paper judge.
