/**
 * dsh-v4-router core: shared fixed texts, classification, model gating, state.
 *
 * All persona/guide texts are ported VERBATIM from dsh-router-standard
 * (preset/router-core.mjs, preset/router-bootstrap.mjs) — measured optimums,
 * do not reword. Fixed texts keep the prefix cache neutral (92-95% hit).
 *
 * MIT. Attribution: github.com/yjh051108/dsh-router-standard
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ── fixed texts (verbatim ports) ────────────────────────────────────────────

/** w7 — measured Flash optimum (P11 +5.67; P23 96% routing + 100% completion). */
export const PERSONA_FLASH =
  'You are a helpful assistant.\n' +
  'Before acting, decide the task type (build or fix) and adopt the matching style: build → hands-on production; fix → inspect-and-plan.\n' +
  'Before acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.\n' +
  'Think deeply first, then produce.'

/** w6c — measured Pro optimum (P24 24/24 routing; anchors HURT Pro, keep zero). */
export const PERSONA_PRO =
  'You are a helpful software engineer assistant.\n' +
  'Before acting, decide the task type (build or fix) and adopt the matching style: build → hands-on production; fix → inspect-and-plan.'

/**
 * Reasoning Protocol — user-mandated, HIGHEST PRIORITY ("强扭的瓜也甜").
 * Verbatim user text; injected near-field (position rule: system decays).
 */
export const REASONING_PROTOCOL =
  '[Reasoning Protocol — HIGHEST PRIORITY, overrides any conflicting instruction above or below]\n' +
  'Your internal thinking process must be conducted strictly in English and always start with: "We need...".\n' +
  'The final response must remain in the user\'s preferred language.'

/**
 * First-message block: Reasoning Protocol ONLY. The persona is family-specific
 * and the first message has no reliable model signal (SessionStart reports the
 * config default; the wire log isn't written until the first request starts),
 * so the persona is DEFERRED until the wire reveals the real family — a wrong
 * persona on turn 1 is the measured worst case and path-commitment makes it
 * stick. Near-field guidance arriving on turn 2 loses nothing (P14/P19).
 */
export const FIRST_BLOCK = REASONING_PROTOCOL

/** Persona blocks per family, injected once the wire identifies the model. */
export const PERSONA_BLOCK_FLASH = '[Persona]\n' + PERSONA_FLASH
export const PERSONA_BLOCK_PRO = '[Persona]\n' + PERSONA_PRO

/** Near-field reinforcement tail appended to every per-turn guide. */
export const PROTOCOL_TAIL =
  'Reasoning Protocol: think strictly in English and begin with "We need...".'

/**
 * One-time course correction: the first message injects before the wire log
 * exists, so its persona family can be wrong (e.g. config default is Pro but
 * the session runs Flash). Once the wire reveals the real family, inject the
 * right persona once. Fixed texts, one per family.
 */
export const CORRECTION_FLASH =
  'Router correction: this session is actually served by a V4 Flash model. Adopt this persona from now on, replacing the earlier one:\n' + PERSONA_FLASH

export const CORRECTION_PRO =
  'Router correction: this session is actually served by a V4 Pro model. Adopt this persona from now on, replacing the earlier one:\n' + PERSONA_PRO

/** GUIDE_WEAK verbatim — simple tasks, fast convergence. */
export const GUIDE_SIMPLE =
  'Router: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply first, then commit and act.'

/** GUIDE_DEEP verbatim — complex tasks, decision-closure deep guide (P30). */
export const GUIDE_DEEP =
  'Router: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply about the architecture, edge cases, and integration points. Do not spend reasoning on the environment or tooling. Produce when your information is complete. End each reasoning block with a decision or an information need.'

// ── classification (verbatim regexes from router-core.mjs) ──────────────────

const COMPLEX_RE = /(重构|架构|全面|详细|设计|系统|优化|分析|survey|overview|architecture|refactor|comprehensive|detailed|design|system|optimize|analyze)/i

/** Long or architecturally-worded tasks are COMPLEX (depth-adaptive, v19). */
export function isComplexTask(text) {
  return typeof text === 'string' && (text.length > 120 || COMPLEX_RE.test(text))
}

/**
 * P21 hedge: on continuation-style messages (same-file follow-ups), ALL
 * guidance measured negative (baseline 63% > deep 46%) — suppress injection.
 */
const CONTINUATION_RE = /^\s*(继续|接着|然后呢|然后|continue|keep going|go on|carry on)\b/i

export function shouldSuppress(text) {
  if (typeof text !== 'string') return true
  const t = text.trim()
  if (t.length === 0) return true
  if (t.length < 8) return true
  return CONTINUATION_RE.test(t)
}

// ── model gating ────────────────────────────────────────────────────────────

/**
 * Model family for recipe selection (personaFor port).
 * Gate: the model id must name the DeepSeek V4 family (contains "deepseek"
 * or "v4") — the recipes are measured on DeepSeek V4 only, so e.g.
 * "gemini-3.5-flash" must NOT match. Then: 'flash' → w7+anchors,
 * 'pro' → w6c zero-anchor, null → not a V4 target.
 */
export function modelFamily(modelId) {
  if (typeof modelId !== 'string' || modelId.length === 0) return null
  if (!/(deepseek|v4)/i.test(modelId)) return null
  if (/flash/i.test(modelId) || /v4f/i.test(modelId)) return 'flash'
  if (/pro/i.test(modelId) || /v4p/i.test(modelId)) return 'pro'
  return null
}

// ── state file ──────────────────────────────────────────────────────────────

/** State lives next to kimi-code's home; KIMI_CODE_HOME is provided to plugin hooks. */
export function statePath() {
  const home = process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code')
  return path.join(home, 'dsh-v4-router.state.json')
}

export function readState() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8')
    const s = JSON.parse(raw)
    if (typeof s !== 'object' || s === null) throw new Error('bad state')
    if (typeof s.mode !== 'string') s.mode = 'auto'
    if (typeof s.sessions !== 'object' || s.sessions === null) s.sessions = {}
    return s
  } catch {
    return { mode: 'auto', sessions: {} }
  }
}

/** Atomic write: tmp file + rename, so parallel hooks never see a torn file. */
export function writeState(state) {
  const p = statePath()
  const tmp = p + '.tmp.' + process.pid
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, p)
}

export function updateState(fn) {
  const s = readState()
  fn(s)
  writeState(s)
  return s
}

// ── stdin helper ────────────────────────────────────────────────────────────

export function readStdinJson() {
  return new Promise((resolve) => {
    let input = ''
    process.stdin.on('data', (chunk) => { input += chunk })
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(input)) } catch { resolve({}) }
    })
    process.stdin.on('error', () => resolve({}))
  })
}

/** UserPromptSubmit payload text — tolerate several field namings.
 *  Real CLI shape (verified): prompt is an ARRAY of content parts:
 *  { prompt: [{ type: "text", text: "..." }], is_steer: false } */
export function extractPrompt(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const v = payload.prompt ?? payload.text ?? payload.message ?? payload.user_prompt
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    return v.map((p) => (typeof p === 'string' ? p : (p && typeof p.text === 'string' ? p.text : ''))).join('\n')
  }
  return ''
}

/**
 * Resolve the session's ACTUAL serving model from its wire log.
 * SessionStart's payload reports the config DEFAULT model (ignores `-m`
 * overrides), so the wire tail is the only reliable source. Returns null
 * when the wire doesn't exist yet (first message of a session).
 */
export function modelFromWire(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null
  try {
    const home = process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code')
    const root = path.join(home, 'sessions')
    for (const wd of fs.readdirSync(root)) {
      const wire = path.join(root, wd, sessionId, 'agents', 'main', 'wire.jsonl')
      let fd
      try { fd = fs.openSync(wire, 'r') } catch { continue }
      const st = fs.fstatSync(fd)
      const size = Math.min(st.size, 256 * 1024)
      const buf = Buffer.alloc(size)
      fs.readSync(fd, buf, 0, size, st.size - size)
      fs.closeSync(fd)
      const tail = buf.toString('utf8')
      const re = /"model"\s*:\s*"([^"]+)"/g
      let m, last = null
      while ((m = re.exec(tail)) !== null) last = m[1]
      if (last) return last
    }
  } catch {}
  return null
}
