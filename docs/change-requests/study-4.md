1. **Need**: `TimerBar` in `components/cue/bits.tsx` should fill a share of its own track, so a caller can size the track.
2. **Why**: the study session's 375 layout (docs/design/study-session.md section 5) runs the timer track at full width; TimerBar draws its fill as `round(fraction × 160)px`, so a wider track shows the wrong fill.
3. **Proposed diff**: fill `style={{ width: \`round(${pct}%, 1px)\` }}` (with `w-(--fill)` and `--fill: ${pct}%` as the fallback where `round()` is unsupported), keep `w-40` as the default width and let `className` override it. At 160px this still fills Paper's whole 46px at 29%.
4. **Workaround in use**: `SessionTrack` in `features/study/parts.tsx` is that component, used by the study toolbar at every width.
5. **Unblocks**: deleting `SessionTrack` and importing `TimerBar` again; `.verify` measures the same 160×4 track and 46px fill at 1440.
