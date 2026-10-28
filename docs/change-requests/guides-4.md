1. **Need**: a guides prefs field `shortcuts: boolean` (default true) in `PrefsByOwner["guides"]` (`lib/domain/prefs.ts`) and its default in `lib/prefs.ts`.
2. **Why**: the guide reader's `]` and `[` keys are single-character shortcuts on a browse screen; WCAG 2.1.4 wants a way to turn them off, and the guides slice is `Record<string, never>` today.
3. **Proposed diff**: `guides: { shortcuts: boolean }` in `PrefsByOwner`, `guides: () => ({ shortcuts: true })` in `defaultPrefs`; Guides then reads `usePrefs("guides")` and writes `setPrefs("guides", { shortcuts })` from a menu item.
4. **Workaround in use**: the keys act only when focus is inside the guide or on the page body, never in a field, a popup, a dialog or the app nav, and the target links declare `aria-keyshortcuts`; there is no off switch yet.
5. **Unblocks**: the 2.1.4 finding in the review pass; no walkthrough step depends on it.
