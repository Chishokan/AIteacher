import type { Session } from '../types'
import { defaultSettings, type Settings } from './settings'

const SETTINGS_KEY = 'aitecher.settings.v1'
const SESSIONS_KEY = 'aitecher.sessions.v1'
const MAX_STORED_SESSIONS = 100

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as object) } as T
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // プライベートブラウズなどで保存できない場合は黙って諦める
  }
}

export function loadSettings(): Settings {
  return readJSON<Settings>(SETTINGS_KEY, defaultSettings)
}

export function saveSettings(settings: Settings): void {
  writeJSON(SETTINGS_KEY, settings)
}

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Session[]) : []
  } catch {
    return []
  }
}

export function saveSession(session: Session): void {
  const sessions = loadSessions().filter((s) => s.id !== session.id)
  sessions.unshift(session)
  writeJSON(SESSIONS_KEY, sessions.slice(0, MAX_STORED_SESSIONS))
}

export function deleteSession(id: string): void {
  writeJSON(SESSIONS_KEY, loadSessions().filter((s) => s.id !== id))
}

export function clearSessions(): void {
  writeJSON(SESSIONS_KEY, [])
}
