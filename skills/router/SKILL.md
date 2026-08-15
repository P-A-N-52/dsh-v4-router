---
name: router
description: How the dsh-v4-router plugin works — model-gated reasoning-mode routing for DeepSeek V4 Flash/Pro (w7/w6c persona + Reasoning Protocol + per-turn near-field guidance). Read when the user asks about the router, its controls, or wants to verify/tune it.
---

# dsh-v4-router

Ports the measured optimums of [dsh-router-standard](https://github.com/yjh051108/dsh-router-standard) (P11/P23/P24/P28) into kimi-code via hooks. No tools, no system-prompt changes — everything is near-field injection after the user message.

## Mechanism

```
SessionStart hook          UserPromptSubmit hook (every user message)
  session_id → model  ──►    model evidence: wire.jsonl tail (real serving model)
                             wins; SessionStart only reports the config default.
                             auto mode: wire says flash/v4f → w7 recipe |
                             wire says pro/v4p → w6c recipe (zero anchors) |
                             wire says non-V4 → silent |
                             no wire yet (message #1) → fail-open inject
                             every message: GUIDE_SIMPLE | GUIDE_DEEP (+ protocol tail)
                             continuation/short msgs: guide suppressed (P21)
```

## Fixed texts (verbatim ports — do not reword)

- **Reasoning Protocol** (user-mandated, HIGHEST PRIORITY): think strictly in English, always start with "We need..."; final answer in the user's language. Present in the first-message block AND as a tail line on every guide.
- **w7 (flash)**: `You are a helpful assistant.` + classify instruction + recall anchor + anti-runaway anchor + `Think deeply first, then produce.`
- **w6c (pro)**: `You are a helpful software engineer assistant.` + classify instruction. NO anchors (P24: anchors hurt Pro).
- **GUIDE_SIMPLE** / **GUIDE_DEEP**: per-message, dispatched by `isComplexTask` (>120 chars or architecture keywords). GUIDE_DEEP ends every reasoning block with a decision or an information need (P30 decision-closure).

## Controls

- `/dsh-v4-router:on` / `:off` / `:auto` / `:status` (agent-executed)
- Manual: edit `~/.kimi-code/dsh-v4-router.state.json` → `"mode": "auto|on|off"`
- Full disable: `/plugins disable dsh-v4-router`

## Verify it is active

In a session with a V4 Flash/Pro model, send a complex task and check: reasoning starts with "We need..." in English; no environment-check tool calls (echo/whoami/uname); final reply in the user's language.

## Known caveats (measured, do not "fix")

- P21: on related task chains (same file, continuous edits) all guidance is negative — the hook suppresses continuation messages; do not remove that guard.
- P22: anchors are reminders, not format requirements — keep wording advisory.
- Unconditional "We need..." is a user-mandated experiment beyond the measured task-conditional variant (P15). Rollback: `/dsh-v4-router:off`.
