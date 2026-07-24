import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import type { ChatMessage, Player } from '../types'

type SendAction = (action: string, payload?: Record<string, unknown>) => void

export function Chat({ messages, players, me, send, disabled }: {
  messages: ChatMessage[]
  players: Player[]
  me: string
  send: SendAction
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [unread, setUnread] = useState(0)
  const lastMessageId = useRef(messages.at(-1)?.id)
  const list = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const latest = messages.at(-1)
    if (!latest || latest.id === lastMessageId.current) return
    lastMessageId.current = latest.id
    if (!open && latest.playerId !== me) setUnread((value) => Math.min(value + 1, 99))
  }, [messages, me, open])

  useEffect(() => {
    if (!open) return
    setUnread(0)
    requestAnimationFrame(() => {
      if (list.current) list.current.scrollTop = list.current.scrollHeight
    })
  }, [open, messages])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || disabled) return
    send('chat', { text })
    setDraft('')
  }

  return (
    <div className={`chat-dock ${open ? 'chat-dock--open' : ''}`}>
      {open && (
        <section className="chat-panel" aria-label="Чат игроков">
          <header className="chat-panel__head">
            <div><b>ЧАТ СТОЛА</b><span>{players.filter((player) => player.connected).length} в сети</span></div>
            <button onClick={() => setOpen(false)} aria-label="Закрыть чат"><X /></button>
          </header>
          <div className="chat-messages" ref={list} aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-empty"><MessageCircle /><b>Здесь пока тихо</b><span>Напиши первым — пусть кубики знают, кто сегодня победит.</span></div>
            )}
            {messages.map((message) => {
              const player = players.find((entry) => entry.id === message.playerId)
              const mine = message.playerId === me
              return (
                <article className={`chat-message ${mine ? 'chat-message--mine' : ''}`} key={message.id}>
                  <div className="chat-message__meta">
                    <b>{mine ? 'ВЫ' : player?.name || 'Игрок'}</b>
                    <time>{new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                  <p>{message.text}</p>
                </article>
              )
            })}
          </div>
          <form className="chat-form" onSubmit={submit}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={300}
              placeholder={disabled ? 'Подключаемся…' : 'Сообщение…'}
              disabled={disabled}
              aria-label="Сообщение в чат"
            />
            <button disabled={disabled || !draft.trim()} aria-label="Отправить сообщение"><Send /></button>
          </form>
        </section>
      )}
      <button className="chat-toggle" onClick={() => setOpen((value) => !value)} disabled={disabled} aria-expanded={open} aria-label={open ? 'Закрыть чат' : 'Открыть чат'}>
        {open ? <X /> : <MessageCircle />}
        {!open && unread > 0 && <i>{unread}</i>}
      </button>
    </div>
  )
}
