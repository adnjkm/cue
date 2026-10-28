1. **Need**: Practice may read `topicMatch` from `@/lib/plan`, which section 11.1 leaves out of Practice's "May read" column.
2. **Why**: Today's `+ 12 practice Qs` opens `/practice/[setId]?topic=Recursion & tree traversal`, and the bar must narrow to the topics `blockMaterials` counted with `topicMatch`, or the count and the filtered tiles disagree.
3. **Proposed diff**: add `@/lib/plan` (topicMatch only) to Practice's row in docs/architecture.md 11.1, or move `topicMatch` into `lib/domain` and re-export it from `@/lib/plan`.
4. **Workaround in use**: `features/practice/PracticeScreen.tsx` imports `topicMatch` from `@/lib/plan`; lint allows it, the table does not.
5. **Unblocks**: Today's [integrated] path from `+ 12 practice Qs` to a filtered practice set.
