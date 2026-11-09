export type RoomFace = 'up' | 'down'
export type RoomStatus = 'work' | 'report' | 'lounge' | 'dead'

export type RoomAgent = {
  key: string
  id?: string
  name: string
  role: string
  color: string
  hair: string
  skin: string
  station: string
  slot: number
  x: number
  y: number
  fromX: number
  fromY: number
  movedAt: number
  face: RoomFace
  sit: boolean
  status: RoomStatus
  tool?: string
  bubble?: string
  bubbleAt?: number
  bubbleErr?: boolean
  errAt?: number
  spawnedAt: number
  deadAt?: number
  task: string
}

export type RoomMain = {
  bubble?: string
  bubbleAt?: number
  activeAt?: number
  station?: string
  slot?: number
  x?: number
  y?: number
  fromX?: number
  fromY?: number
  movedAt?: number
  face?: RoomFace
  sit?: boolean
}

export type RoomFile = {
  path: string
  short: string
  action: 'créé' | 'modifié' | 'lu'
  by: string
  color: string
  at: number
  add: number
  del: number
  diff?: string
}

export type RoomFeed = { at: number; who: string; color: string; text: string }

export type RoomState = {
  main: RoomMain
  agents: RoomAgent[]
  files: RoomFile[]
  feed: RoomFeed[]
  seq: number
}

export type RoomPrefs = {
  world: string
  ending: string
  file: string
  full?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-room': {
      room: Shaped<RoomState>
      prefs: Shaped<RoomPrefs>
    }
  }
}
