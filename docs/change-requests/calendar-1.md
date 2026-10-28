1. **Need**: `lib/ai/mocks.test.ts` to accept feature tasks in the registry. Its test "covers the shared tasks and Practice's" pins the exact key list, so registering `calendar.read` (architecture 8.2) fails `pnpm test`.
2. **Why**: the Calendar import's vision path (`calendar.read`, Super VL) has to be in the registry; every other feature that adds its task hits the same assertion.
3. **Proposed diff**: `expect(Object.keys(registry)).toEqual(expect.arrayContaining(["ask", "embed", "material.read", "practice.check", "practice.generate", "practice.parse", "practice.solve"]))`, or add `"calendar.read"` to the sorted list when Calendar merges.
4. **Workaround in use**: none possible inside Calendar's paths. `calendar.read` is registered, its own iteration test in `mocks.test.ts` passes (example parses, mock parses with its output schema), and only the pinned-list assertion fails in this worktree.
5. **Unblocks**: `pnpm test` (and so the common gate) for `feat/calendar`.
