import { useEffect, useRef, useState } from 'react'
import { SmilePlus, X } from 'lucide-react'
import type { Player, Reaction } from '../types'

type Sticker = { id: string; label: string; src: string }
type SendAction = (action: string, payload?: Record<string, unknown>) => void

const FALLBACK_STICKERS: Sticker[] = [
  { id: 'laugh', label: 'Смеюсь', src: '/stickers/laugh.png' },
  { id: 'cry', label: 'Плачу', src: '/stickers/cry.png' },
  { id: 'angry', label: 'Злюсь', src: '/stickers/angry.png' },
  { id: 'confused', label: 'Не понял', src: '/stickers/confused.png' },
  { id: 'shocked', label: 'В шоке', src: '/stickers/shocked.png' },
  { id: 'smug', label: 'Ну конечно', src: '/stickers/smug.png' },
  { id: 'love', label: 'Любовь', src: '/stickers/love.png' },
  { id: 'cool', label: 'Красиво', src: '/stickers/cool.png' },
]

export function Reactions({ reaction, players, send, disabled }: { reaction: Reaction | null; players: Player[]; send: SendAction; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [stickers, setStickers] = useState(FALLBACK_STICKERS)
  const [visible, setVisible] = useState<Reaction[]>([])
  const seen = useRef<string | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/stickers/manifest.json')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((items: Sticker[]) => { if (!cancelled && items.length) setStickers(items) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (!reaction || reaction.nonce === seen.current) return
    seen.current = reaction.nonce
    if (Date.now() - reaction.createdAt > 10_000) return
    setVisible((current) => [...current.slice(-2), reaction])
    const timer = window.setTimeout(() => {
      setVisible((current) => current.filter((item) => item.nonce !== reaction.nonce))
    }, 3200)
    timers.current.push(timer)
  }, [reaction])

  const choose = (sticker: Sticker) => {
    send('reaction', { stickerId: sticker.id })
    setOpen(false)
  }

  return (
    <>
      <div className="reaction-stage" aria-live="polite">
        {visible.map((item, index) => {
          const sticker = stickers.find((entry) => entry.id === item.id)
          const player = players.find((entry) => entry.id === item.playerId)
          const offset = (index - (visible.length - 1) / 2) * 92
          return (
            <div className="reaction-pop" style={{ '--reaction-offset': `${offset}px` } as React.CSSProperties} key={item.nonce}>
              <span>{player?.name || 'Игрок'}</span>
              <img src={sticker?.src || `/stickers/${item.id}.png`} alt={sticker?.label || 'Реакция'} />
            </div>
          )
        })}
      </div>
      <div className="reaction-control">
        {open && (
          <div className="reaction-picker">
            <div className="reaction-picker__head"><b>РЕАКЦИЯ</b><button onClick={() => setOpen(false)} aria-label="Закрыть реакции"><X /></button></div>
            <div className="reaction-picker__grid">
              {stickers.map((sticker) => (
                <button key={sticker.id} onClick={() => choose(sticker)} title={sticker.label}>
                  <img src={sticker.src} alt="" />
                  <span>{sticker.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <button className={`reaction-button ${open ? 'reaction-button--active' : ''}`} onClick={() => setOpen((value) => !value)} disabled={disabled} aria-expanded={open} aria-label="Отправить реакцию">
          <SmilePlus />
          <span>ЭМОЦИЯ</span>
        </button>
      </div>
    </>
  )
}
