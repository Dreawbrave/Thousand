import { useEffect, useRef, useState } from 'react'
import { Headphones, Mic, MicOff, PhoneOff, Radio, X } from 'lucide-react'
import type { VoiceServerMessage, VoiceSignal } from '../api'
import type { Player } from '../types'

type SendAction = (action: string, payload?: Record<string, unknown>) => void
export type VoiceEventHandler = (message: VoiceServerMessage) => void

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export function Voice({ players, me, send, disabled, open, onOpenChange, messageHandler }: {
  players: Player[]
  me: string
  send: SendAction
  disabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  messageHandler: { current: VoiceEventHandler | null }
}) {
  const [enabled, setEnabled] = useState(false)
  const [muted, setMuted] = useState(false)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const localStream = useRef<MediaStream | null>(null)
  const peers = useRef(new Map<string, RTCPeerConnection>())
  const audios = useRef(new Map<string, HTMLAudioElement>())
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>())

  const updateMembers = () => setMemberIds([me, ...peers.current.keys()])

  const closePeer = (playerId: string) => {
    peers.current.get(playerId)?.close()
    peers.current.delete(playerId)
    const audio = audios.current.get(playerId)
    if (audio) {
      audio.pause()
      audio.srcObject = null
    }
    audios.current.delete(playerId)
    pendingCandidates.current.delete(playerId)
    updateMembers()
  }

  const createPeer = async (playerId: string, initiator: boolean) => {
    if (!localStream.current || peers.current.has(playerId)) return peers.current.get(playerId)
    const peer = new RTCPeerConnection(ICE_SERVERS)
    peers.current.set(playerId, peer)
    pendingCandidates.current.set(playerId, [])
    localStream.current.getTracks().forEach((track) => peer.addTrack(track, localStream.current!))
    peer.onicecandidate = (event) => {
      if (event.candidate) send('voice_signal', { targetPlayerId: playerId, signal: { candidate: event.candidate.toJSON() } })
    }
    peer.ontrack = (event) => {
      const stream = event.streams[0]
      if (!stream) return
      let audio = audios.current.get(playerId)
      if (!audio) {
        audio = new Audio()
        audio.autoplay = true
        audio.setAttribute('playsinline', '')
        audios.current.set(playerId, audio)
      }
      audio.srcObject = stream
      audio.play().catch(() => setError('Нажми на панель войса, чтобы включить звук'))
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') closePeer(playerId)
    }
    updateMembers()
    if (initiator) {
      await peer.setLocalDescription(await peer.createOffer())
      send('voice_signal', { targetPlayerId: playerId, signal: { description: peer.localDescription?.toJSON() } })
    }
    return peer
  }

  const handleSignal = async (fromPlayerId: string, signal: VoiceSignal) => {
    const peer = await createPeer(fromPlayerId, false)
    if (!peer) return
    if (signal.description) {
      await peer.setRemoteDescription(signal.description)
      const queued = pendingCandidates.current.get(fromPlayerId) || []
      for (const candidate of queued) await peer.addIceCandidate(candidate)
      pendingCandidates.current.set(fromPlayerId, [])
      if (signal.description.type === 'offer') {
        await peer.setLocalDescription(await peer.createAnswer())
        send('voice_signal', { targetPlayerId: fromPlayerId, signal: { description: peer.localDescription?.toJSON() } })
      }
    }
    if (signal.candidate) {
      if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate)
      else pendingCandidates.current.get(fromPlayerId)?.push(signal.candidate)
    }
  }

  useEffect(() => {
    messageHandler.current = (message) => {
      if (!localStream.current) return
      if (message.type === 'voice-members') {
        message.playerIds.forEach((playerId) => void createPeer(playerId, true))
      } else if (message.type === 'voice-peer-joined') {
        void createPeer(message.playerId, false)
      } else if (message.type === 'voice-peer-left') {
        closePeer(message.playerId)
      } else if (message.type === 'voice-signal') {
        void handleSignal(message.fromPlayerId, message.signal).catch(() => setError('Не удалось подключить игрока к войсу'))
      }
    }
    return () => { messageHandler.current = null }
  })

  const stopVoice = (notify = true) => {
    if (notify) send('voice_leave')
    peers.current.forEach((_, playerId) => closePeer(playerId))
    localStream.current?.getTracks().forEach((track) => track.stop())
    localStream.current = null
    setEnabled(false)
    setMuted(false)
    setMemberIds([])
  }

  useEffect(() => () => stopVoice(false), [])
  useEffect(() => {
    if (disabled && enabled) stopVoice(false)
  }, [disabled, enabled])

  const startVoice = async () => {
    setError('')
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })
      setEnabled(true)
      setMuted(false)
      setMemberIds([me])
      send('voice_join')
    } catch {
      setError('Нет доступа к микрофону. Разреши его в настройках браузера.')
    }
  }

  const toggleMute = () => {
    const next = !muted
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMuted(next)
  }

  const members = memberIds.map((id) => players.find((player) => player.id === id)).filter(Boolean) as Player[]

  return (
    <div className={`voice-dock ${enabled ? 'voice-dock--active' : ''}`}>
      {open && (
        <section className="voice-panel" aria-label="Голосовой чат">
          <header><div><b>ГОЛОСОВОЙ ЧАТ</b><span>{enabled ? `${members.length} подключено` : 'P2P · WEBRTC'}</span></div><button onClick={() => onOpenChange(false)} aria-label="Закрыть голосовой чат"><X /></button></header>
          {!enabled ? (
            <div className="voice-join">
              <Headphones />
              <b>Слышать своих</b>
              <p>Браузер попросит доступ к микрофону. Звук идёт напрямую между игроками.</p>
              <button onClick={startVoice} disabled={disabled}><Mic /> Подключиться</button>
            </div>
          ) : (
            <>
              <div className="voice-members">
                {members.map((player) => <div key={player.id}><i>{player.name.slice(0, 1).toUpperCase()}</i><span>{player.id === me ? `${player.name} · вы` : player.name}</span><Radio /></div>)}
              </div>
              <div className="voice-controls">
                <button className={muted ? 'muted' : ''} onClick={toggleMute}>{muted ? <MicOff /> : <Mic />}<span>{muted ? 'Включить' : 'Микрофон'}</span></button>
                <button className="leave" onClick={() => stopVoice()}><PhoneOff /><span>Выйти</span></button>
              </div>
            </>
          )}
          {error && <p className="voice-error">{error}</p>}
        </section>
      )}
      <button className="voice-toggle" onClick={() => onOpenChange(!open)} disabled={disabled} aria-expanded={open} aria-label={open ? 'Закрыть голосовой чат' : 'Открыть голосовой чат'}>
        {enabled && muted ? <MicOff /> : <Headphones />}
        {enabled && <i>{Math.max(1, memberIds.length)}</i>}
      </button>
    </div>
  )
}
