1. **Need**: `useChat.send` in `lib/chat/use-chat.ts` should stamp a new message after the thread's newest one (`at = max(Date.now(), last.at + 1)`), or `lib/sample/core.ts` should date the Paper study chat before `ctx.now`.
2. **Why**: the sample chat is stamped Tuesday 10:38 and 10:39 of the current week, and the thread sorts by `[thread+at]`, so a question asked on the sample review any time before then (Monday, or Tuesday 10:30) lands above the seeded conversation instead of under it.
3. **Proposed diff**: in `send`, `const at = Math.max(Date.now(), (messages.at(-1)?.at ?? 0) + 1) as EpochMs` for the user row, and the same rule in `settle` for the reply.
4. **Workaround in use**: none in study's paths; the walkthrough asks at 10:43, after the seeded messages, so it does not hit this.
5. **Unblocks**: a correct thread order on the sample review for anyone who opens it before Tuesday 10:39 of the sample week.
