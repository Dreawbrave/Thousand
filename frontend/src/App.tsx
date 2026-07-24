import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Check, Copy, Dices, LogIn, Play, RotateCcw, Users, Wifi, WifiOff } from 'lucide-react'
import { createRoom, joinRoom, socketUrl, type ServerMessage } from './api'
import { Die } from './components/Dice'
import { Logo } from './components/Logo'
import { RulesModal } from './components/RulesModal'
import { Reactions } from './components/Reactions'
import { Chat } from './components/Chat'
import type { GameState, Session } from './types'

const SESSION_KEY = 'thousand-session'

function getSavedSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}

function App() {
  const [session, setSession] = useState<Session | null>(getSavedSession)
  const [state, setState] = useState<GameState | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [rules, setRules] = useState(false)
  const [rolling, setRolling] = useState(false)
  const socket = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!session) return
    let stopped = false
    let retry = 0
    let reconnectTimer: number | undefined
    let heartbeat: number | undefined

    const connect = () => {
      if (stopped) return
      const ws = new WebSocket(socketUrl(session.code, session.playerId))
      socket.current = ws
      ws.onopen = () => {
        retry = 0
        setConnected(true)
        setError('')
        heartbeat = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'ping' }))
        }, 30_000)
      }
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage
        if (message.type === 'state') {
          setState(message.state)
          setRolling(false)
        }
        if (message.type === 'error') { setError(message.message); setRolling(false) }
      }
      ws.onclose = (event) => {
        if (heartbeat) clearInterval(heartbeat)
        setConnected(false)
        if (stopped) return
        if (event.code === 4004) {
          localStorage.removeItem(SESSION_KEY)
          setSession(null)
          setState(null)
          setError('Комната уже закрыта')
          return
        }
        const delay = Math.min(1000 * 2 ** retry++, 10_000)
        reconnectTimer = window.setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (heartbeat) clearInterval(heartbeat)
      socket.current?.close()
    }
  }, [session])

  const enter = (next: Session) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    setSession(next)
  }

  const leave = () => {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
    setState(null)
    setConnected(false)
  }

  const send = (action: string, payload: Record<string, unknown> = {}) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return setError('Связь восстанавливается…')
    if (action === 'roll') setRolling(true)
    socket.current.send(JSON.stringify({ action, ...payload }))
  }

  return (
    <main className="app-shell">
      <div className="grain" />
      {rules && <RulesModal close={() => setRules(false)} />}
      {!session ? (
        <Home onEnter={enter} openRules={() => setRules(true)} externalError={error} />
      ) : !state ? (
        <div className="loading"><Logo /><div className="loader"/><p>Подключаемся к столу {session.code}</p><button className="text-button" onClick={leave}>Выйти</button></div>
      ) : state.status === 'lobby' ? (
        <Lobby state={state} me={session.playerId} connected={connected} send={send} leave={leave} openRules={() => setRules(true)} error={error} />
      ) : (
        <Game state={state} me={session.playerId} connected={connected} send={send} leave={leave} rolling={rolling} openRules={() => setRules(true)} error={error} />
      )}
      {session && state && <Chat messages={state.chatMessages} players={state.players} me={session.playerId} send={send} disabled={!connected} />}
    </main>
  )
}

function Home({ onEnter, openRules, externalError }: { onEnter: (s: Session) => void; openRules: () => void; externalError: string }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (name.trim().length < 2) return setError('Напиши имя хотя бы из двух букв')
    setBusy(true); setError('')
    try {
      const result = mode === 'create' ? await createRoom(name.trim()) : await joinRoom(code.trim().toUpperCase(), name.trim())
      onEnter({ ...result, name: name.trim() })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Что-то пошло не так') }
    finally { setBusy(false) }
  }

  return (
    <div className="home">
      <nav className="topbar"><Logo compact /><button className="nav-link" onClick={openRules}><BookOpen size={18}/> Правила</button></nav>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow"><span className="live-dot"/> LIVE · ДО 8 ИГРОКОВ</p>
          <h1 aria-label="Бросай. Рискуй. Забирай.">Бросай.<br/><em>Рискуй.</em><br/>Забирай.</h1>
          <p className="hero__lead">Та самая «Тысяча» на пяти костях — теперь за одним виртуальным столом.</p>
          <div className="hero__stats"><span><b>5</b> костей</span><span><b>1000</b> до победы</span><span><b>∞</b> азарта</span></div>
        </div>
        <div className="entry-card">
          <div className="entry-card__tabs">
            <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Новый стол</button>
            <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>По коду</button>
          </div>
          <form onSubmit={submit}>
            <label>КАК ТЕБЯ ЗОВУТ?</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} placeholder="Например, Лютый" autoFocus />
            {mode === 'join' && <><label>КОД СТОЛА</label><input className="code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 5))} maxLength={5} placeholder="КУБИК" /></>}
            <button className="primary-button" disabled={busy}>{busy ? <span className="mini-loader"/> : mode === 'create' ? <><Dices/> Создать игру</> : <><LogIn/> Войти за стол</>}</button>
            {(error || externalError) && <p className="form-error">{error || externalError}</p>}
          </form>
          <p className="entry-card__hint">Без регистрации. Просто отправь друзьям код.</p>
        </div>
        <div className="hero-dice hero-dice--one"><Die value={1}/></div>
        <div className="hero-dice hero-dice--five"><Die value={5}/></div>
        <div className="hero-dice hero-dice--six"><Die value={6}/></div>
      </section>
      <footer className="home-footer"><span>ПЯТЬ КОСТЕЙ. ОДНА ТЫСЯЧА.</span><span>СДЕЛАНО ДЛЯ ДРУЗЕЙ ↗</span></footer>
    </div>
  )
}

function Lobby({ state, me, connected, send, leave, openRules, error }: GameProps) {
  const [copied, setCopied] = useState(false)
  const isHost = state.hostId === me
  const copy = async () => { await navigator.clipboard.writeText(state.code); setCopied(true); setTimeout(() => setCopied(false), 1200) }
  return (
    <div className="lobby page">
      <Header connected={connected} leave={leave} openRules={openRules}/>
      <section className="lobby__content">
        <p className="eyebrow">КОМНАТА СОЗДАНА</p>
        <h1>Собирай<br/>своих.</h1>
        <button className="room-code" onClick={copy}><span>{state.code}</span>{copied ? <Check/> : <Copy/>}<small>{copied ? 'СКОПИРОВАНО' : 'НАЖМИ, ЧТОБЫ СКОПИРОВАТЬ'}</small></button>
        <p className="lobby__instruction">Отправь этот код друзьям. Игра начнётся, когда за столом будет хотя бы двое.</p>
        <div className="seats">
          {Array.from({ length: Math.max(4, state.players.length) }, (_, index) => {
            const player = state.players[index]
            return player ? <div className={`seat ${player.id === me ? 'seat--me' : ''}`} key={player.id}><Avatar name={player.name} index={index}/><div><b>{player.name}</b><span>{player.id === state.hostId ? 'ВЕДУЩИЙ' : player.connected ? 'ЗА СТОЛОМ' : 'НЕ В СЕТИ'}</span></div>{player.id === me && <i>ВЫ</i>}</div> : <div className="seat seat--empty" key={index}><div className="empty-avatar">+</div><span>ЖДЁМ ИГРОКА</span></div>
          })}
        </div>
        {isHost ? <button className="primary-button lobby__start" onClick={() => send('start')} disabled={state.players.length < 2}><Play fill="currentColor"/> {state.players.length < 2 ? 'Нужен ещё игрок' : 'Начать игру'}</button> : <div className="waiting"><span className="mini-loader"/> Ведущий скоро начнёт</div>}
        {error && <p className="form-error">{error}</p>}
      </section>
    </div>
  )
}

type GameProps = { state: GameState; me: string; connected: boolean; send: (action: string, payload?: Record<string, unknown>) => void; leave: () => void; openRules: () => void; error: string }

function Header({ connected, leave, openRules, code }: { connected: boolean; leave: () => void; openRules: () => void; code?: string }) {
  return <header className="game-header"><Logo compact/><div className="game-header__right">{code && <span className="header-code">СТОЛ {code}</span>}<span className={`connection ${connected ? '' : 'connection--off'}`}>{connected ? <Wifi/> : <WifiOff/>}<i>{connected ? 'В СЕТИ' : 'НЕТ СВЯЗИ'}</i></span><button className="icon-button" onClick={openRules} aria-label="Правила"><BookOpen/></button><button className="icon-button" onClick={leave} aria-label="Выйти"><ArrowLeft/></button></div></header>
}

function Game({ state, me, connected, send, leave, rolling, openRules, error }: GameProps & { rolling: boolean }) {
  const isMine = state.currentPlayerId === me
  const current = state.players.find((p) => p.id === state.currentPlayerId)
  const mePlayer = state.players.find((p) => p.id === me)
  const winner = state.players.find((p) => p.id === state.winnerId)
  const dice = state.lastRoll?.dice ?? Array.from({ length: state.diceToRoll }, () => 1)
  const pointsLeft = Math.max(0, state.bankRequirement - state.turnScore)
  const requirementText = !mePlayer?.opened
    ? `Для входа нужно ещё ${pointsLeft}`
    : mePlayer.score < 50 && state.bankRequirement > 0
      ? `Нижняя яма: до 50 ещё ${pointsLeft}`
      : state.bankRequirement > 0
        ? `До выхода из ямы ещё ${pointsLeft}`
        : ''

  return (
    <div className="game page">
      <Header connected={connected} leave={leave} openRules={openRules} code={state.code}/>
      <div className="game-layout">
        <aside className="scoreboard">
          <div className="scoreboard__title"><span>ТАБЛИЦА</span><small>РАУНД {state.round}</small></div>
          <div className="player-list">
            {[...state.players].sort((a,b) => b.score - a.score).map((player, index) => (
              <div className={`player-row ${player.id === state.currentPlayerId ? 'player-row--active' : ''}`} key={player.id}>
                <span className="rank">{String(index + 1).padStart(2, '0')}</span><Avatar name={player.name} index={state.players.indexOf(player)}/><div className="player-row__name"><b>{player.name}{player.id === me && ' · ВЫ'}</b><span>{playerStatus(player)}</span></div><strong>{player.score}</strong><div className="bolts">{Array.from({length:3},(_,i)=><i className={i < player.bolts ? 'filled' : ''} key={i}/>)}</div>
              </div>
            ))}
          </div>
          <div className="legend"><span><i className="bolt-dot"/> 3 БОЛТА ПОДРЯД = −50</span><span>555 = САМОСВАЛ</span></div>
        </aside>
        <section className="table-area">
          <div className="turn-heading">
            <p className="eyebrow">{isMine ? 'ТВОЙ ХОД' : `ХОДИТ ${current?.name.toUpperCase() || '…'}`}</p>
            <h1>{state.turnScore > 0 ? <><span>+</span>{state.turnScore}</> : isMine ? 'Бросай!' : 'Наблюдаем'}</h1>
            <p>{state.event}</p>
          </div>
          <div className={`dice-tray ${rolling ? 'dice-tray--rolling' : ''}`}>
            <div className="tray-ring"/>
            <div className="dice-row">
              {dice.map((value, index) => <Die key={`${state.round}-${state.turnScore}-${index}`} value={value} rolling={rolling} scoring={state.lastRoll?.scoringIndices.includes(index)} delay={index * 70}/>) }
            </div>
            {state.lastRoll && !state.lastRoll.busted && <div className="combo-label">{state.lastRoll.label} <b>+{state.lastRoll.points}</b></div>}
            {state.lastRoll?.busted && <div className="combo-label combo-label--bust">ПУСТО · БОЛТ</div>}
          </div>
          <div className="game-actions">
            {state.status === 'finished' ? (
              <div className="winner-card"><span>🏆</span><div><small>ПОБЕДИТЕЛЬ</small><b>{winner?.name}</b></div>{state.hostId === me && <button onClick={() => send('restart')}><RotateCcw/> Реванш</button>}</div>
            ) : isMine ? <>
              <button className="roll-button" onClick={() => send('roll')} disabled={rolling}><Dices/>{rolling ? 'ЛЕТЯТ…' : `БРОСИТЬ ${state.diceToRoll === 5 ? 'КОСТИ' : state.diceToRoll}`}</button>
              <button className="bank-button" onClick={() => send('bank')} disabled={!state.canBank || rolling}><span>ХВАТИТ</span><b>Забрать {state.turnScore}</b></button>
            </> : <div className="waiting"><span className="mini-loader"/> Ждём броска</div>}
            <Reactions reaction={state.reaction} players={state.players} send={send} disabled={!connected} />
          </div>
          {isMine && requirementText && <p className="requirement">⚑ {requirementText}</p>}
          {error && <p className="form-error game-error">{error}</p>}
        </section>
      </div>
    </div>
  )
}

function playerStatus(player: GameState['players'][number]) {
  if (!player.opened) return 'НЕ ОТКРЫЛСЯ'
  if (player.score < 0) return 'В МИНУСЕ'
  if (player.score < 50) return 'НИЖНЯЯ ЯМА'
  if ((player.score >= 200 && player.score < 300) || (player.score >= 600 && player.score < 700)) return 'В ЯМЕ'
  return 'В ИГРЕ'
}

function Avatar({ name, index }: { name: string; index: number }) {
  return <div className={`avatar avatar--${index % 6}`}>{name.trim().slice(0, 1).toUpperCase()}</div>
}

export default App
