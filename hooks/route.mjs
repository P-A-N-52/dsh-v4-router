/**
 * UserPromptSubmit hook — the near-field injection point (position rule).
 *
 * Per real user message, prints ONE block to stdout (appended to context right
 * after the user message):
 *   - first message of the session: PROTOCOL_BLOCK (Reasoning Protocol + persona)
 *   - every non-continuation message: GUIDE_SIMPLE or GUIDE_DEEP + PROTOCOL_TAIL
 *
 * Gating: state.mode auto/on/off; auto selects the recipe by session model
 * (flash → w7, pro → w6c, other → silent). Fail-open everywhere.
 */

import {
  readStdinJson, extractPrompt, readState, updateState,
  modelFamily, modelFromWire, isComplexTask, shouldSuppress,
  PROTOCOL_BLOCK_FLASH, PROTOCOL_BLOCK_PRO,
  GUIDE_SIMPLE, GUIDE_DEEP, PROTOCOL_TAIL,
} from '../lib/core.mjs'

const payload = await readStdinJson()
const text = extractPrompt(payload)
if (!text.trim()) process.exit(0)

const state = readState()
const mode = ['auto', 'on', 'off'].includes(state.mode) ? state.mode : 'auto'
if (mode === 'off') process.exit(0)

const sid = typeof payload.session_id === 'string' ? payload.session_id : null
const rec = sid ? state.sessions[sid] : undefined
// SessionStart reports the config DEFAULT model; the wire log carries the
// model that actually served the last request (covers `-m` overrides and
// mid-session switches). Wire wins; recorded default is the fallback.
const recordedModel = rec && typeof rec.model === 'string' ? rec.model : null
const wireModel = sid ? modelFromWire(sid) : null
const effectiveModel = wireModel ?? recordedModel

// Recipe selection.
// - on:   force-enable; family from model, default flash.
// - auto: known non-V4 model → silent; unknown model → fail-open as flash.
let family
if (mode === 'on') {
  family = modelFamily(effectiveModel) ?? 'flash'
} else if (effectiveModel === null) {
  family = 'flash'
} else {
  family = modelFamily(effectiveModel)
  if (family === null) process.exit(0)
}

const parts = []

// First message of the session: protocol block (persona per family).
const alreadyInjected = Boolean(rec && rec.personaInjected)
if (!alreadyInjected && sid) {
  parts.push(family === 'pro' ? PROTOCOL_BLOCK_PRO : PROTOCOL_BLOCK_FLASH)
  try {
    updateState((s) => {
      const prev = s.sessions[sid] || {}
      s.sessions[sid] = { ...prev, model: prev.model ?? null, personaInjected: true }
    })
  } catch {
    // state write failed — still inject, worst case it repeats next turn
  }
}

// Per-turn near-field guide (P21: suppress on continuation messages).
if (!shouldSuppress(text)) {
  const guide = isComplexTask(text) ? GUIDE_DEEP : GUIDE_SIMPLE
  parts.push(guide + '\n' + PROTOCOL_TAIL)
}

if (parts.length > 0) process.stdout.write(parts.join('\n\n') + '\n')
process.exit(0)
