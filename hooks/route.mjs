/**
 * UserPromptSubmit hook — the near-field injection point (position rule).
 *
 * Per real user message, prints blocks to stdout (appended right after the
 * user message):
 *   - first message: FIRST_BLOCK (Reasoning Protocol only — family-neutral)
 *   - once the wire reveals the model family: persona block (w7 / w6c)
 *   - family flip mid-session: one correction block
 *   - every non-continuation message: GUIDE_SIMPLE or GUIDE_DEEP + tail
 *
 * Why the persona is deferred: at message #1 there is NO reliable model
 * signal (SessionStart reports the config default; the wire log is written
 * when the first request starts — after this hook). Guessing the family can
 * give the measured-worst persona to the wrong model, and path-commitment
 * makes it stick. Near-field text arriving on turn 2 loses nothing (P14/P19).
 *
 * Gating: state.mode auto/on/off. Fail-open everywhere.
 */

import {
  readStdinJson, extractPrompt, readState, updateState,
  modelFamily, modelFromWire, isComplexTask, shouldSuppress,
  FIRST_BLOCK, PERSONA_BLOCK_FLASH, PERSONA_BLOCK_PRO,
  CORRECTION_FLASH, CORRECTION_PRO,
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
// mid-session switches). Wire is the only trustworthy evidence.
const recordedModel = rec && typeof rec.model === 'string' ? rec.model : null
const wireModel = sid ? modelFromWire(sid) : null
const wireFamily = wireModel !== null ? modelFamily(wireModel) : null

// Gating.
// - on:   force-enable; family from any hint, default flash.
// - auto: wire evidence of a non-V4 model → silent; no wire yet → proceed
//         (family-neutral parts only, persona waits for evidence).
if (mode === 'auto' && wireModel !== null && wireFamily === null) process.exit(0)

const family =
  wireFamily ??
  (mode === 'on' ? modelFamily(recordedModel) ?? 'flash' : null)

const parts = []

// Legacy sessions stored personaInjected; treat it as protocolGiven.
const protocolGiven = Boolean(rec && (rec.protocolGiven ?? rec.personaInjected))
const givenFamily = rec && typeof rec.family === 'string' ? rec.family : null

// First message: Reasoning Protocol (family-neutral, always safe).
if (!protocolGiven && sid) {
  parts.push(FIRST_BLOCK)
  try {
    updateState((s) => {
      const prev = s.sessions[sid] || {}
      s.sessions[sid] = { ...prev, model: prev.model ?? null, protocolGiven: true }
    })
  } catch {}
}

// Persona: only once the family is KNOWN (wire evidence, or a hint in on-mode).
if (sid && family !== null && givenFamily === null) {
  parts.push(family === 'pro' ? PERSONA_BLOCK_PRO : PERSONA_BLOCK_FLASH)
  try {
    updateState((s) => {
      const prev = s.sessions[sid] || {}
      s.sessions[sid] = { ...prev, family }
    })
  } catch {}
} else if (sid && family !== null && givenFamily !== null && family !== givenFamily) {
  // Mid-session model switch: correct course once.
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
