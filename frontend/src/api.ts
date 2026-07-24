import type { GameState } from './types'

const configured = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
export const API_URL = configured || ''

async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Не удалось связаться с сервером')
  return data as T
}

export function createRoom(name: string) {
  return request<{ code: string; playerId: string }>('/api/rooms', { name })
}

export function joinRoom(code: string, name: string) {
  return request<{ code: string; playerId: string }>(`/api/rooms/${code}/join`, { name })
}

export function socketUrl(code: string, playerId: string) {
  const base = configured
    ? configured.replace(/^http/, 'ws')
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
  return `${base}/ws/${code}/${playerId}`
}

export type ServerMessage =
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'pong' }
  | VoiceServerMessage

export type VoiceSignal = {
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

export type VoiceServerMessage =
  | { type: 'voice-members'; playerIds: string[] }
  | { type: 'voice-peer-joined'; playerId: string }
  | { type: 'voice-peer-left'; playerId: string }
  | { type: 'voice-signal'; fromPlayerId: string; signal: VoiceSignal }
