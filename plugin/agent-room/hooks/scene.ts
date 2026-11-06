/*
 * Dessin SVG de la chambre (320×208 pixels du monde, agrandis sans lissage).
 * Les animations sont en SMIL avec des "begin" négatifs calculés depuis
 * l'heure de chaque événement : un nouveau rendu reprend là où on en était.
 */
import type { RoomAgent, RoomState } from '../types'

export const W = 320
export const H = 208
export const MAIN_SEAT = { x: 160, y: 92 }
export const SPAWN = { x: 112, y: 114 }
export const WALK_SPEED = 42
export const CORRIDOR_Y = 112

/* ------------------------------------------------------------------ */
/* Postes                                                              */
/* ------------------------------------------------------------------ */
export type Spot = { x: number; y: number; face: 'up' | 'down'; sit?: boolean }
export const CODE_DESKS = [
  { x: 112, y: 126 }, { x: 174, y: 126 }, { x: 112, y: 160 }, { x: 174, y: 160 },
]
export const STATIONS: Record<string, Spot[]> = {
  whiteboard: [{ x: 28, y: 50, face: 'up' }, { x: 50, y: 50, face: 'up' }, { x: 72, y: 50, face: 'up' }],
  library: [{ x: 234, y: 55, face: 'up' }, { x: 256, y: 55, face: 'up' }, { x: 290, y: 56, face: 'up' }],
  code: CODE_DESKS.map(d => ({ x: d.x + 18, y: d.y + 21, face: 'up' as const, sit: true })),
  bench: [{ x: 22, y: 184, face: 'up' }, { x: 43, y: 184, face: 'up' }, { x: 64, y: 184, face: 'up' }],
  lounge: [
    { x: 252, y: 151, face: 'down', sit: true }, { x: 268, y: 151, face: 'down', sit: true }, { x: 284, y: 151, face: 'down', sit: true },
    { x: 246, y: 188, face: 'down' }, { x: 264, y: 194, face: 'down' }, { x: 280, y: 186, face: 'down' },
  ],
  handoff: [{ x: 160, y: 117, face: 'up' }, { x: 146, y: 117, face: 'up' }, { x: 174, y: 117, face: 'up' }],
}

const aisle = (x: number, y: number) => {
  if (y <= CORRIDOR_Y) return x
  if (x < 86) return 92
  if (x > 96 && x < 222) return 160
  return x
}

/** Chemin en L par le couloir central, pour ne pas traverser les meubles. */
export function route(fx: number, fy: number, tx: number, ty: number) {
  const pts: Array<[number, number]> = [[fx, fy]]
  const fa = aisle(fx, fy), ta = aisle(tx, ty)
  pts.push([fa, fy], [fa, CORRIDOR_Y], [ta, CORRIDOR_Y], [ta, ty], [tx, ty])
  const out: Array<[number, number]> = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  }
  let len = 0
  for (let i = 1; i < out.length; i++) len += Math.abs(out[i][0] - out[i - 1][0]) + Math.abs(out[i][1] - out[i - 1][1])
  return { pts: out, len, dur: len / WALK_SPEED }
}

/* ------------------------------------------------------------------ */
/* Pinceau : regroupe les rectangles par couleur en un seul <path>.    */
/* ------------------------------------------------------------------ */
class Paint {
  private m = new Map<string, string[]>()
  r(x: number, y: number, w: number, h: number, c: string) {
    if (w <= 0 || h <= 0) return
    const k = this.m.get(c)
    const d = `M${Math.round(x)} ${Math.round(y)}h${w}v${h}h${-w}z`
    if (k) k.push(d)
    else this.m.set(c, [d])
  }
  out() {
    let s = ''
    for (const [c, d] of this.m) s += `<path fill="${c}" d="${d.join('')}"/>`
    this.m.clear()
    return s
  }
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt)
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b)
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}
export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
const f2 = (n: number) => (Math.round(n * 100) / 100).toString()
const rr = (p: Paint, x: number, y: number, w: number, h: number, c: string) => {
  p.r(x + 2, y, w - 4, h, c); p.r(x, y + 2, 2, h - 4, c); p.r(x + w - 2, y + 2, 2, h - 4, c)
  p.r(x + 1, y + 1, 1, 1, c); p.r(x + w - 2, y + 1, 1, 1, c); p.r(x + 1, y + h - 2, 1, 1, c); p.r(x + w - 2, y + h - 2, 1, 1, c)
}

/* ------------------------------------------------------------------ */
/* Mondes                                                              */
/* ------------------------------------------------------------------ */
export type World = {
  id: string
  name: string
  icon: string
  claude: string
  glyphs: string[]
  status: Record<string, string>
  bg: (p: Paint) => void
  desk: (p: Paint) => void
  light: string
}

function codeDesks(p: Paint, top: string, front: string, screen: string, chair: string) {
  for (const d of CODE_DESKS) {
    p.r(d.x + 13, d.y + 17, 10, 5, chair); p.r(d.x + 13, d.y + 17, 10, 1, shade(chair, 0.2))
    p.r(d.x, d.y, 36, 5, top); p.r(d.x, d.y, 36, 1, shade(top, 0.2))
    p.r(d.x, d.y + 5, 36, 7, front); p.r(d.x, d.y + 12, 36, 1, 'rgba(0,0,0,0.3)')
    p.r(d.x + 11, d.y - 9, 14, 10, screen); p.r(d.x + 17, d.y + 1, 2, 2, screen)
    p.r(d.x + 12, d.y - 8, 12, 8, '#161a24')
  }
}

const studio: World = {
  id: 'studio', name: 'Studio dev', icon: '💻', claude: 'Orchestrateur',
  glyphs: ['{ }', '=>', '</>', ';', 'fn', '++'],
  status: {},
  light: 'rgba(14,8,30,0.22)',
  bg(p) {
    const R = rng(42)
    p.r(0, 36, W, H - 36, '#5d3f33')
    for (let y = 36; y < H; y += 6) {
      p.r(0, y, W, 1, '#4c3229')
      const off = ((y / 6) % 2) * 17
      for (let x = -off; x < W; x += 34) p.r(Math.max(0, x), y + 1, 1, 5, '#4f352b')
    }
    p.r(0, 0, W, 36, '#2b2340'); p.r(0, 25, W, 10, '#3a2f55'); p.r(0, 25, W, 1, '#4a3d6b'); p.r(0, 34, W, 2, '#1c1629')
    // tableau blanc
    p.r(10, 4, 76, 26, '#9aa3b5'); p.r(12, 6, 72, 22, '#f4f6fb'); p.r(18, 30, 60, 2, '#7b8496')
    p.r(16, 8, 30, 1, '#c4cad8'); p.r(16, 12, 14, 7, '#5ef1ff'); p.r(17, 13, 12, 5, '#f4f6fb')
    p.r(32, 15, 10, 1, '#ff6ac1'); p.r(44, 12, 14, 7, '#7ee787'); p.r(45, 13, 12, 5, '#f4f6fb'); p.r(62, 16, 16, 1, '#555b6e')
    // poster + fenêtre
    p.r(92, 7, 16, 20, '#1d1730'); p.r(93, 8, 14, 9, '#ff7eb6'); p.r(93, 17, 14, 9, '#6b3fa0'); p.r(96, 11, 6, 6, '#ffe28a')
    p.r(124, 4, 72, 26, '#4a3a2c'); p.r(126, 6, 68, 22, '#141a3a'); p.r(126, 20, 68, 8, '#2a2457')
    for (let i = 0; i < 16; i++) p.r(127 + Math.floor(R() * 66), 7 + Math.floor(R() * 11), 1, 1, '#c9d4ff')
    p.r(178, 9, 6, 6, '#f6f0d0'); p.r(159, 6, 2, 22, '#4a3a2c'); p.r(126, 16, 68, 1, '#4a3a2c')
    // horloge
    p.r(201, 8, 13, 13, '#1b1528'); p.r(202, 9, 11, 11, '#efe6d2'); p.r(207, 10, 1, 5, '#2a2238'); p.r(207, 14, 4, 1, '#2a2238')
    // bibliothèque + serveurs
    p.r(220, 4, 52, 40, '#6b4a2f'); p.r(222, 6, 48, 36, '#3e2a1b')
    const books = ['#c0392b', '#2e86de', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#e67e22', '#7f8c8d']
    for (let s = 0; s < 4; s++) {
      const sy = 6 + s * 9
      p.r(222, sy + 8, 48, 1, '#6b4a2f')
      for (let x = 223; x < 266;) { const bw = 2 + Math.floor(R() * 3), bh = 5 + Math.floor(R() * 3); p.r(x, sy + 8 - bh, bw, bh, books[Math.floor(R() * 8)]); x += bw }
    }
    for (let k = 0; k < 2; k++) {
      const x = 276 + k * 20
      p.r(x, 6, 18, 38, '#1f2230'); p.r(x + 1, 7, 16, 36, '#2b2f42')
      for (let u = 0; u < 7; u++) { p.r(x + 2, 9 + u * 5, 14, 3, '#171a26'); p.r(x + 11, 10 + u * 5, 1, 1, '#57f287'); p.r(x + 13, 10 + u * 5, 1, 1, u % 2 ? '#ffb86b' : '#57f287') }
    }
    // tapis
    rr(p, 102, 76, 116, 46, '#3b2b52'); rr(p, 105, 79, 110, 40, '#4a3768')
    rr(p, 232, 142, 76, 50, '#2c4b4f'); rr(p, 235, 145, 70, 44, '#35605f')
    // plante
    p.r(110, 40, 10, 8, '#8b5a3c'); p.r(114, 30, 1, 10, '#2a6b45')
    for (const [x, y] of [[108, 34], [113, 30], [117, 33], [110, 28], [116, 26], [112, 24], [119, 29]]) p.r(x, y, 3, 2, '#2e8a56')
    codeDesks(p, '#a77b54', '#7c5639', '#1d1b26', '#3b3350')
    // banc de test
    p.r(4, 152, 76, 6, '#59606e'); p.r(4, 158, 76, 12, '#3d4250'); p.r(4, 170, 76, 2, 'rgba(0,0,0,0.3)')
    p.r(7, 140, 22, 13, '#2a2f3b'); p.r(9, 142, 14, 9, '#0c1a12'); for (let x = 0; x < 14; x++) p.r(9 + x, 146 + Math.round(Math.sin(x * 0.9) * 2), 1, 1, '#57f287')
    p.r(31, 138, 22, 15, '#22252f'); p.r(33, 140, 18, 10, '#05110a'); for (let r = 0; r < 4; r++) p.r(34, 141 + r * 2, 4 + r * 3, 1, '#2f9e5a')
    p.r(55, 145, 22, 8, '#30343f'); ['#ff6ac1', '#5ef1ff', '#f1fa8c', '#7ee787', '#ffb86b'].forEach((c, k) => { p.r(57 + k * 4, 141, 2, 7, '#c9d6e3'); p.r(57 + k * 4, 144, 2, 4, c) })
    p.r(4, 176, 9, 22, '#23262f')
    // salon
    p.r(236, 128, 64, 10, '#7a3e5c'); p.r(238, 138, 60, 9, '#8c4a6b'); p.r(234, 132, 5, 16, '#6b3550'); p.r(297, 132, 5, 16, '#6b3550')
    p.r(229, 148, 6, 2, '#2a2438'); p.r(231, 124, 2, 24, '#3a3348'); p.r(226, 118, 12, 7, '#f6c97a')
    p.r(252, 164, 32, 8, '#9a6a45'); p.r(258, 165, 6, 4, '#2e86de'); p.r(270, 165, 3, 3, '#f2efe8')
    p.r(288, 174, 30, 32, '#5a4636'); p.r(293, 160, 18, 16, '#2b2f3a'); p.r(296, 166, 6, 3, '#57f287'); p.r(299, 170, 6, 4, '#15171d')
    // chat
    p.r(214, 177, 10, 5, '#e08a3c'); p.r(222, 175, 5, 4, '#e08a3c'); p.r(223, 177, 1, 1, '#3a2a20'); p.r(225, 177, 1, 1, '#3a2a20'); p.r(211, 180, 4, 1, '#e08a3c')
  },
  desk(p) {
    p.r(126, 86, 68, 8, '#9a6a45'); p.r(126, 86, 68, 1, '#b8845a'); p.r(126, 94, 68, 12, '#7a5236')
    p.r(128, 96, 30, 8, '#6d4930'); p.r(162, 96, 30, 8, '#6d4930'); p.r(126, 106, 68, 2, 'rgba(0,0,0,0.3)')
    for (const mx of [140, 168]) { p.r(mx, 76, 13, 9, '#22202e'); p.r(mx + 1, 77, 11, 7, '#2e2b3d'); p.r(mx + 5, 85, 3, 2, '#22202e') }
    p.r(129, 82, 6, 5, '#c66b3d'); p.r(128, 78, 3, 3, '#3fa66b'); p.r(132, 76, 3, 4, '#2e8a56'); p.r(134, 79, 3, 3, '#3fa66b')
    p.r(185, 83, 4, 4, '#f2efe8'); p.r(186, 84, 2, 1, '#6b3e26'); p.r(151, 99, 18, 5, '#2b2340'); p.r(152, 100, 16, 3, '#d97757')
  },
}

const GOLD = '#c9a24a', VEL = '#8e1b2e'
const opera: World = {
  id: 'opera', name: 'Opéra', icon: '🎭', claude: "Chef d'orchestre",
  glyphs: ['♪', '♫', '♩', '♬'],
  status: { coding: 'Joue sa partition', reading: 'Étudie une partition', planning: 'Compose', bash: 'Règle la régie', coffee: 'À la loge' },
  light: 'rgba(22,6,16,0.24)',
  bg(p) {
    p.r(0, 36, W, H - 36, '#4a1825')
    for (let y = 38; y < H; y += 8) for (let x = ((y - 38) / 8) % 2 ? 0 : 4; x < W; x += 8) p.r(x, y, 1, 1, '#6a2635')
    p.r(0, 0, W, 36, '#1b0b13'); p.r(118, 4, 84, 20, '#141a3d'); p.r(118, 24, 84, 10, '#6b4528')
    for (const [x0, w] of [[88, 30], [202, 16]]) { p.r(x0, 3, w, 31, VEL); for (let x = x0; x < x0 + w; x += 4) p.r(x, 3, 1, 31, '#6a1121') }
    p.r(86, 2, 134, 5, '#a11f35'); p.r(0, 33, W, 3, GOLD); p.r(0, 0, W, 2, '#9c7426')
    // partition géante
    p.r(10, 4, 76, 26, GOLD); p.r(12, 6, 72, 22, '#f3e8cc')
    for (const sy of [9, 19]) for (let i = 0; i < 5; i++) p.r(14, sy + i * 2, 68, 1, '#c6b088')
    for (let k = 0; k < 9; k++) { p.r(20 + k * 7, 10 + (k * 3) % 8, 2, 2, '#2a1a10'); p.r(21 + k * 7, 6 + (k * 3) % 8, 1, 4, '#2a1a10') }
    p.r(20, 30, 2, 8, '#4a2a14'); p.r(74, 30, 2, 8, '#4a2a14')
    // armoire + orgue
    p.r(220, 4, 52, 40, '#4a2a18'); p.r(222, 6, 48, 36, '#2a160c')
    for (let s = 0; s < 4; s++) { p.r(222, 14 + s * 9, 48, 1, '#5e3a22'); for (let x = 224; x < 264; x += 8) { p.r(x, 9 + s * 9, 6, 5, '#efe2c2'); p.r(x + 2, 9 + s * 9, 1, 5, '#a11f35') } }
    p.r(274, 30, 40, 15, '#4a2a18'); p.r(280, 34, 28, 3, '#efe6d6')
    for (let i = 0; i < 10; i++) { const t = 6 + Math.round(Math.abs(i - 4.5) * 2.2); p.r(275 + i * 4, t, 3, 30 - t, GOLD); p.r(275 + i * 4, t, 1, 30 - t, '#ecd28a') }
    rr(p, 102, 76, 116, 46, '#5e1826'); rr(p, 105, 79, 110, 40, '#741f30')
    rr(p, 232, 142, 76, 50, '#2a1638'); rr(p, 235, 145, 70, 44, '#3a1f4d')
    // candélabre
    p.r(110, 44, 10, 4, GOLD); p.r(114, 30, 2, 14, GOLD); p.r(108, 30, 14, 2, GOLD)
    for (let i = 0; i < 3; i++) { p.r(108 + i * 6, 24, 2, 5, '#f3ead6'); p.r(108 + i * 6, 21, 2, 3, '#ffb347') }
    // pupitres
    for (const d of CODE_DESKS) {
      p.r(d.x + 13, d.y + 17, 10, 5, VEL); p.r(d.x, d.y, 36, 3, '#5a3322'); p.r(d.x, d.y, 36, 1, GOLD); p.r(d.x, d.y + 3, 36, 9, '#3a2016')
      p.r(d.x + 11, d.y - 9, 14, 8, '#1a1a1a'); p.r(d.x + 12, d.y - 8, 12, 6, '#d8ccb0'); p.r(d.x + 17, d.y - 1, 2, 4, '#1a1a1a')
      p.r(d.x + 27, d.y - 8, 5, 10, '#8a4a22'); p.r(d.x + 29, d.y - 12, 1, 4, '#2a160c')
    }
    // régie
    p.r(4, 152, 76, 6, '#2b2b34'); p.r(4, 158, 76, 12, '#1e1e26')
    for (let i = 0; i < 17; i++) { p.r(7 + i * 4, 153, 1, 4, '#0c0c10'); p.r(6 + i * 4, 154 + (i % 3), 3, 1, i % 4 ? '#d8d8e0' : '#ff6b6b') }
    p.r(7, 140, 22, 13, '#22222a'); for (let b = 0; b < 6; b++) p.r(10 + b * 3, 146 - (b % 3), 2, 4 + (b % 3), '#57f287')
    p.r(31, 138, 22, 15, '#22222a'); p.r(33, 140, 18, 10, '#07101c'); p.r(57, 146, 18, 7, '#30343f'); p.r(62, 140, 9, 7, '#1a1c22')
    p.r(4, 176, 9, 22, '#141418'); p.r(6, 180, 5, 5, '#2a2a30'); p.r(6, 189, 5, 5, '#2a2a30')
    // loge
    p.r(236, 128, 64, 10, VEL); p.r(238, 138, 60, 9, '#a52a40'); p.r(234, 130, 5, 18, '#6a1121'); p.r(297, 130, 5, 18, '#6a1121')
    p.r(231, 124, 2, 24, GOLD); p.r(226, 124, 12, 2, GOLD); for (let i = 0; i < 3; i++) { p.r(226 + i * 4, 119, 2, 4, '#f3ead6'); p.r(226 + i * 4, 117, 2, 2, '#ffb347') }
    p.r(252, 164, 32, 8, '#efe6dc'); p.r(262, 157, 3, 8, '#1f4d2b')
    p.r(288, 174, 30, 32, '#3a2016'); p.r(293, 160, 22, 14, '#2a160c'); for (let k = 0; k < 5; k++) p.r(295 + k * 4, 163, 2, 9, ['#1f4d2b', '#7a1c2a', '#d9b45a'][k % 3])
    p.r(212, 175, 10, 5, '#1b1b22'); p.r(220, 173, 5, 4, '#1b1b22'); p.r(221, 175, 1, 1, '#ffd166'); p.r(223, 175, 1, 1, '#ffd166'); p.r(210, 180, 18, 3, VEL)
  },
  desk(p) {
    p.r(130, 86, 60, 8, '#5a3322'); p.r(130, 86, 60, 1, GOLD); p.r(130, 94, 60, 12, '#3a2016'); p.r(130, 94, 60, 1, GOLD)
    for (let x = 134; x < 188; x += 9) p.r(x, 97, 5, 6, '#2e190f')
    p.r(145, 82, 2, 6, '#1a1a1a'); p.r(139, 76, 14, 7, '#1a1a1a'); p.r(140, 77, 12, 5, '#f3e8cc')
    p.r(185, 82, 3, 5, '#cde8f5'); p.r(151, 99, 18, 5, '#2a160e'); p.r(152, 100, 16, 3, GOLD)
  },
}

const garden: World = {
  id: 'garden', name: 'Jardin', icon: '🌻', claude: 'Jardinier en chef',
  glyphs: ['✿', '❀', '☘', '✽'],
  status: { coding: 'Jardine', reading: 'Observe la serre', planning: 'Trace le potager', bash: "Teste l'arrosage", coffee: 'Au barbecue' },
  light: 'rgba(0,0,0,0)',
  bg(p) {
    const R = rng(7)
    p.r(0, 36, W, H - 36, '#4f8a3c')
    for (let i = 0; i < 500; i++) p.r(Math.floor(R() * W), 36 + Math.floor(R() * 172), 1, 2, R() < 0.5 ? '#5f9c48' : '#447a33')
    for (let i = 0; i < 50; i++) p.r(Math.floor(R() * W), 40 + Math.floor(R() * 168), 1, 1, ['#ffffff', '#ffe066', '#ff9ec7'][Math.floor(R() * 3)])
    p.r(0, 0, W, 6, '#7cc8f5'); p.r(0, 6, W, 6, '#94d4f8'); p.r(0, 12, W, 6, '#b2e2fb')
    p.r(0, 14, W, 20, '#2f6b2a'); p.r(0, 27, W, 2, '#b88b5c'); p.r(0, 31, W, 2, '#b88b5c')
    for (let x = 2; x < W; x += 12) p.r(x, 24, 3, 12, '#cfa274')
    p.r(298, 2, 10, 10, '#ffe066'); p.r(296, 4, 14, 6, '#ffe066')
    // panneau du potager
    p.r(18, 30, 3, 8, '#6e4628'); p.r(74, 30, 3, 8, '#6e4628'); p.r(10, 4, 76, 26, '#8a5a32'); p.r(12, 6, 72, 22, '#e8d3a8')
    for (let k = 0; k < 4; k++) { p.r(16 + k * 17, 10, 13, 6, '#6ccf5a'); p.r(16 + k * 17, 19, 13, 6, '#c08a55') }
    // serre + ruches
    p.r(220, 10, 52, 34, '#e6f0ec'); p.r(222, 12, 48, 31, '#bfe6e0'); p.r(218, 8, 56, 3, '#e6f0ec'); p.r(226, 5, 40, 3, '#e6f0ec')
    for (let i = 0; i < 6; i++) p.r(222 + i * 8, 12, 1, 31, '#e6f0ec')
    for (const sy of [24, 39]) { p.r(223, sy, 46, 1, '#8a6a4a'); for (let k = 0; k < 6; k++) { p.r(225 + k * 7, sy - 3, 4, 3, '#c66b3d'); p.r(225 + k * 7, sy - 7, 4, 4, k % 2 ? '#3fa66b' : '#5cbf6a') } }
    for (let k = 0; k < 2; k++) { const x = 278 + k * 18; p.r(x - 1, 13, 16, 3, '#b88b5c'); for (let b = 0; b < 3; b++) p.r(x, 16 + b * 8, 14, 8, b % 2 ? '#f7e08a' : '#f2c94c'); p.r(x - 1, 40, 16, 4, '#6e4628') }
    rr(p, 102, 76, 116, 46, '#b3a37e'); rr(p, 105, 79, 110, 40, '#c4b48d')
    for (let y = 142; y < 192; y += 4) for (let x = 232; x < 308; x += 4) p.r(x, y, 4, 4, ((x - 232) / 4 + (y - 142) / 4) % 2 ? '#efe9e0' : '#d9534f')
    // tournesol
    p.r(110, 41, 10, 7, '#c66b3d'); p.r(114, 26, 2, 15, '#3f8a36'); p.r(111, 21, 9, 5, '#ffcf33'); p.r(113, 19, 5, 9, '#ffcf33'); p.r(113, 22, 5, 3, '#6b3e1e')
    // carrés potagers
    for (const d of CODE_DESKS) {
      p.r(d.x + 14, d.y + 17, 8, 4, '#a77b54'); p.r(d.x, d.y, 36, 12, '#9a6a3a'); p.r(d.x + 2, d.y + 2, 32, 8, '#5a3a24')
      for (let k = 0; k < 4; k++) { p.r(d.x + 5 + k * 7, d.y + 4, 4, 3, '#6ccf5a'); p.r(d.x + 6 + k * 7, d.y + 7, 2, 2, ['#ff8c2a', '#e8402e', '#ff3d5a', '#6ccf5a'][(d.x + d.y + k) % 4]) }
      p.r(d.x + 17, d.y - 6, 1, 6, '#8a5a32'); p.r(d.x + 13, d.y - 9, 9, 4, '#e8d3a8')
    }
    // établi d'arrosage
    p.r(4, 152, 76, 6, '#9a6a3a'); p.r(4, 158, 76, 12, '#7a5236'); for (let k = 0; k < 4; k++) { p.r(8 + k * 5, 147, 4, 5, '#c66b3d'); p.r(9 + k * 5, 144, 2, 3, '#5cbf6a') }
    p.r(41, 134, 1, 18, '#cfd6de'); p.r(37, 133, 9, 2, '#e8eef4'); p.r(58, 143, 8, 9, '#3a7bd5'); p.r(66, 148, 10, 1, '#2f6b2a')
    p.r(4, 178, 10, 20, '#7a5236'); p.r(5, 178, 8, 2, '#5aa7d8')
    // banc, lanterne, nappe, barbecue
    p.r(236, 128, 64, 3, '#b8844e'); p.r(236, 133, 64, 3, '#b8844e'); p.r(238, 139, 60, 8, '#a77b54'); p.r(238, 128, 2, 12, '#6e4628'); p.r(296, 128, 2, 12, '#6e4628')
    p.r(231, 120, 2, 28, '#6e4628'); p.r(227, 114, 10, 8, '#2b2b2b'); p.r(228, 115, 8, 6, '#ffd27a')
    p.r(254, 164, 28, 7, '#f2f2ee'); p.r(259, 158, 5, 7, '#ffe066')
    p.r(292, 184, 24, 12, '#2a2a2e'); p.r(293, 181, 22, 1, '#9aa3b5'); for (let k = 0; k < 4; k++) p.r(296 + k * 5, 179, 4, 2, '#b5653a'); p.r(294, 196, 2, 8, '#2a2a2e'); p.r(312, 196, 2, 8, '#2a2a2e')
    // hérisson
    p.r(212, 177, 11, 5, '#6b4a30'); for (let k = 0; k < 6; k++) p.r(212 + k * 2, 175 + (k % 2), 1, 2, '#4a3020'); p.r(222, 178, 4, 3, '#d9b38c'); p.r(225, 179, 1, 1, '#1a1a1a')
  },
  desk(p) {
    p.r(126, 86, 68, 8, '#b07a48'); for (let x = 126; x < 194; x += 9) p.r(x, 86, 1, 8, '#93633a')
    p.r(130, 94, 4, 12, '#8a5a32'); p.r(186, 94, 4, 12, '#8a5a32'); p.r(128, 99, 64, 3, '#9a6a3a')
    p.r(130, 79, 5, 7, '#ffe066'); p.r(140, 81, 7, 5, '#3fa66b'); p.r(147, 80, 4, 1, '#3fa66b')
    p.r(191, 60, 2, 46, '#e8e0d0')
    for (let x = 128; x < 198; x++) { const h = 9 - Math.round(Math.abs(x - 162) / 9); p.r(x, 66 - h, 1, h, Math.floor((x - 128) / 7) % 2 ? '#ffffff' : '#e8504a') }
  },
}

const classroom: World = {
  id: 'classroom', name: 'Salle de classe', icon: '🏫', claude: 'Professeur',
  glyphs: ['A+', 'abc', '✎', '1+1', 'π'],
  status: { coding: 'Fait ses exercices', reading: 'Lit à la bibliothèque', planning: 'Passe au tableau', bash: 'Fait une expérience', coffee: 'En récré' },
  light: 'rgba(255,230,180,0.04)',
  bg(p) {
    for (let y = 36; y < H; y += 8) for (let x = 0; x < W; x += 8) p.r(x, y, 8, 8, (x / 8 + (y - 36) / 8) % 2 ? '#d3c9b2' : '#c4b99f')
    p.r(0, 0, W, 36, '#eadfc2'); p.r(0, 22, W, 12, '#8fb3a3'); p.r(0, 33, W, 3, '#5f7f70')
    // tableau noir
    p.r(10, 4, 76, 26, '#8a5a32'); p.r(12, 6, 72, 22, '#2f4f3a'); p.r(12, 28, 72, 2, '#7a5236')
    p.r(16, 8, 26, 1, '#cfd8cf'); p.r(16, 13, 12, 6, '#e8efe8'); p.r(17, 14, 10, 4, '#2f4f3a'); p.r(32, 16, 12, 1, '#ffb3c8'); p.r(48, 13, 12, 6, '#e8efe8'); p.r(49, 14, 10, 4, '#2f4f3a'); p.r(64, 20, 14, 1, '#ffe680')
    p.r(91, 6, 18, 14, '#f2efe6'); p.r(92, 7, 16, 12, '#7fc0e8'); p.r(94, 9, 4, 3, '#57b56a'); p.r(99, 8, 3, 6, '#57b56a'); p.r(103, 10, 4, 4, '#57b56a')
    p.r(124, 4, 72, 26, '#f4f1e8'); p.r(126, 6, 68, 22, '#a8dcfa'); p.r(130, 18, 14, 10, '#57b56a'); p.r(172, 16, 16, 12, '#4fa65f'); p.r(159, 6, 2, 22, '#f4f1e8'); p.r(126, 16, 68, 1, '#f4f1e8')
    p.r(201, 8, 13, 13, '#5f7f70'); p.r(202, 9, 11, 11, '#ffffff'); p.r(207, 10, 1, 5, '#2a2238'); p.r(207, 14, 4, 1, '#2a2238')
    p.r(220, 4, 52, 40, '#c08a55'); p.r(222, 6, 48, 36, '#8a5a32')
    const R = rng(11)
    for (let s = 0; s < 4; s++) { const sy = 6 + s * 9; p.r(222, sy + 8, 48, 1, '#c08a55'); for (let x = 223; x < 266;) { const bw = 2 + Math.floor(R() * 3); p.r(x, sy + 2, bw, 6, ['#e8504a', '#3d8fd6', '#f2c94c', '#57b56a', '#a66bd6'][Math.floor(R() * 5)]); x += bw } }
    p.r(276, 30, 38, 15, '#c08a55'); p.r(277, 9, 36, 21, '#d8eef6'); p.r(278, 10, 34, 19, '#7fc8e0'); p.r(278, 26, 34, 3, '#e6d29a')
    p.r(284, 15, 4, 2, '#ff8c2a'); p.r(298, 19, 4, 2, '#ffd23f'); p.r(290, 23, 4, 2, '#ff5c8a')
    rr(p, 102, 76, 116, 46, '#3d6b8a'); rr(p, 105, 79, 110, 40, '#4a7ea0')
    for (let y = 142; y < 192; y += 6) for (let x = 232; x < 308; x += 6) p.r(x, y, 6, 6, ['#e8504a', '#3d8fd6', '#f2c94c', '#57b56a'][((x - 232) / 6 + (y - 142) / 6) % 4])
    p.r(110, 41, 10, 7, '#e08850'); p.r(113, 28, 4, 13, '#4fa65f'); p.r(109, 29, 2, 5, '#4fa65f'); p.r(119, 31, 2, 5, '#4fa65f'); p.r(114, 26, 2, 2, '#ff6b9e')
    for (const d of CODE_DESKS) {
      p.r(d.x + 13, d.y + 16, 10, 6, '#3d6fb6'); p.r(d.x, d.y, 36, 6, '#c08a55'); p.r(d.x, d.y + 6, 36, 3, '#9a6a3a'); p.r(d.x + 2, d.y + 9, 2, 3, '#6b6f78'); p.r(d.x + 32, d.y + 9, 2, 3, '#6b6f78')
      p.r(d.x + 11, d.y + 1, 14, 4, '#fafafa'); p.r(d.x + 18, d.y + 1, 1, 4, '#d8d8d8'); p.r(d.x + 15, d.y - 5, 6, 4, '#fafafa')
    }
    p.r(4, 152, 76, 6, '#e9ecef'); p.r(4, 158, 76, 12, '#5a6b7a')
    p.r(10, 150, 12, 2, '#3a3f4c'); p.r(18, 140, 3, 10, '#3a3f4c'); p.r(13, 140, 6, 3, '#3a3f4c')
    for (let k = 0; k < 4; k++) { p.r(32 + k * 3, 142, 2, 9, '#dde8f0'); p.r(32 + k * 3, 146, 2, 5, ['#ff6ac1', '#5ef1ff', '#7ee787', '#ffd166'][k]) }
    p.r(46, 144, 5, 8, '#dde8f0'); p.r(46, 147, 5, 5, '#a66bd6'); p.r(60, 146, 4, 6, '#9aa3b5'); p.r(68, 144, 8, 8, '#dde8f0'); p.r(68, 148, 8, 4, '#7ee787')
    p.r(4, 176, 10, 22, '#c08a55'); p.r(5, 177, 8, 20, '#9a6a3a')
    for (const [x, c] of [[236, '#e8504a'], [258, '#f2c94c'], [280, '#3d8fd6']] as Array<[number, string]>) { p.r(x + 2, 128, 16, 4, c); p.r(x, 131, 20, 14, c); p.r(x + 2, 145, 16, 3, shade(c, -0.25)) }
    p.r(231, 118, 2, 30, '#8a5a32'); p.r(225, 120, 6, 9, '#a66bd6'); p.r(234, 121, 5, 7, '#ffd166')
    p.r(252, 164, 32, 8, '#c08a55'); p.r(256, 165, 7, 4, '#3d8fd6')
    p.r(288, 160, 30, 46, '#c08a55'); for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) { p.r(290 + k * 14, 162 + r * 11, 12, 9, '#8a5a32'); if ((r + k) % 3) p.r(293 + k * 14, 164 + r * 11, 6, 7, ['#e8504a', '#3d8fd6', '#57b56a', '#a66bd6'][(r + k) % 4]) }
    p.r(208, 180, 20, 3, '#3d8fd6'); for (let k = 0; k <= 20; k += 3) p.r(208 + k, 168, 1, 12, '#c8ccd6'); p.r(208, 167, 21, 1, '#c8ccd6'); p.r(220, 177, 3, 2, '#f2c094')
  },
  desk(p) {
    p.r(126, 86, 68, 8, '#c08a55'); p.r(126, 86, 68, 1, '#d8a46e'); p.r(126, 94, 68, 12, '#9a6a3a')
    p.r(128, 96, 26, 8, '#8a5a32'); p.r(166, 96, 26, 8, '#8a5a32')
    p.r(140, 77, 8, 7, '#3d8fd6'); p.r(141, 78, 3, 2, '#57b56a'); p.r(143, 84, 2, 2, '#5a5a5a')
    p.r(130, 81, 5, 6, '#e8504a'); p.r(152, 87, 14, 4, '#fafafa'); p.r(185, 82, 5, 5, '#e8402e'); p.r(187, 79, 1, 2, '#6b3e26')
    p.r(151, 99, 18, 5, '#2f4f3a'); p.r(152, 100, 16, 3, '#f2efe6')
  },
}

export const WORLDS: Record<string, World> = { studio, opera, garden, classroom }

const bgCache = new Map<string, string>()
function background(w: World) {
  let s = bgCache.get(w.id)
  if (!s) {
    const p = new Paint()
    w.bg(p)
    s = p.out()
    bgCache.set(w.id, s)
  }
  return s
}
const deskCache = new Map<string, string>()
function deskLayer(w: World) {
  let s = deskCache.get(w.id)
  if (!s) {
    const p = new Paint()
    w.desk(p)
    s = p.out()
    deskCache.set(w.id, s)
  }
  return s
}

/* ------------------------------------------------------------------ */
/* Personnages                                                         */
/* ------------------------------------------------------------------ */
type Look = { color: string; hair: string; skin: string; role: string; isMain?: boolean }

function sprite(a: Look, face: 'up' | 'down', sit: boolean) {
  const p = new Paint()
  const x = -5, y = sit ? 2 : 0
  const col = a.color, pants = '#2a2238'
  p.r(x + 1, -1, 8, 2, 'rgba(0,0,0,0.28)')
  if (!sit) { p.r(x + 2, y - 3, 2, 3, pants); p.r(x + 6, y - 3, 2, 3, pants); p.r(x + 2, y - 1, 2, 1, '#15111c'); p.r(x + 6, y - 1, 2, 1, '#15111c') }
  else if (face === 'down') { p.r(x + 2, y - 3, 2, 2, pants); p.r(x + 6, y - 3, 2, 2, pants) }
  p.r(x + 1, y - 9, 8, 6, col); p.r(x + 1, y - 4, 8, 1, shade(col, -0.3)); p.r(x + 4, y - 9, 2, 1, shade(col, 0.35))
  p.r(x, y - 9, 1, 4, shade(col, -0.15)); p.r(x + 9, y - 9, 1, 4, shade(col, -0.15)); p.r(x, y - 5, 1, 1, a.skin); p.r(x + 9, y - 5, 1, 1, a.skin)
  if (a.isMain) p.r(x, y - 10, 10, 2, shade(col, -0.2))
  p.r(x + 1, y - 16, 8, 7, a.skin)
  if (face === 'up') p.r(x + 1, y - 16, 8, 6, a.hair)
  else {
    p.r(x + 1, y - 16, 8, 2, a.hair); p.r(x + 1, y - 14, 1, 2, a.hair); p.r(x + 8, y - 14, 1, 2, a.hair)
    p.r(x + 3, y - 12, 1, 2, '#1b1424'); p.r(x + 6, y - 12, 1, 2, '#1b1424')
    p.r(x + 2, y - 10, 1, 1, 'rgba(255,120,120,0.45)'); p.r(x + 7, y - 10, 1, 1, 'rgba(255,120,120,0.45)')
  }
  if (a.isMain) { p.r(x + 1, y - 17, 8, 1, '#2b2b36'); p.r(x, y - 14, 1, 3, '#2b2b36'); p.r(x + 9, y - 14, 1, 3, '#2b2b36') }
  else if (a.role === 'Architect') { p.r(x, y - 17, 10, 2, '#f6c945'); p.r(x + 2, y - 18, 6, 1, '#f6c945') }
  else if (a.role === 'Coder') { p.r(x + 1, y - 18, 8, 3, '#3a3f58'); p.r(x + 1, y - 16, 8, 1, col) }
  else if (a.role === 'Researcher' && face === 'down') { p.r(x + 2, y - 13, 7, 1, '#9be7ff'); p.r(x + 2, y - 12, 1, 1, '#9be7ff'); p.r(x + 7, y - 12, 1, 1, '#9be7ff') }
  else if (a.role === 'Tester') { p.r(x + 1, y - 14, 8, 1, '#2b8a3e'); if (face === 'down') { p.r(x + 2, y - 13, 3, 2, 'rgba(126,231,135,0.75)'); p.r(x + 5, y - 13, 3, 2, 'rgba(126,231,135,0.75)') } }
  else if (a.role === 'Reviewer') { p.r(x + 1, y - 18, 7, 2, '#e05561'); p.r(x + 7, y - 17, 2, 1, '#e05561') }
  else if (a.role === 'Debugger') { p.r(x + 3, y - 19, 1, 3, '#333333'); p.r(x + 6, y - 19, 1, 3, '#333333'); p.r(x + 2, y - 20, 2, 1, '#ff5c8a'); p.r(x + 6, y - 20, 2, 1, '#ff5c8a') }
  return p.out()
}

/* ------------------------------------------------------------------ */
/* Bulles                                                              */
/* ------------------------------------------------------------------ */
function wrap(text: string, max: number, lines: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const out: string[] = []
  let cur = ''
  for (const w0 of words) {
    const w = w0.length > max ? w0.slice(0, max - 1) + '…' : w0
    if ((cur + ' ' + w).trim().length > max) { out.push(cur); cur = w } else cur = (cur + ' ' + w).trim()
    if (out.length === lines) break
  }
  if (out.length < lines && cur) out.push(cur)
  if (out.length === lines && words.join(' ').length > out.join(' ').length + 1) out[lines - 1] = out[lines - 1].slice(0, max - 1) + '…'
  return out
}

type Bubble = { x: number; y: number; text: string; color: string; err?: boolean; begin: number; hold: number; startsHidden?: boolean }
const FS = 5.2, CW = FS * 0.6, LH = 6.2

function bubbleSvg(b: Bubble, placed: Array<{ x: number; y: number; w: number; h: number }>) {
  const lines = wrap(b.text, 34, 2)
  const w = Math.ceil(Math.max(...lines.map(l => l.length)) * CW + 7)
  const h = Math.ceil(lines.length * LH + 5)
  let bx = Math.min(W - w - 2, Math.max(2, b.x - w / 2))
  let by = b.y - h - 4
  for (let guard = 0; guard < 8; guard++) {
    const hit = placed.find(o => bx < o.x + o.w + 1 && bx + w + 1 > o.x && by < o.y + o.h + 1 && by + h + 1 > o.y)
    if (!hit) break
    by = hit.y - h - 2
  }
  if (by < 1) by = 1
  placed.push({ x: bx, y: by, w, h })
  const border = b.err ? '#ff4d5e' : '#1a1326', fill = b.err ? '#ffe3e6' : '#fbf8ff', ink = b.err ? '#7a0f1c' : '#231a33'
  const tail = by + h < b.y - 2 ? `<path fill="${border}" d="M${f2(Math.min(bx + w - 4, Math.max(bx + 3, b.x - 1.5)))} ${f2(by + h)}h3l-1.5 2.5z"/>` : ''
  const total = b.hold + 0.4
  const fade = `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;${f2(0.25 / total)};${f2((total - 0.35) / total)};1" dur="${f2(total)}s" begin="${f2(b.begin)}s" fill="freeze"/>`
  const text = lines.map((l, i) => `<text x="${f2(bx + 3.5)}" y="${f2(by + 3 + FS + i * LH - 1)}">${esc(l)}</text>`).join('')
  return `<g opacity="0">${fade}${tail}<rect x="${f2(bx)}" y="${f2(by)}" width="${w}" height="${h}" rx="1.5" fill="${fill}" stroke="${border}" stroke-width="0.8"/><rect x="${f2(bx + 2)}" y="${f2(by + 0.9)}" width="${w - 4}" height="0.9" fill="${b.color}"/><g fill="${ink}" font-size="${FS}">${text}</g></g>`
}

/* ------------------------------------------------------------------ */
/* Scène complète                                                      */
/* ------------------------------------------------------------------ */
export const RETIRE = { pump: 0.7, fire: 1.3, ghost: 2.3, end: 4.6 }
const GUN = { x: 165, y: 88 }

export function renderScene(state: RoomState, worldId: string, now: number) {
  const w = WORLDS[worldId] ?? studio
  const main = state.main
  const mainLook: Look = { color: '#d97757', hair: '#3d2a22', skin: '#f2c8a0', role: 'Orchestrateur', isMain: true }
  const placed: Array<{ x: number; y: number; w: number; h: number }> = []
  const bubbles: Bubble[] = []
  let back = '', front = '', fx = '', labels = ''

  const sec = (t?: number) => (t ? (now - t) / 1000 : 999)

  // Claude, derrière son bureau
  back += `<g transform="translate(${MAIN_SEAT.x} ${MAIN_SEAT.y})">${sprite(mainLook, 'down', true)}</g>`
  if (main.activeAt && sec(main.activeAt) < 3) {
    fx += `<rect x="138" y="72" width="44" height="14" fill="#78e6ff" opacity="0.18"><animate attributeName="opacity" values="0.25;0.08" dur="${f2(3)}s" begin="${f2(-sec(main.activeAt))}s" fill="freeze"/></rect>`
  }
  labels += tag(160, 112, `Claude · ${w.claude}`, '#d97757')
  if (main.bubble && sec(main.bubbleAt) < 5) bubbles.push({ x: 160, y: 70, text: main.bubble, color: '#d97757', begin: -sec(main.bubbleAt), hold: 4.6 })

  const sorted = [...state.agents].sort((a, b) => a.y - b.y)
  for (const a of sorted) {
    const look: Look = { color: a.color, hair: a.hair, skin: a.skin, role: a.role }
    const since = sec(a.movedAt)
    const r = route(a.fromX, a.fromY, a.x, a.y)
    const walking = since < r.dur
    let g = ''

    if (a.status === 'dead' && a.deadAt) {
      g += retireSvg(a, look, sec(a.deadAt), bubbles)
      const into = sec(a.deadAt)
      if (into < RETIRE.ghost) labels += tag(a.x, a.y + (a.sit ? 6 : 4), `${a.name} · ${a.role}`, a.color, into < RETIRE.fire ? undefined : -(into - RETIRE.fire))
    } else {
      // apparition
      const born = sec(a.spawnedAt)
      if (born < 1.6) {
        fx += `<g opacity="0"><animate attributeName="opacity" values="0;0.9;0" dur="1.5s" begin="${f2(-born)}s" fill="freeze"/><rect x="${SPAWN.x - 4}" y="0" width="8" height="${SPAWN.y}" fill="${a.color}" opacity="0.35"/><rect x="${SPAWN.x - 1}" y="0" width="2" height="${SPAWN.y}" fill="#ffffff"/></g>`
      }
      if (walking) {
        const path = 'M' + r.pts.map(p => `${p[0]} ${p[1]}`).join('L')
        const dy = r.pts.length > 1 ? r.pts[r.pts.length - 1][1] - r.pts[0][1] : 0
        g += `<g><animateMotion path="${path}" dur="${f2(r.dur)}s" begin="${f2(-since)}s" fill="freeze"/>`
        g += `<g visibility="visible"><set attributeName="visibility" to="hidden" begin="${f2(r.dur - since)}s" fill="freeze"/>`
        g += `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -1.2;0 0" dur="0.26s" repeatCount="indefinite"/>${sprite(look, dy > 0 ? 'down' : 'up', false)}</g></g>`
        g += `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${f2(r.dur - since)}s" fill="freeze"/>${sprite(look, a.face, a.sit)}</g></g>`
      } else {
        const work = a.status === 'work' && a.station !== 'handoff'
        const bob = a.status === 'lounge' ? '' : ''
        g += `<g transform="translate(${a.x} ${a.y})">${bob}${sprite(look, a.face, a.sit)}`
        if (a.status === 'lounge') g += `<path fill="#f2efe8" d="M4 -7h2v2h-2z"/><path fill="#ffffff" opacity="0.6" d="M5 -10h1v1h-1z"><animateTransform attributeName="transform" type="translate" values="0 0;0 -4" dur="1.2s" repeatCount="indefinite"/></path>`
        if (a.errAt && sec(a.errAt) < 4) g += `<path fill="#ff4d5e" d="M-1 -27h2v5h-2zM-1 -21h2v2h-2z"><animate attributeName="opacity" values="1;0;1" dur="0.4s" repeatCount="indefinite"/></path>`
        g += '</g>'
        if (work) fx += activityFx(a, w, now)
      }
      labels += tag(a.x, a.y + (a.sit && !walking ? 6 : 4), `${a.name} · ${a.role}`, a.color, undefined, walking ? -(since) : undefined, walking ? r.dur : undefined)
      if (a.bubble && a.bubbleAt && sec(a.bubbleAt) < 5) {
        const at = walking ? { x: a.x, y: a.y } : { x: a.x, y: a.y }
        bubbles.push({ x: at.x, y: at.y - (a.sit ? 16 : 19), text: a.bubble, color: a.color, err: a.bubbleErr, begin: -sec(a.bubbleAt), hold: 4.6 })
      }
    }
    if (a.y < 100) back += g
    else front += g
  }

  // fusil à pompe
  const executing = state.agents.find(a => a.status === 'dead' && a.deadAt && sec(a.deadAt) < RETIRE.ghost)
  const gun = executing ? gunSvg(executing, sec(executing.deadAt)) : ''

  let bub = ''
  bubbles.sort((a, b) => b.y - a.y)
  for (const b of bubbles) bub += bubbleSvg(b, placed)

  const shake = state.agents.find(a => a.status === 'dead' && a.deadAt && sec(a.deadAt) < RETIRE.fire + 0.4)
  const shakeAnim = shake ? `<animateTransform attributeName="transform" type="translate" values="0 0;2 -1;-2 1;1 0;0 0" dur="0.3s" begin="${f2(RETIRE.fire - sec(shake.deadAt))}s"/>` : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}" shape-rendering="crispEdges" font-family="ui-monospace,Menlo,monospace" style="background:#0c0a12">` +
    `<g>${shakeAnim}${background(w)}${back}${deskLayer(w)}${front}${fx}` +
    `<rect width="${W}" height="${H}" fill="${w.light}" pointer-events="none"/>` +
    `<g shape-rendering="geometricPrecision">${labels}${bub}</g>${gun}</g></svg>`
}

function tag(x: number, y: number, text: string, color: string, hideAt?: number, walkBegin?: number, walkDur?: number) {
  const fs = 4.2
  const w = Math.ceil(text.length * fs * 0.6 + 4)
  const bx = Math.min(W - w - 1, Math.max(1, x - w / 2))
  let anim = ''
  if (hideAt !== undefined) anim += `<animate attributeName="opacity" to="0" dur="0.3s" begin="${f2(hideAt)}s" fill="freeze"/>`
  if (walkBegin !== undefined && walkDur !== undefined) anim += `<set attributeName="opacity" to="0" begin="${f2(walkBegin)}s" dur="${f2(walkDur)}s"/>`
  return `<g>${anim}<rect x="${f2(bx)}" y="${f2(y)}" width="${w}" height="${fs + 2}" fill="rgba(12,8,20,0.78)"/><rect x="${f2(bx)}" y="${f2(y)}" width="1" height="${fs + 2}" fill="${color}"/><text x="${f2(bx + w / 2 + 0.5)}" y="${f2(y + fs + 0.6)}" font-size="${fs}" fill="#f3eefc" text-anchor="middle">${esc(text)}</text></g>`
}

function activityFx(a: RoomAgent, w: World, now: number) {
  if (a.station === 'code' && a.slot >= 0) {
    const d = CODE_DESKS[a.slot]
    let s = `<rect x="${d.x + 12}" y="${d.y - 8}" width="12" height="8" fill="#0d1b2a"/>`
    for (let r = 0; r < 4; r++) s += `<rect x="${d.x + 13}" y="${d.y - 7 + r * 2}" width="${4 + ((r * 5 + a.slot) % 7)}" height="1" fill="${['#5ef1ff', '#ff6ac1', '#7ee787', '#f1fa8c'][r]}"><animate attributeName="width" values="2;${6 + r};9;3" dur="${1 + r * 0.3}s" repeatCount="indefinite"/></rect>`
    s += `<rect x="${d.x + 7}" y="${d.y - 12}" width="22" height="16" fill="${a.color}" opacity="0.16"/>`
    w.glyphs.slice(0, 3).forEach((gl, i) => {
      s += `<text x="${d.x + 12 + i * 7}" y="${d.y - 10}" font-size="5" fill="${a.color}" opacity="0">${esc(gl)}<animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="${i * 0.5}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -10" dur="1.6s" begin="${i * 0.5}s" repeatCount="indefinite"/></text>`
    })
    return `<g shape-rendering="geometricPrecision">${s}</g>`
  }
  if (a.station === 'bench' && a.slot >= 0) {
    const lx = [18, 42, 66][a.slot]
    const col = a.errAt && (now - a.errAt) < 6000 ? '#ff4d5e' : '#ffb347'
    return `<rect x="${lx - 1}" y="133" width="3" height="4" fill="${col}"><animate attributeName="opacity" values="1;0.2;1" dur="0.5s" repeatCount="indefinite"/></rect><rect x="${lx - 5}" y="130" width="11" height="10" fill="${col}" opacity="0.2"/>`
  }
  if (a.station === 'whiteboard') {
    return `<rect x="${a.x - 8}" y="${10 + (a.slot % 3) * 5}" width="0" height="1" fill="${a.color}"><animate attributeName="width" values="0;16;16" dur="2.4s" repeatCount="indefinite"/></rect>`
  }
  if (a.station === 'library' && a.slot >= 0 && a.slot < 2) {
    return `<rect x="${a.x - 2}" y="18" width="3" height="5" fill="#f5ecd7"><animateTransform attributeName="transform" type="translate" values="0 0;0 9;0 18;0 0" dur="3s" repeatCount="indefinite"/></rect>`
  }
  return ''
}

function gunSvg(a: RoomAgent, into: number) {
  const ang = Math.atan2(a.y - 8 - GUN.y, a.x - GUN.x) * 180 / Math.PI
  const b = (t: number) => f2(t - into)
  const tip = { x: GUN.x + Math.cos(ang * Math.PI / 180) * 14, y: GUN.y + Math.sin(ang * Math.PI / 180) * 14 }
  let s = `<g transform="translate(${GUN.x} ${GUN.y}) rotate(${f2(ang)})"><g>`
  s += `<animateTransform attributeName="transform" type="translate" values="0 0;-2 0;0 0" dur="0.16s" begin="${b(RETIRE.fire)}s"/>`
  s += `<path fill="#6b4226" d="M-5 0h5v2h-5z"/><path fill="#5b6070" d="M0 0h14v1h-14z"/><path fill="#3c404c" d="M0 1h13v1h-13z"/>`
  s += `<path fill="#4a3020" d="M4 1h4v2h-4z"><animateTransform attributeName="transform" type="translate" values="0 0;-2.5 0;0 0" dur="0.36s" begin="${b(RETIRE.pump)}s"/></path></g></g>`
  // éclair et plombs
  s += `<g opacity="0"><set attributeName="opacity" to="1" begin="${b(RETIRE.fire)}s" dur="0.14s"/><path fill="#ffd23f" d="M${f2(tip.x - 3)} ${f2(tip.y)}h7v1h-7zM${f2(tip.x)} ${f2(tip.y - 3)}h1v7h-1z"/><path fill="#ffffff" d="M${f2(tip.x - 1)} ${f2(tip.y - 1)}h3v3h-3z"/></g>`
  s += `<line x1="${f2(tip.x)}" y1="${f2(tip.y)}" x2="${a.x}" y2="${a.y - 8}" stroke="#ffe08a" stroke-width="1" stroke-dasharray="2 2" opacity="0"><set attributeName="opacity" to="1" begin="${b(RETIRE.fire)}s" dur="0.22s"/></line>`
  // onomatopées
  s += comic('CLIC-CLAC', 160, 66, 7, '#f1fa8c', '#2a1a10', b(RETIRE.pump), 0.6)
  s += comic('BANG !', (GUN.x + a.x) / 2, Math.min(GUN.y, a.y) - 20, 14, '#ffd23f', '#c0392b', b(RETIRE.fire), 0.95)
  return `<g shape-rendering="geometricPrecision">${s}</g>`
}

function comic(text: string, x: number, y: number, size: number, fill: string, stroke: string, begin: string, dur: number) {
  const cx = Math.min(W - text.length * size * 0.33, Math.max(text.length * size * 0.33, x))
  return `<text x="${f2(cx)}" y="${f2(Math.max(size, y))}" font-size="${size}" font-weight="bold" text-anchor="middle" fill="${fill}" stroke="${stroke}" stroke-width="${f2(size / 6)}" paint-order="stroke" opacity="0"><set attributeName="opacity" to="1" begin="${begin}s" dur="${dur}s"/></text>`.replace('</text>', `${esc(text)}</text>`)
}

function retireSvg(a: RoomAgent, look: Look, into: number, bubbles: Bubble[]) {
  const b = (t: number) => f2(t - into)
  const side = a.x >= GUN.x ? 1 : -1
  let s = `<g transform="translate(${a.x} ${a.y})"><g>`
  s += `<animateTransform attributeName="transform" type="translate" from="0 0" to="${side * 8} 3" dur="0.35s" begin="${b(RETIRE.fire)}s" fill="freeze"/>`
  s += `<g><animateTransform attributeName="transform" type="rotate" from="0 0 -4" to="${side * 90} 0 -4" dur="0.35s" begin="${b(RETIRE.fire)}s" fill="freeze"/>`
  s += `<animate attributeName="opacity" from="1" to="0" dur="1.6s" begin="${b(RETIRE.ghost)}s" fill="freeze"/>`
  s += sprite(look, a.face, false)
  s += `<rect x="-5" y="-16" width="11" height="17" fill="#ffffff" opacity="0"><set attributeName="opacity" to="0.85" begin="${b(RETIRE.fire)}s" dur="0.12s"/></rect>`
  s += '</g></g>'
  // étoiles K.O.
  s += `<g opacity="0"><set attributeName="opacity" to="1" begin="${b(RETIRE.fire + 0.4)}s" dur="1.5s"/><g transform="translate(${side * 8} -6)">`
  for (let i = 0; i < 3; i++) s += `<path fill="#ffd23f" d="M${f2(Math.cos(i * 2.1) * 6)} ${f2(Math.sin(i * 2.1) * 2)}h1.2v1.2h-1.2z"><animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="1s" repeatCount="indefinite"/></path>`
  s += `</g><text x="${side * 8}" y="-14" font-size="6" font-weight="bold" text-anchor="middle" fill="#ffffff" stroke="#2a1a10" stroke-width="1" paint-order="stroke" shape-rendering="geometricPrecision">K.O.</text></g>`
  // fantôme
  s += `<g opacity="0"><animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.1;0.7;1" dur="2.3s" begin="${b(RETIRE.ghost)}s" fill="freeze"/><g><animateTransform attributeName="transform" type="translate" from="${side * 8} -2" to="${side * 8} -30" dur="2.3s" begin="${b(RETIRE.ghost)}s" fill="freeze"/>`
  s += `<path fill="#f4f4ff" d="M-3 -11h7v1h-7zM-4 -10h9v9h-9zM-4 -1h1v1h-1zM-2 -1h1v1h-1zM0 -1h1v1h-1zM2 -1h1v1h-1zM4 -1h1v1h-1z"/>`
  s += `<path fill="#2a2238" d="M-2 -7h1v2h-1zM2 -7h1v2h-1zM0 -4h1v1h-1z"/><path fill="${a.color}" d="M-3 -5h1v1h-1zM3 -5h1v1h-1z"/><path fill="#ffd23f" d="M-3 -14h7v1h-7z"/></g></g>`
  s += '</g>'
  bubbles.push({ x: a.x + side * 8, y: a.y - 26, text: ghostLine(a.key), color: a.color, begin: RETIRE.ghost - into, hold: 2 })
  return s
}

const GHOSTS = ['Adieu monde cruel…', "J'avais encore des tokens…", 'Au moins mes tests passent.', 'Je reviendrai… en sous-agent.', 'Pensez à commit mon travail !']
function ghostLine(key: string) {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return GHOSTS[h % GHOSTS.length]
}
export const EXEC_LINES = ['Merci pour tes services, {name}.', '{name}, ton contexte est clos.', 'Fin de mission, {name}. Adieu.', "On n'a plus besoin de toi, {name} !"]
