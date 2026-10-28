1. **Need**: `docs/design/calendar.md` section 5 (empty state) to name the secondary action `Try the sample semester` instead of `Use sample semester`.
2. **Why**: the empty state uses the shared `SampleSemesterButton` from `components/cue`, whose label is `Try the sample semester`. Architecture section 9 and the Today empty state (architecture 13.3 Today item 1, `today.md` "No calendar yet") use the same words. A local Calendar button with different words would give one action two names.
3. **Proposed diff**: in section 5, entry point 2, replace `Use sample semester` with `Try the sample semester (the shared SampleSemesterButton, as on Today)`.
4. **Workaround in use**: Calendar renders the shared button unchanged, so the label is `Try the sample semester`.
5. **Unblocks**: the empty state check against the design doc.
