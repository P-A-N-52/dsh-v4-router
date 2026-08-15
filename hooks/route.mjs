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
  PROTOCOL_BLOCK_FLASH, PROTOCOL_BLOCK_PRO, CORRECTION_FLASH, CORRECTION_PRO,
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

// Recipe selection.
// - on:   force-enable; family from model, default flash.
// - auto: wire evidence (real serving model) decides strictly; on the FIRST
//         message no wire exists yet — SessionStart only reports the config
//         DEFAULT model, which cannot see a per-session pick, so we fail open
//         toward injection (preferring a V4 hint when the default is one).
//         From message #2 the wire corrects any wrong call.
let family
if (mode === 'on') {
  family = modelFamily(wireModel ?? recordedModel) ?? 'flash'
} else if (wireModel !== null) {
  family = modelFamily(wireModel)
  if (family === null) process.exit(0) // positive evidence: non-V4 model
} else {
  family = modelFamily(recordedModel) ?? 'flash'
}

const parts = []

// First message of the session: protocol block (persona per family).
const alreadyInjected = Boolean(rec && rec.personaInjected)
const givenFamily = rec && typeof rec.family === 'string' ? rec.family : null
if (!alreadyInjected && sid) {
  parts.push(family === 'pro' ? PROTOCOL_BLOCK_PRO : PROTOCOL_BLOCK_FLASH)
  try {
    updateState((s) => {
      const prev = s.sessions[sid] || {}
      s.sessions[sid] = { ...prev, model: prev.model ?? null, personaInjected: true, family }
    })
  } catch {
    // state write failed — still inject, worst case it repeats next turn
  }
} else if (sid && wireModel !== null && givenFamily !== null && family !== givenFamily) {
  // The first block was chosen without wire evidence; the real serving model
  // turned out to be the other family. Correct course once.
  parts.push(family === 'pro' ? CORRECTION_PRO : CORRECTION_FLASH)
  try {
    updateState((s) => {
      const prev = s.sessions[sid] || {}
      s.sessions[sid] = { ...prev, family }
    })
  } catch {}
}

// Per-turn near-field guide (P21: suppress on continuation messages).
if (!shouldSuppress(text)) {
  const guide = isComplexTask(text) ? GUIDE_DEEP : GUIDE_SIMPLE
  parts.push(guide + '\n' + PROTOCOL_TAIL)
}

if (parts.length > 0) process.stdout.write(parts.join('\n\n') + '\n')
process.exit(0)
