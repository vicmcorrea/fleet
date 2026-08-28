# ClaudeX Fable, Sol, and Terra routing

Use this preset when T3 Code runs Claude Code through CLIProxyAPI, the user wants every parent session to start on Fable, GPT-5.6 Sol should implement, and GPT-5.6 Terra should absorb token-heavy exploration that does not justify Fable.

## Routing contract

- Set Claude Code's default parent model to `fable`.
- Leave `CLAUDE_CODE_SUBAGENT_MODEL` unset.
- In the ClaudeX provider environment, set `ANTHROPIC_DEFAULT_SONNET_MODEL` to `gpt-5.6-sol`.
- In the same provider environment, set `ANTHROPIC_DEFAULT_OPUS_MODEL` to `gpt-5.6-terra`.
- Keep the `haiku` alias untouched and do not use it in the shared PStack mapping.
- Pass only `fable`, `sonnet`, or `opus` in PStack `Agent` calls. Never pass raw GPT-5.6 IDs when the active `Agent` schema rejects them.
- Full GPT models may remain available in T3 Code's parent-model selector, but they are not the PStack dispatch values.

The aliases are deliberately provider-scoped. Native Claude Code sessions resolve `sonnet` to native Sonnet and `opus` to native Opus, so the shared mapping never selects Haiku there. ClaudeX instead routes `sonnet` workers to Sol and `opus` explorers to Terra through CLIProxyAPI.

## Role policy

- Fable owns architecture, ambiguous decisions, explanation, synthesis, and final judgment.
- Sol owns implementation, debugging, performance work, and technically demanding code changes.
- Terra owns broad codebase exploration, historical investigation, and tooling analysis where the work is context-heavy but does not require the strongest judgment model.
- Mixed panels use Fable, Sol, and Terra. Architect remains Fable-only even when other panels are mixed.

## PStack mapping

```markdown
# pstack model configuration

Shared native/ClaudeX preset: parent sessions start on Fable. In ClaudeX, `sonnet` routes to `gpt-5.6-sol` for implementation and `opus` routes to `gpt-5.6-terra` for token-heavy exploration and tooling analysis. In native Claude, those slots remain native Sonnet and Opus. `fable` owns architecture, explanation, synthesis, and final judgment. PStack never selects `haiku`.

feature, refactoring: sonnet
bug-fix: sonnet
perf-issue: sonnet
hillclimb: sonnet
judgment and prose: fable
how explorer: opus
how explainer: fable
how critics: fable, sonnet, opus
why investigators: opus
why synthesizer: fable
reflect tooling: opus
reflect judgment, divergent, synthesizer: fable
arena runners: fable, sonnet, opus
arena cross-judge pool: fable
swarm workers: sonnet
architect runners: fable, fable
interrogate reviewers: fable, sonnet, opus
```

Two `fable` entries for architect runners are intentional. Architect requires at least two isolated candidates; duplicate entries produce two independent Fable runs without assigning architecture to an implementation or exploration model.

## Verification

Run both probes through the ClaudeX provider:

1. Start a Fable parent and spawn one `general-purpose` subagent with `model: sonnet`. Model usage must record `claude-fable-5` for the parent and `gpt-5.6-sol` for the child.
2. Start a Fable parent and spawn one `general-purpose` subagent with `model: opus`. Model usage must record `claude-fable-5` for the parent and `gpt-5.6-terra` for the child.

A response that merely succeeds without reporting the routed child model is insufficient proof.
