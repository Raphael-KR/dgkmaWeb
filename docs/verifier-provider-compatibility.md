# Verifier provider compatibility

Todo 1 verified the required `codex-app` project/thread lifecycle with the approved
project, model, reasoning effort, worktree target, and exact nonce response.

The current callable API uses this minimal fail-closed compatibility contract:

- `create_thread` initially returns `clientThreadId` and `hostId` while setup is
  asynchronous. `list_threads` must resolve exactly one ready `threadId` with the
  same project, prompt/worktree context, client ID, and host. Zero or multiple
  matches, any context mismatch, or a queued-only task that never becomes ready
  fails closed.
- `wait_threads.timeoutMs` is currently capped at 120000. The orchestrator may
  repeat bounded waits only for that same ready thread. Timeout or nonterminal
  state fails; completion is never inferred from elapsed time.
- `read_thread` must resolve the same thread and host, preserve the exact prompt,
  report terminal completion, and return the exact nonce message. A thread,
  prompt, project, working-directory, terminal-state, or nonce mismatch fails.

The capability receipt is `dgkma-provider-capability-v2`. The PII-safe original
canonical projection stays in the attempt directory at
`provider-capability-projection.json`; the separate support schema and descriptor
are `docs/provider-contracts/provider-capability-projection.schema.json` and
`docs/verifier-provider-capability-projection.json`. The harness validates their
closed shapes and independently recomputes the create request, list-projects,
create response, list-threads, wait response, read response, projection, and
receipt digests. These two support files are outside the frozen exact twelve-file
verifier inventory.

The successful Todo 1 probe already completed this full lifecycle. Revalidation
reuses its recorded PII-safe projection and creates no new provider task. No
repository fixture can substitute for the external resolution.
