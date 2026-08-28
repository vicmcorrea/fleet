---
name: setup-pstack
description: Configure which models pstack uses per role in Claude Code. Detects every model the active session can delegate to, including models exposed through an LLM gateway, and writes a per-role override file that the user can include from their CLAUDE.md. Use for /setup-pstack, "configure pstack models", or changing pstack's model choices.
disable-model-invocation: true
---

# Setup pstack

Write `~/.claude/pstack-models.md`, a per-role model override sheet you include from your global `CLAUDE.md`. Each pstack skill names a default model inline; the override sheet is the layer that adapts those defaults to the models you actually have access to.

The client determines the configuration location. A Claude Code session still uses this Claude override sheet when its inference is routed through CLIProxyAPI or another gateway to Claude, GPT, or other model providers. Treat every model reachable in the active session as one pool; do not create separate provider profiles.

Claude Code has no auto-applied "rules" mechanism like Cursor's `.mdc`. Inclusion is explicit: the user adds a line to `~/.claude/CLAUDE.md` (or their project `CLAUDE.md`) such as:

```text
@~/.claude/pstack-models.md
```

so the file is loaded as context for every session.

## Steps

### 1. Detect available models

First inspect `CLAUDE_CODE_SUBAGENT_MODEL`. When it is set to a real model slug, it overrides every per-invocation PStack model choice. Explain the conflict and stop before writing; the user must start a new Claude Code session with the variable unset or set to `inherit`. Do not edit their shell configuration automatically.

Enumerate the exact model values that an `Agent` subagent can use in this session. Use the active Claude Code `Agent` schema and any observable gateway catalog. Do not filter the catalog by vendor prefix: a CLIProxyAPI session may legitimately expose `claude-*` and `gpt-*` models together. A catalog entry is only a candidate. Some Claude Code surfaces accept only `fable`, `opus`, `sonnet`, and `haiku` at invocation time even when the gateway exposes full GPT model IDs.

When a full gateway model ID is rejected but a Claude alias can be routed to it, validate the alias end to end and write the alias—not the rejected full ID—to the PStack sheet. The provider-scoped environment owns the alias-to-model route. Never read or print gateway credentials. For the T3 Code ClaudeX preset with Fable as parent, GPT-5.6 Sol as implementer, and GPT-5.6 Terra as explorer, read [`references/claudex-fable-gpt56.md`](references/claudex-fable-gpt56.md).

Ask the user to confirm or paste any additional slugs when the observable catalog is incomplete. Never write a real slug you have not confirmed is usable in this session. The aliases `inherit-parent` and `auto` are always valid even though they are not detected slugs; both mean the role runs on the parent session's model, which the `Agent` call expresses by omitting `model`.

### 2. Load current state

If `~/.claude/pstack-models.md` already exists, read it and treat its values as the current choices. Otherwise use the rule shape in step 5 as a fallback, then adapt it to the detected pool before presenting it.

When multiple provider families are available, build one mixed recommendation. Prefer the strongest suitable instruction-following model for difficult implementation, a balanced model for ordinary work and exploration, a fast model for high-fan-out workers, and strong judgment models for prose and synthesis. For the recognized GPT-5.6 family, Sol is the strongest tier, Terra is the balanced tier, and Luna is the fast tier. Panel roles should span distinct providers and tiers when possible. Do not silently produce a Claude-only recommendation merely because Claude Code is the client, and do not silently produce a GPT-only recommendation merely because the parent session runs on GPT.

Respect an explicit parent/architect preference as a stronger constraint than generic tier balancing. If the user wants every session to start on Fable, wants GPT-5.6 Sol for implementation, and wants to keep token-heavy exploration off Fable, use the tested ClaudeX preset rather than `inherit-parent` or raw GPT model values.

For an existing configuration, preserve current choices until the user confirms a change, but highlight newly detected provider families and offer a mixed replacement.

### 3. Map and confirm

Show the detected models, grouping provider families only when the family is observable from the model ID or catalog metadata. Then show every role with its current or recommended model, marking any real slug not in the detected set as needing a choice. Ask whether to accept as-is or change specific roles, offering the full detected pool plus `inherit-parent` and `auto` as the options. Prefer `AskUserQuestion` over free text. This produces one Claude Code mapping, not a named provider profile.

For panel roles (how critics, arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose model family differs from the parent's when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every value written must be accepted by the active session's `Agent` surface; `inherit-parent` and `auto` always pass. For an alias routed through a gateway, run one parent-to-subagent probe and verify the reported child model is the intended gateway model before writing. If a chosen value is unavailable or the alias resolves to the wrong model, stop and ask again. An override pointing at a model the user cannot use breaks every delegation that reads it. A fixed `CLAUDE_CODE_SUBAGENT_MODEL` makes successful per-role validation impossible and remains a hard stop.

### 5. Write the override sheet

Write `~/.claude/pstack-models.md` with the shape below. The values shown are the Claude-only fallback, not a restriction on allowed providers. Replace them with the confirmed selection; when Claude and GPT families are both usable, the written result should normally contain both unless the user chooses otherwise. Overwrite the whole file so re-runs stay idempotent.

```markdown
# pstack model configuration

Per-role model overrides for pstack skills. Each pstack SKILL.md names a default model inline; the values here override those defaults. Delete a line to fall back to the skill default. A value of `inherit-parent` or `auto` runs that role on the parent session's model (the `Agent` call omits `model`); an alias entry in a panel list still counts toward that panel's fan-out.

feature, refactoring: claude-opus-4-8
bug-fix: claude-opus-4-8
perf-issue: claude-opus-4-8
hillclimb: claude-opus-4-8
judgment and prose: claude-opus-4-8
how explorer: claude-opus-4-8
how explainer: claude-opus-4-8
how critics: claude-opus-5, claude-fable-5, claude-sonnet-5, claude-haiku-4-5
why investigators: claude-opus-4-8
why synthesizer: claude-opus-4-8
reflect tooling: claude-opus-4-8
reflect judgment, divergent, synthesizer: claude-opus-4-8
arena runners: claude-opus-5, claude-fable-5, claude-sonnet-5, claude-haiku-4-5
arena cross-judge pool: claude-opus-5, claude-fable-5, claude-sonnet-5
swarm workers: claude-opus-4-8
architect runners: claude-opus-5, claude-fable-5, claude-sonnet-5, claude-haiku-4-5
interrogate reviewers: claude-opus-5, claude-fable-5, claude-sonnet-5, claude-haiku-4-5
```

### 6. Wire it in

If `~/.claude/CLAUDE.md` does not already include `~/.claude/pstack-models.md`, append the `@~/.claude/pstack-models.md` line so it loads on every session. If the user prefers project scope, add the include to the project's `CLAUDE.md` instead.

### 7. Confirm

Tell the user where the override was written and how it loads (via the `@` include in CLAUDE.md). Re-running this skill updates the override sheet.
