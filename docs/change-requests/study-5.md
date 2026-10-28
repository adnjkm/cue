1. **Need**: two `Composer` details in `components/cue/chat/Composer.tsx`: Escape in the textarea blurs it (and stops a streaming answer), and the Send arrow draws at Paper's 14px.
2. **Why**: docs/design/study-session.md section 5 lists "Esc, composer: blur the composer; Esc while streaming stops the answer". Paper draws a 14px arrow, but the `icon` button size applies `[&_svg:not([class*='size-'])]:size-4`, so `ArrowUp size={14}` renders at 16px.
3. **Proposed diff**: in the textarea's `onKeyDown`, `if (e.key === "Escape") { if (busy) chat.stop(); else e.currentTarget.blur(); }` without `preventDefault`, so an enclosing Sheet still closes on the same key; give the glyph `className="size-3.5"`.
4. **Workaround in use**: none; the study screen uses Composer as is.
5. **Unblocks**: the design doc's composer Escape row and a pixel match of the Send glyph against artboard 55-0.
