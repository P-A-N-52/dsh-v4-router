/**
 * SessionStart hook: record session_id → model into the router state file.
 * Observation-only event; always exits 0.
 */

import { readStdinJson, updateState } from '../lib/core.mjs'

const payload = await readStdinJson()
const sid = payload.session_id
const model = payload.model

if (typeof sid === 'string' && sid.length > 0) {
  try {
    updateState((s) => {
      const prev = s.sessions[sid] || {}
      s.sessions[sid] = {
        model: typeof model === 'string' ? model : prev.model ?? null,
        personaInjected: Boolean(prev.personaInjected),
        source: payload.source ?? prev.source ?? null,
        seenAt: new Date().toISOString(),
      }
    })
  } catch {
    // fail-open: never disturb the main flow
  }
}

process.exit(0)
