# Fleet repository instructions

Fleet is the source of truth for personal agent skills and client-specific plugin adapters.

- Keep loose skills portable across Codex, Cursor, and Claude Code.
- Put automatic-routing policy in both `SKILL.md` and `agents/openai.yaml`.
- Default new workflows to explicit-only unless they are narrow, common, and unambiguous.
- Do not add loose copies of client-bundled skills or plugin-provided skills.
- Keep PStack namespaced. Never link its skills into the loose global catalog.
- Pin third-party adapter sources and preserve their licenses and provenance.
- Run `npm test` and `npm run doctor` after changing the catalog, installer, or adapters.
- Do not commit machine-specific symlinks, caches, credentials, or rollback snapshots.
