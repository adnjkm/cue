1. **Need**: `sourceLabel(ref, "meta")` in `lib/sources.ts` to name the guide for a `section` ref, as `ECO101 study guide`.
2. **Why**: a Practice resource row shows title over meta, and for a quiz written from a guide section both lines read `Price elasticity of demand`.
3. **Proposed diff**: `case "section": return style === "meta" ? \`${ref.courseId} study guide\` : ref.title;` with a `lib/sources.test.ts` case for it.
4. **Workaround in use**: `ResourceRow` in `features/practice/parts.tsx` builds that meta itself for section refs.
5. **Unblocks**: the `Price elasticity of demand / ECO101 study guide` resource assertion in `scripts/e2e/steps/practice.mjs` keeps passing after the workaround is deleted.
