# Change requests

A feature that needs a shared change writes `docs/change-requests/<workstream>-<n>.md`, one file per request, so requests never conflict as text. Keep working with a local workaround; the integrator lands accepted requests on `main` as small commits and every worktree rebases.

Each file has five lines:

1. **Need**: the table, index, field on a shared type, dependency, shadcn component or `href` you need.
2. **Why**: the screen or step that needs it.
3. **Proposed diff**: the exact type, index, field, package, component or builder.
4. **Workaround in use**: what your worktree does until it lands.
5. **Unblocks**: the walkthrough step or test that passes once it lands.

You do not need a request to add optional fields to your own payload file (`lib/domain/payload/<you>.ts`) or rows to your own sample fragment (`lib/sample/<you>.ts`).
