1. **Need**: `components/cue/TranscriptLine.tsx` writes a machine-readable duration on its `time` element: `dateTime={`PT${Math.floor(atMs / 60000)}M${Math.floor(atMs / 1000) % 60}S`}`.
2. **Why**: docs/design/lecture-notes.md section 5 (accessibility) asks for `<time datetime="PT33M20S">33:20</time>` on every transcript stamp; the shared line renders `<time>` with no `dateTime`, which is invalid for a value like `33:20`.
3. **Proposed diff**: add the `dateTime` attribute above to the `time` element in `TranscriptLine`; no prop changes.
4. **Workaround in use**: saved notes' key-point stamps (rendered by lectures) carry the attribute; transcript lines from the shared component do not.
5. **Unblocks**: valid `time` markup on the note taker, saved notes and Study's transcript moment.
