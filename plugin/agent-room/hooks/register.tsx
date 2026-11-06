import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { RoomAgent, RoomFile, RoomPrefs, RoomState } from '../types'
import { CODE_DESKS, EXEC_LINES, MAIN_SEAT, RETIRE, SPAWN, STATIONS, WORLDS, renderScene, route } from './scene'

const PANE = 'agent-room'
const EMPTY: RoomState = { main: {}, agents: [], files: [], feed: [], seq: 0 }
const room = atom({ plugin: 'agent-room', key: 'room' } as const, EMPTY, { shape: 'room-1' })
const prefs = atom({ plugin: 'agent-room', key: 'prefs' } as const, { world: 'studio', ending: 'pompe', file: '' }, { shape: 'prefs-1' })

const COLORS = ['#5ef1ff', '#ff6ac1', '#7ee787', '#ffb86b', '#bd93f9', '#f1fa8c', '#ff7b72', '#79c0ff', '#56d4bc', '#e3a6ff']
const HAIR = ['#3b2a20', '#1d1b26', '#7a4b2a', '#c98b4e', '#e8d18a', '#6b3fa0', '#2f5d8a', '#a33b3b']
const SKIN = ['#f2c8a0', '#e0ac85', '#c68863', '#8d5a3c', '#f6d7b8']
const ROLE_STATION: Record<string, string> = { Architect: 'whiteboard', Researcher: 'library', Reviewer: 'library', Coder: 'code', Tester: 'bench', Debugger: 'bench' }
const TOOL_STATION: Record<string, string> = {
  Read: 'library', Grep: 'library', Glob: 'library', LS: 'library', WebSearch: 'library', WebFetch: 'library',
  Write: 'code', Edit: 'code', MultiEdit: 'code', NotebookEdit: 'code',
  Bash: 'bench', BashOutput: 'bench', PowerShell: 'bench',
  TodoWrite: 'whiteboard', TaskCreate: 'whiteboard', TaskUpdate: 'whiteboard', ExitPlanMode: 'whiteboard',
}
const ACTIVITY: Record<string, string> = { whiteboard: 'planning', library: 'reading', code: 'coding', bench: 'bash', lounge: 'coffee', handoff: 'handoff' }
const LABEL: Record<string, string> = { planning: 'Planifie', reading: 'Lit des fichiers', coding: 'Écrit du code', bash: 'Lance des commandes', coffee: 'En pause', handoff: 'Remet son rapport' }
const RETIRE_DELAY = 4500
const timers = new Map<string, Array<{ cancel: () => void }>>()

const short = (s: string, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
const shortPath = (p: string) => {
  const parts = String(p).split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/') || p
}
function inferRole(text: string) {
  const t = text.toLowerCase()
  if (/(test|qa|vérif|verif|check)/.test(t)) return 'Tester'
  if (/(review|relect|audit)/.test(t)) return 'Reviewer'
  if (/(debug|bug|fix|corrig)/.test(t)) return 'Debugger'
  if (/(plan|archi|design|concep)/.test(t)) return 'Architect'
  if (/(explor|search|research|recherch|find|cherch|read|lis |analy)/.test(t)) return 'Researcher'
  return 'Coder'
}
function niceName(description: string, type: string) {
  const base = type && !['general-purpose', 'fork', 'teammate'].includes(type) ? type : description
  const STOP = new Set(['le', 'la', 'les', 'du', 'de', 'des', 'un', 'une', 'et', 'the', 'a', 'an', 'of', 'to', 'for', 'pour', 'au', 'aux'])
  const words = String(base || 'Agent').replace(/[^\p{L}\p{N} _-]/gu, ' ').trim().split(/[\s_-]+/).filter(w => !STOP.has(w.toLowerCase())).slice(0, 2)
  return short(words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-') || 'Agent', 16)
}

/* ---------------- déplacements ---------------- */
function moveTo(s: RoomState, a: RoomAgent, station: string, now: number): RoomAgent {
  const spots = STATIONS[station]
  const taken = new Set(s.agents.filter(o => o.key !== a.key && o.station === station && o.status !== 'dead').map(o => o.slot))
  let slot = a.station === station && a.slot >= 0 ? a.slot : spots.findIndex((_, i) => !taken.has(i))
  let spot = spots[Math.max(0, slot)]
  let x = spot.x, y = spot.y
  if (slot < 0) { const k = s.seq % spots.length; spot = spots[k]; x = spot.x + ((s.seq * 7) % 17) - 8; y = spot.y + 6; slot = -1 }
  if (a.station === station && Math.abs(a.x - x) < 1 && Math.abs(a.y - y) < 1) return a
  // position actuelle si l'agent était encore en route
  const r = route(a.fromX, a.fromY, a.x, a.y)
  const done = (now - a.movedAt) / 1000 >= r.dur
  const from = done ? { x: a.x, y: a.y } : pointAt(r.pts, ((now - a.movedAt) / 1000) * 42)
  return { ...a, station, slot, fromX: Math.round(from.x), fromY: Math.round(from.y), x, y, movedAt: now, face: spot.face, sit: slot >= 0 && !!spot.sit }
}
function pointAt(pts: Array<[number, number]>, dist: number) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i]
    const d = Math.abs(bx - ax) + Math.abs(by - ay)
    if (dist <= d) { const t = d ? dist / d : 0; return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t } }
    dist -= d
  }
  const l = pts[pts.length - 1]
  return { x: l[0], y: l[1] }
}
const walkMs = (a: RoomAgent) => route(a.fromX, a.fromY, a.x, a.y).dur * 1000

/* ---------------- diffs ---------------- */
function linesOf(t: string) { return t === '' ? [] : t.replace(/\n$/, '').split('\n') }
function hunk(oldText: string, newText: string, startLine: number) {
  const o = linesOf(oldText), n = linesOf(newText)
  return `@@ -${startLine},${o.length} +${startLine},${n.length} @@\n` + o.map(l => '-' + l).join('\n') + (o.length ? '\n' : '') + n.map(l => '+' + l).join('\n')
}
const clip = (d: string) => (d.length > 9000 ? d.slice(0, d.lastIndexOf('\n', 9000)) : d)

/* ---------------- état ---------------- */
type Change = (s: RoomState, now: number) => RoomState
async function change($: any, fn: Change) {
  const now = await $.clock.now()
  await update($, room, s => fn({ ...EMPTY, ...s }, now))
}
function feed(s: RoomState, now: number, who: string, color: string, text: string): RoomState {
  return { ...s, feed: [...s.feed, { at: now, who, color, text: short(text, 120) }].slice(-40) }
}
function setAgent(s: RoomState, key: string, fn: (a: RoomAgent) => RoomAgent): RoomState {
  return { ...s, agents: s.agents.map(a => (a.key === key ? fn(a) : a)) }
}
function findByLoop(s: RoomState, agentId?: string) {
  return agentId ? s.agents.find(a => a.id === agentId) : undefined
}
function clearTimers(key: string) {
  for (const t of timers.get(key) ?? []) t.cancel()
  timers.delete(key)
}
function later($: any, key: string, ms: number, fn: Change) {
  const t = $.clock.after(Math.max(1, Math.round(ms)), () => { void change($, fn) })
  timers.set(key, [...(timers.get(key) ?? []), t])
}

function touchFile(s: RoomState, now: number, f: Omit<RoomFile, 'at' | 'short'>): RoomState {
  const prev = s.files.find(x => x.path === f.path)
  if (f.action === 'lu' && prev) return s
  const merged: RoomFile = {
    ...f,
    short: shortPath(f.path),
    at: now,
    action: prev && prev.action === 'créé' && f.action === 'modifié' ? 'créé' : f.action,
    add: (prev && f.action !== 'lu' ? prev.add : 0) + f.add,
    del: (prev && f.action !== 'lu' ? prev.del : 0) + f.del,
    diff: f.diff ?? prev?.diff,
  }
  return { ...s, files: [merged, ...s.files.filter(x => x.path !== f.path)].slice(0, 30) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agent-room', description: 'Ouvre la chambre des agents Claude dans un panneau' })
    const saved = (await $.store.get('prefs')) as Partial<RoomPrefs> | undefined
    if (saved && typeof saved === 'object') await update($, prefs, p => ({ ...p, ...saved, file: '' }))
    void $.ui.open({ id: PANE, title: 'Agent Room' })
    return next(e)
  })

  on('command.run', { command: 'agent-room' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agent Room' })
    return { text: 'La chambre des agents est ouverte.' }
  })

  /* ----- naissance d'un sous-agent ----- */
  on('agent.spawn', async ($, e, next) => {
    const key = e.tool_use_id || `spawn-${Date.now()}`
    const role = inferRole(`${e.subagentType} ${e.description} ${e.prompt}`)
    const name = niceName(e.description, e.subagentType)
    await change($, (s, now) => {
      const i = s.seq
      const n = s.agents.filter(a => a.status !== 'dead').length
      const agent: RoomAgent = {
        key, name, role, color: COLORS[i % COLORS.length], hair: HAIR[(i * 3) % HAIR.length], skin: SKIN[(i * 7) % SKIN.length],
        station: 'spawn', slot: -1, x: SPAWN.x - (n % 3) * 12, y: SPAWN.y + Math.floor(n / 3) * 10,
        fromX: SPAWN.x, fromY: SPAWN.y, movedAt: now, face: 'up', sit: false, status: 'work',
        spawnedAt: now, task: short(e.prompt, 1500), bubble: "Bien reçu chef, je m'en occupe !", bubbleAt: now + 1200,
      }
      agent.fromX = agent.x; agent.fromY = agent.y
      let t: RoomState = { ...s, seq: s.seq + 1, agents: [...s.agents, agent], main: { ...s.main, bubble: `Je crée ${name} pour : ${short(e.description, 60)}`, bubbleAt: now, activeAt: now } }
      return feed(t, now, 'Claude', '#d97757', `crée ${name} (${role}) : ${e.description}`)
    })
    later($, key, 2600, (s, now) => setAgent(s, key, a => (a.station === 'spawn' ? moveTo(s, a, ROLE_STATION[a.role] ?? 'code', now) : a)))
    const res = await next(e)
    if (res.deny !== undefined) {
      clearTimers(key)
      await change($, s => ({ ...s, agents: s.agents.filter(a => a.key !== key) }))
    } else if (res.agentId) {
      const id = res.agentId
      await change($, s => setAgent(s, key, a => ({ ...a, id })))
    }
    return res
  }).catch(($, e, next) => next(e))

  /* ----- fin d'un sous-agent ----- */
  on('turn.complete', async ($, e, next) => {
    const res = await next(e)
    if (!e.agentId) return res
    const st = await read($, room)
    const a = findByLoop(st, e.agentId)
    if (!a || a.status !== 'work') return res
    const key = a.key
    const report = short(e.answer || (e.isAborted ? 'Interrompu.' : 'Mission accomplie.'), 110)
    clearTimers(key)
    await change($, (s, now) => {
      let t = setAgent(s, key, x => ({ ...moveTo(s, { ...x, status: 'report' }, 'handoff', now), status: 'report', tool: undefined }))
      return feed(t, now, a.name, a.color, `rapport : ${report}`)
    })
    const s1 = await read($, room)
    const walk1 = walkMs(s1.agents.find(x => x.key === key)!)
    later($, key, walk1 + 200, (s, now) => setAgent(s, key, x => ({ ...x, bubble: `Rapport : ${report}`, bubbleAt: now })))
    later($, key, walk1 + 2600, (s, now) => ({ ...s, main: { ...s.main, bubble: `Merci ${a.name}, beau travail !`, bubbleAt: now } }))
    later($, key, walk1 + 4200, (s, now) => setAgent(s, key, x => ({ ...moveTo(s, x, 'lounge', now), status: 'lounge' })))
    const p = await read($, prefs)
    if (p.ending === 'pompe') scheduleRetire($, key, walk1 + 4200 + 3500 + RETIRE_DELAY)
    return res
  })

  /* ----- chaque appel d'outil ----- */
  on('tool.call', async ($, e, next) => {
    const tool: string = e.tool
    if (tool === 'Agent' || tool === 'Task') return next(e)
    const input = e as any
    const file: string = input.file_path || input.notebook_path || ''
    let before = ''
    let existed = true
    if (file && (tool === 'Edit' || tool === 'MultiEdit' || tool === 'Write')) {
      try { existed = await $.fs.exists(file) } catch { existed = true }
      if (existed && tool !== 'Write') { try { before = await $.fs.read(file) } catch { before = '' } }
    }
    const st = await read($, room)
    const sub = findByLoop(st, e.agentId)
    if (e.agentId && !sub) return next(e) // boucles internes (compaction, mémoire…)
    const who = sub ? sub.name : 'Claude'
    const color = sub ? sub.color : '#d97757'
    const what = describe(tool, input)

    await change($, (s, now) => {
      let t = s
      if (sub) {
        clearTimers(sub.key)
        t = setAgent(t, sub.key, a => {
          const station = TOOL_STATION[tool] ?? (tool.startsWith('mcp__') ? 'library' : ROLE_STATION[a.role] ?? 'code')
          const moved = a.station === 'spawn' && now - a.spawnedAt < 2600 ? a : moveTo(t, a, station, now)
          return { ...moved, status: 'work', tool: tool, bubble: `[${tool}] ${what}`, bubbleAt: now, bubbleErr: false }
        })
      } else {
        t = { ...t, main: { ...t.main, bubble: `[${tool}] ${what}`, bubbleAt: now, activeAt: now } }
      }
      if (file && (tool === 'Read')) t = touchFile(t, now, { path: file, action: 'lu', by: who, color, add: 0, del: 0 })
      return feed(t, now, who, color, `${tool} · ${what}`)
    })

    const res = await next(e)
    const failed = res.deny !== undefined || res.isError === true
    if (failed) {
      await change($, (s, now) => {
        let t = sub ? setAgent(s, sub.key, a => ({ ...a, errAt: now, bubble: `${tool} a échoué`, bubbleAt: now, bubbleErr: true })) : s
        return feed(t, now, who, color, `✗ ${tool} a échoué`)
      })
      return res
    }
    if (file && (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit')) {
      let diff = ''
      let add = 0, del = 0
      if (tool === 'Write') {
        const content = String(input.content ?? '')
        diff = hunk('', content, 1)
        add = linesOf(content).length
      } else {
        const edits: Array<{ old_string: string; new_string: string }> = tool === 'Edit' ? [input] : input.edits ?? []
        diff = edits.map(ed => {
          const idx = before.indexOf(ed.old_string)
          const line = idx >= 0 ? before.slice(0, idx).split('\n').length : 1
          add += linesOf(ed.new_string).length
          del += linesOf(ed.old_string).length
          return hunk(ed.old_string, ed.new_string, line)
        }).join('\n')
      }
      const action = tool === 'Write' && !existed ? 'créé' : 'modifié'
      await change($, (s, now) => {
        let t = touchFile(s, now, { path: file, action, by: who, color, add, del, diff: clip(diff) })
        return feed(t, now, who, color, `${action === 'créé' ? '✚ crée' : '✎ modifie'} ${shortPath(file)} (+${add} −${del})`)
      })
    }
    return res
  }).catch(($, e, next) => next(e))

  /* ----- le panneau ----- */
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as any
    const { Box, Text, Button, Select, Code } = els
    const s = { ...EMPTY, ...(await read($, room)) }
    const p = await read($, prefs)
    const now = await $.clock.now()
    const world = WORLDS[p.world] ?? WORLDS.studio
    const living = s.agents.filter(a => a.status !== 'dead')
    const active = living.filter(a => a.status === 'work').length
    const selected = s.files.find(f => f.path === p.file) ?? s.files.find(f => f.action !== 'lu')
    const edited = s.files.filter(f => f.action !== 'lu')
    const setPref = (patch: Partial<RoomPrefs>) => async () => {
      await update($, prefs, old => ({ ...old, ...patch }))
      const next = await read($, prefs)
      await $.store.set('prefs', { world: next.world, ending: next.ending })
    }

    const header = (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Select key="world" label="Monde" value={world.id} options={Object.values(WORLDS).map(w => ({ value: w.id, label: `${w.icon} ${w.name}` }))}
          onSelect={(v: string) => void setPref({ world: v })()} />
        <Select key="ending" label="Fin" value={p.ending} options={[{ value: 'pompe', label: '💥 À la pompe' }, { value: 'cafe', label: '☕ Pause café' }]}
          onSelect={(v: string) => void setPref({ ending: v })()} />
        {s.agents.length > 0 && <Button key="reset" plain onPress={() => { for (const k of timers.keys()) clearTimers(k); void update($, room, () => EMPTY) }}>⟲ Vider</Button>}
      </Box>
    )

    const roster = (
      <Box flexDirection="column">
        <Text bold>Claude · {world.claude} <Text dimColor>{active} sous-agent{active > 1 ? 's' : ''} au travail</Text></Text>
        {living.map(a => (
          <Text key={a.key}>
            <Text color={a.color}>■</Text> {a.name} <Text dimColor>{a.role}</Text> · {statusText(a, world.status, now)}
          </Text>
        ))}
      </Box>
    )

    const filesBlock = (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Ce que Claude modifie</Text>
        {edited.length === 0 && <Text dimColor>Aucun fichier modifié pour l'instant. Demande à Claude de créer un site ou de changer ton projet.</Text>}
        {edited.slice(0, 10).map(f => (
          <Button key={`f:${f.path}`} plain onPress={() => void update($, prefs, old => ({ ...old, file: f.path }))}>
            {selected?.path === f.path ? '▸ ' : '  '}{f.action === 'créé' ? '✚' : '✎'} {f.short} <Text color="green">+{f.add}</Text> <Text color="red">−{f.del}</Text> <Text dimColor>· {f.by}</Text>
          </Button>
        ))}
        {selected?.diff && <Text dimColor>Dernier changement de {selected.short} par {selected.by} :</Text>}
        {selected?.diff && <Code source={selected.diff} format="diff" path={selected.path} wrap="truncate-end" />}
      </Box>
    )

    const feedBlock = (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Journal</Text>
        {s.feed.length === 0 && <Text dimColor>En attente de Claude…</Text>}
        {s.feed.slice(-8).reverse().map((f, i) => (
          <Text key={`feed-${f.at}-${i}`} wrap="truncate-end"><Text dimColor>{clock(f.at)}</Text> <Text color={f.color}>{f.who}</Text> {f.text}</Text>
        ))}
      </Box>
    )

    if (e.surface === 'terminal') {
      return <Box flexDirection="column">{header}{roster}{filesBlock}{feedBlock}</Box>
    }
    const { Svg } = els
    const svg = renderScene(s, world.id, now)
    return (
      <Box flexDirection="column">
        {header}
        <Svg source={svg} alt={`Chambre ${world.name} : Claude et ${living.length} sous-agent(s)`} isInteractive />
        {roster}
        {filesBlock}
        {feedBlock}
      </Box>
    )
  })
}

function scheduleRetire($: any, key: string, delay: number) {
  later($, key, delay, (s, now) => {
    const a = s.agents.find(x => x.key === key)
    if (!a || a.status !== 'lounge') return s
    const line = EXEC_LINES[s.seq % EXEC_LINES.length].replace('{name}', a.name)
    const t = setAgent(s, key, x => ({ ...x, status: 'dead', deadAt: now + 600, bubble: undefined }))
    return feed({ ...t, main: { ...t.main, bubble: line, bubbleAt: now } }, now, a.name, a.color, '💥 retiré du service à la pompe')
  })
  later($, key, delay + 600 + RETIRE.end * 1000, s => ({ ...s, agents: s.agents.filter(a => a.key !== key) }))
}

function statusText(a: RoomAgent, overrides: Record<string, string>, now: number) {
  if (a.status === 'report') return 'Remet son rapport'
  if (a.status === 'lounge') return overrides.coffee ?? 'En pause'
  if ((now - a.movedAt) / 1000 < route(a.fromX, a.fromY, a.x, a.y).dur) return 'En marche'
  if (a.station === 'spawn') return 'Arrive…'
  const act = ACTIVITY[a.station]
  return (overrides[act] ?? LABEL[act] ?? 'Au travail') + (a.tool ? ` · ${a.tool}` : '')
}
function clock(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function describe(tool: string, i: any): string {
  const f = i.file_path || i.notebook_path || i.path || ''
  switch (tool) {
    case 'Read': return `je lis ${shortPath(f)}`
    case 'Write': return `j'écris ${shortPath(f)}`
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return `je modifie ${shortPath(f)}`
    case 'Grep': return `cherche "${short(i.pattern, 30)}"`
    case 'Glob': return `liste ${short(i.pattern, 30)}`
    case 'Bash': return `$ ${short(i.command, 60)}`
    case 'WebSearch': return `recherche : ${short(i.query, 50)}`
    case 'WebFetch': return `lit ${short(i.url, 50)}`
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': return 'met à jour les tâches'
    default: return tool.startsWith('mcp__') ? tool.split('__').slice(1).join(' · ') : tool
  }
}
void CODE_DESKS; void MAIN_SEAT
