# Global skill audit

Audit date: 2026-08-26.

## Result

The main context problem was not the size of each `SKILL.md` body. Skill bodies already load on demand. The recurring cost came from hundreds of overlapping descriptions, multiple client roots pointing at the same skills, generic skills competing for the same prompts, and an implicit PStack port with no Codex invocation policy.

Fleet reduces the loose catalog from 325 to 240 and exposes only 22 descriptions for automatic routing. The other 218 kept skills remain available by name with zero automatic-routing context in Cursor and Claude Code and disabled implicit invocation in Codex.

## Removed groups

The 70 removed or consolidated entries fall into three groups:

1. Cursor built-ins copied into user folders, including `automate`, `babysit`, `review`, `shell`, and the skill/rule creation helpers.
2. Broad agent behavior skills that conflict with repository instructions, including `coding-standards`, `debugging-strategies`, `planning-with-files`, `security`, and `software-architecture`.
3. Weaker duplicates replaced by a canonical skill or installed plugin, including the fragmented Go, TypeScript, Terraform, FFmpeg, React Flow, Office document, Vercel, and Zod variants.

The exact list is `skills.removed` in [`fleet.json`](fleet.json).

## Project/plugin-only groups

The 15 project/plugin-only skills were tied to a specific repository, internal product, or companion plugin. They include the duplicate Vader skills (`cloudwatch`, `performance`, and `tanstack-start-best-practices`) and internal Patent Creator, HyperFrames, Milvus, Dogfood, and video-toolkit workflows.

The exact list is `skills.projectOnly` in [`fleet.json`](fleet.json). Vader's repository copies remain under its own `.agents/skills` directory.

## Metadata repairs

Fleet normalized all folder names to match the declared skill name, including 31 Orchestra skills plus `obsidian-automation` and `pandas-data-analysis`. It also:

- quotes and shortens the `model-pruning` description so its `N:M` text is valid YAML;
- shortens the oversized `latex-document-skill` description;
- adds cross-client explicit invocation controls;
- generates Codex UI metadata and policy for every kept skill;
- strips copied dependency caches such as `node_modules` from imported skills.

## PStack assessment

The previously installed local Codex port was unsafe as a global default: all 44 skills were implicitly invocable, its cache was 37 MB because it included platform-specific dependencies, and several instructions hardcoded model and runtime assumptions.

The Aqua repository is a sound Codex adaptation. Its strongest choices are the upstream content lock, per-skill Codex policy, explicit authority boundaries, native task/subagent mappings, compatibility inventory, and installed-artifact tests. Fleet reuses that work rather than maintaining another Codex translation.

Fleet intentionally changes three parts:

- the plugin identity is `pstack` on every client;
- sticky hooks and Benny are excluded to keep activation explicit and lifecycle-neutral;
- PStack helpers remain inside the plugin namespace instead of being flattened into global skills.

The pre-existing Cursor-only `pstack-profile` skill is preserved inside the Cursor adapter. It is not a loose global skill because its files and model quota names are Cursor-specific.

This preserves PStack as a coherent workflow while preventing its principles and helpers from competing with Fleet's normal skill router.
