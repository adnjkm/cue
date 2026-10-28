1. **Need**: `components/cue/chat/Composer.tsx` takes a `keyShortcuts?: string` prop and writes it as `aria-keyshortcuts` on its textarea.
2. **Why**: on the note taker `/` focuses the composer from anywhere on the screen; docs/design/lecture-notes.md section 5 asks to declare each shortcut with `aria-keyshortcuts` (Pause, Flag and Jump to live already do), and the shared Composer gives callers no way to set an attribute on its textarea.
3. **Proposed diff**: `keyShortcuts?: string` in the props and `aria-keyshortcuts={keyShortcuts}` on the `textarea`.
4. **Workaround in use**: an effect in `features/lectures/NoteTaker.tsx` sets `aria-keyshortcuts="/"` on the composer's textarea after each render.
5. **Unblocks**: replacing that effect with `keyShortcuts="/"`.
