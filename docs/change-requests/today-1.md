1. **Need**: `lib/ai/mocks.test.ts` "covers the shared tasks and Practice's" to accept feature tasks beyond the seven it pins.
2. **Why**: section 8.2 registers `today.brief` (and every other feature's tasks) through `lib/ai/registry.ts`; the exact `toEqual` list fails `pnpm test` the moment any feature defines a task, so no feature worktree can pass the gate.
3. **Proposed diff**: `expect(Object.keys(registry)).toEqual(expect.arrayContaining(["ask", "embed", "material.read", "practice.check", "practice.generate", "practice.parse", "practice.solve"]))`, and optionally assert every key's prefix is in `WORKSTREAMS.map((w) => w.tasks)`.
4. **Workaround in use**: none possible inside `features/today/**`; `today.brief` is registered and its own example and mock pass the per-task test, so only this one assertion fails in the worktree.
5. **Unblocks**: `pnpm test` in the gate for feat/today (and the same failure in every feature that defines a task).
