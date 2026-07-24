export type Player = {
  id: string
  name: string
  score: number
  bolts: number
  opened: boolean
  connected: boolean
  orderRoll?: number
}

export type LastRoll = {
  dice: number[]
  scoringIndices: number[]
  points: number
  label: string
  busted: boolean
}

export type Reaction = {
  id: string
  playerId: string
  nonce: string
  createdAt: number
}

export type ChatMessage = {
  id: string
  playerId: string
  text: string
  createdAt: number
}

export type GameState = {
  code: string
  status: 'lobby' | 'playing' | 'finished'
  hostId: string
  players: Player[]
  currentPlayerId: string | null
  turnScore: number
  diceToRoll: number
  mustRoll: boolean
  lastRoll: LastRoll | null
  winnerId: string | null
  round: number
  event: string
  canBank: boolean
  bankRequirement: number
  maxPlayers: number
  reaction: Reaction | null
  chatMessages: ChatMessage[]
}

export type Session = { playerId: string; code: string; name: string }
