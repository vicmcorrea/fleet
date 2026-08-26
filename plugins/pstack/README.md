# Fleet PStack adapters

Fleet keeps one `pstack` namespace but uses a host-native adapter for each client:

| Client | Source | PStack baseline | Fleet policy |
|---|---|---:|---|
| Codex | Aqua-123/pstack-for-codex | 0.14.3 | Codex-native tools, explicit-only, no sticky hook or Benny pack |
| Cursor | cursor/plugins/pstack | 0.14.3 | Verified upstream package with every skill explicit-only, plus the existing `pstack-profile` switcher |
| Claude Code | michael-denyer/pstack-claude | 0.14.2 | Claude-native port, with auto-fire hooks and command trampolines removed |

The adapters are deliberately separate. PStack names host tools, model selectors, task history, agents, and lifecycle primitives directly, so one byte-identical skill tree would either be wrong on two clients or grow a large runtime-translation prompt.

All PStack skills are namespaced and user-invoked. That keeps PStack's internal principles, TypeScript guidance, and prose cleanup helpers available to `poteto-mode` without competing with Fleet's loose global skills. Invoke PStack as `$pstack:poteto-mode` in Codex, `/pstack:poteto-mode` in Claude Code, or `/pstack:poteto-mode` in Cursor.

Source commits and upstream versions are pinned in [`fleet.json`](../../fleet.json). Run `node scripts/fleet.mjs prepare-pstack` after refreshing an adapter, then run the full validation suite.
