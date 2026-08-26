---
name: pstack-profile
description: Switch the active pstack model profile between cursor (Grok-only, Cursor Models quota) and other (GPT/Claude mix, Other Models quota). Use when the user says /pstack-profile, switch pstack, use cursor models, use grok-only, use other models, or asks to run a feature/bug-fix/arena on GPT or Claude vs Grok.
disable-model-invocation: true
---

# pstack-profile

Copy a stored profile over the live pstack rule. pstack skills read `~/.cursor/rules/pstack-models.mdc`. A workspace copy at `.cursor/rules/pstack-models.mdc` must stay in sync when it exists.

## Profiles

- `cursor`: every role and 4-way panel is `cursor-grok-4.6-high-fast`. Uses Cursor Models quota.
- `other`: the previous GPT/Claude mix (`gpt-5.6-sol-xhigh`, `claude-fable-5-thinking-high`, `claude-opus-5-thinking-high`, plus Grok on a few roles). Uses Other Models quota or on-demand spend.

Sources live next to this skill:

- `profiles/cursor.mdc`
- `profiles/other.mdc`

## Steps

1. Resolve the profile. `cursor` / `grok-only` / `grok` → `cursor`. `other` / `gpt` / `claude` / `full models` → `other`. If still unclear, ask.

2. Read `profiles/<profile>.mdc` from this skill directory.

3. Overwrite `~/.cursor/rules/pstack-models.mdc` with that file's full contents.

4. If the current workspace has `.cursor/rules/pstack-models.mdc`, overwrite it with the same body. Keep that file's `description` line if it names the repo; keep every role line identical to the user rule.

5. Tell the user which profile is now active, that new sessions pick it up, and that this session already has the old mapping in context so a new chat is the clean cutover.
