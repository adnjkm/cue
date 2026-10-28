1. **Need**: `sessionClock(...).stepOverMs` in `lib/domain/study.ts` should count focus time only, not Pomodoro breaks.
2. **Why**: plan steps sum to the focus minutes (section 20 item 1), so a step that spans the 25-minute break reads "Over by 5 min" while the student is on schedule.
3. **Proposed diff**: `const focus = (ms) => full cycles × focusMs + min(focusMs, remainder)`; `stepOverMs = max(0, focus(elapsedMs) − focus(s.stepSince) − stepMs)`.
4. **Workaround in use**: `features/study/model.ts` `focusMs` and `stepOverMs` compute it this way; the screen never reads `sessionClock().stepOverMs`.
5. **Unblocks**: deleting the duplicate in `features/study/model.ts` once the foundation function is right (`model.test.ts` "does not count the Pomodoro break as step time" covers it).
