1. **Need**: the `Composer` textarea in `components/cue/chat/Composer.tsx` should be 16px on touch devices.
2. **Why**: docs/design/study-session.md section 5 (375 row) asks for it, because iOS Safari zooms the page when a field under 16px takes focus, and every screen that hosts the composer on a phone hits the same zoom.
3. **Proposed diff**: add `pointer-coarse:text-[16px]` to the textarea's class list, after `text-sm`; line height stays `leading-5`, and fine-pointer layouts keep Paper's 13px.
4. **Workaround in use**: `features/study/AskPanel.tsx` passes `pointer-coarse:[&_textarea]:text-[16px]` in the Composer's `className`.
5. **Unblocks**: deleting that class from AskPanel, and no zoom on focus for the other workstreams' composers.
