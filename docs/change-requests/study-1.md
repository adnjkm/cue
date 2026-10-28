1. **Need**: `lib/ai/mocks.test.ts` "covers the shared tasks and Practice's" must accept feature tasks, not the foundation's exact key list.
2. **Why**: registering `study.plan` (section 8.2) adds a registry key, so this one assertion fails `pnpm test` in the study worktree; every other feature that registers a task hits the same wall.
3. **Proposed diff**: the prefix check in `guides-1` (calendar-1, lectures-1 and today-1 ask for the same): keep the shared names as `expect.arrayContaining([...])` and require every other key to start with a `WORKSTREAMS[].tasks` prefix, so `study.plan` passes and an unprefixed task still fails.
4. **Workaround in use**: none possible inside study's paths; `pnpm test` reports exactly this one failure (the `study.plan` example and mock pass the per-task check above it).
5. **Unblocks**: `pnpm test` in the gate for the study worktree.
