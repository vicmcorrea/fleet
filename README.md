# Fleet

Fleet is the source of truth for Victor's portable agent skills and client-specific plugin adapters. It replaces ad hoc copies under `~/.agents`, `~/.claude`, `~/.cursor`, and `~/.codex` with one versioned catalog.

## Catalog

The original global inventory contained 325 skills. Fleet classifies every one exactly once:

| Classification | Count | Behavior |
|---|---:|---|
| Implicit | 22 | The client may select the skill from a narrow task match. |
| Explicit-only | 218 | Nothing enters the model context until the user invokes it. |
| Project/plugin-only | 15 | Removed from the global catalog; keep it with its owning repository or plugin. |
| Removed/consolidated | 70 | Replaced by client built-ins, first-party plugins, or a stronger canonical skill. |

[`fleet.json`](fleet.json) is the reviewable classification. [`catalog.lock.json`](catalog.lock.json) records the installed source path and hash of every kept skill.

Explicit-only is encoded twice so it behaves consistently:

- `disable-model-invocation: true` for Cursor and Claude Code.
- `policy.allow_implicit_invocation: false` in `agents/openai.yaml` for Codex.

## Discovery layout

`npm run install` creates a rollback snapshot and installs this layout:

```text
~/.agents/skills  -> <fleet>/skills       Codex and Cursor
~/.claude/skills  -> <fleet>/skills       Claude Code
~/.cursor/skills                           empty duplicate root
~/.codex/skills/.system                    Codex-managed skills only
```

Cursor scans both `.agents` and compatibility roots. Pointing the two required user roots at the same real directory gives every local client the same files while removing the old `.cursor/skills` and `.codex/skills` mirrors.

The installer moves the previous roots to `~/.fleet/backups/<timestamp>/`. It does not delete them.

## PStack

PStack cannot be one byte-identical plugin across all clients because its workflows name host-specific tools, subagents, model selectors, task history, and lifecycle features. Fleet therefore pins three native adapters under one `pstack` namespace:

- Codex uses the audited [Aqua Codex adapter](https://github.com/Aqua-123/pstack-for-codex).
- Cursor uses the verified [upstream PStack plugin](https://github.com/cursor/plugins/tree/main/pstack).
- Claude Code uses the maintained [Claude port](https://github.com/michael-denyer/pstack-claude).

Fleet applies one policy to all three: PStack is namespaced and explicit-only. It is never copied into the loose skill catalog. Its internal principles, `unslop`, and TypeScript helper stay inside the namespace because `poteto-mode` depends on them; namespacing prevents them from colliding with global equivalents.

Fleet also removes PStack auto-fire hooks. Codex's dormant Benny automation pack is excluded. Claude's command trampolines are removed so the actual skills can be user-invoked directly without the command/skill collision documented by that port.

Invoke the mode with `$pstack:poteto-mode` in Codex or `/pstack:poteto-mode` in Cursor and Claude Code.

## Install

Fleet supports macOS and Linux. It requires Git, Node.js 20 or newer, and the client CLIs you use.

```bash
git clone https://github.com/vicmcorrea/fleet.git ~/code/fleet
cd ~/code/fleet
npm test
npm run install
node scripts/fleet.mjs install-plugins
npm run doctor
```

Restart Codex and Cursor after installation. Claude Code watches personal skill changes, but a restart is still recommended after installing the plugin.

The file installer is idempotent. The plugin installer replaces any other installed Codex or Claude plugin named `pstack`, which prevents namespace conflicts. Cursor loads the Fleet adapter from `~/.cursor/plugins/local/pstack`; disable the marketplace copy in Cursor's Customize panel if the UI still reports both sources.

## Restore

Restore the most recent pre-Fleet snapshot:

```bash
npm run restore
```

Or restore a specific snapshot shown by `~/.fleet/state.json`:

```bash
node scripts/fleet.mjs restore <backup-id>
```

Restore refuses to overwrite a path that changed after installation.

## Maintenance

```bash
npm run validate
npm test
npm run doctor
```

To re-import the audited loose catalog from an existing skills directory:

```bash
node scripts/fleet.mjs import-current --source /path/to/skills --force
```

To refresh a PStack source, replace its adapter directory from the pinned upstream, update the commit in `fleet.json`, then run:

```bash
node scripts/fleet.mjs prepare-pstack
npm test
```
