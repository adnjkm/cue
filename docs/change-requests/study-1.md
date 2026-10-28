1. **Need**: `lib/ai/mocks.test.ts` "covers the shared tasks and Practice's" must accept feature tasks, not the foundation's exact key list.
2. **Why**: registering `study.plan` (section 8.2) adds a registry key, so this one assertion fails `pnpm test` in the study worktree; every other feature that registers a task hits the same wall.
3. **Proposed diff**: `expect(Object.keys(registry)).toEqual(expect.arrayContaining(["ask", "embed", "material.read", "practice.check", "practice.generate", "practice.parse", "practice.solve"]))`, or add `"study.plan"` to the sorted list when this branch merges.
4. **Workaround in use**: none possible inside study's paths; `pnpm test` reports exactly this one failure (the `study.plan` example and mock pass the per-task check above it).
5. **Unblocks**: `pnpm test` in the gate for the study worktree.
