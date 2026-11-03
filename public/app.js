/*
 * Claude Agent Room — moteur de rendu pixel art + client temps réel.
 *
 * Rendu en deux couches :
 *   1. un tampon 320×208 "pixels du monde" (sol, mobilier, personnages, lumière)
 *      agrandi d'un facteur entier sans lissage → pixel art net ;
 *   2. une couche texte en pleine résolution (bulles, étiquettes, particules de code).
 */
(() => {
  'use strict';

  /* ================================================================
   * Constantes du monde
   * ================================================================ */
  const W = 320, H = 208;
  const CELL = 8, GW = W / CELL, GH = H / CELL;
  const MAIN_ID = 'claude-main';
  const WALK_SPEED = 42;            // pixels du monde / seconde
  const TYPE_SPEED = 48;            // caractères / seconde
  const BUBBLE_HOLD = 4000;         // ms de lecture après la frappe
  const SPAWN_POINT = { x: 112, y: 114 };
  const SPAWN_POINTS = [{ x: 112, y: 114 }, { x: 98, y: 114 }, { x: 112, y: 126 }, { x: 98, y: 126 }, { x: 84, y: 118 }];
  const CLAUDE_SEAT = { x: 160, y: 92 };

  const AGENT_COLORS = ['#5ef1ff', '#ff6ac1', '#7ee787', '#ffb86b', '#bd93f9', '#f1fa8c', '#ff7b72', '#79c0ff', '#56d4bc', '#e3a6ff', '#ffd479', '#a5d6a7'];
  const HAIR = ['#3b2a20', '#1d1b26', '#7a4b2a', '#c98b4e', '#e8d18a', '#6b3fa0', '#2f5d8a', '#a33b3b'];
  const SKIN = ['#f2c8a0', '#e0ac85', '#c68863', '#8d5a3c', '#f6d7b8'];
  const ROLE_COLORS = {
    Orchestrateur: '#d97757', Coder: '#5ef1ff', Researcher: '#7ee787', Architect: '#f6c945',
    Tester: '#ff9f43', Reviewer: '#ff7b72', Debugger: '#ff6ac1'
  };
  const ROLE_STATION = {
    Architect: 'whiteboard', Researcher: 'library', Reviewer: 'library',
    Coder: 'code', Tester: 'bench', Debugger: 'bench'
  };
  const TOOL_STATION = {
    Read: 'library', Grep: 'library', Glob: 'library', LS: 'library', WebSearch: 'library', WebFetch: 'library',
    Write: 'code', Edit: 'code', MultiEdit: 'code', NotebookEdit: 'code',
    Bash: 'bench', BashOutput: 'bench', KillShell: 'bench', Test: 'bench',
    Task: 'whiteboard', Agent: 'whiteboard', TodoWrite: 'whiteboard', TaskCreate: 'whiteboard', TaskUpdate: 'whiteboard',
    ExitPlanMode: 'whiteboard', Plan: 'whiteboard', Think: 'whiteboard'
  };
  const STATUS_LABEL = {
    spawning: 'Arrive…', walking: 'En marche', coding: 'Écrit du code', reading: 'Lit un fichier',
    planning: 'Planifie au tableau', bash: 'Lance des commandes', coffee: 'En pause', idle: 'En pause',
    handoff: 'Remet son rapport', done: 'Terminé', orchestrating: 'Orchestre', error: 'Erreur'
  };
  const SMALL_TALK = [
    'Ce café est parfait.', 'Tu as vu le diff ? Propre.', 'Je recharge les batteries.',
    'Les tests sont verts, je savoure.', 'Pause bien méritée !', "Quelqu'un a nommé une variable data2…",
    'Le chef va nous rappeler, je le sens.', "J'ai lu 40 fichiers aujourd'hui.", 'Le chat a encore piqué le coussin.'
  ];
  const REPLIES = ['Carrément.', 'Haha, classique.', 'Pareil !', 'Bien joué.', 'Chut, le chat dort.', 'On en reparle au prochain sprint.'];
  const CODE_GLYPHS = ['{ }', '=>', '</>', ';', '( )', 'fn', '++', '[ ]', '&&', '#', '==='];

  /* ================================================================
   * Utilitaires
   * ================================================================ */
  const $ = sel => document.querySelector(sel);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15);
    return n >>> 0;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function shortText(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function extractFiles(text) {
    const out = [];
    const re = /(?:^|[\s"'`(])((?:\.{0,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+\.(?:tsx?|jsx?|mjs|cjs|json|md|py|rb|go|rs|java|kt|css|scss|html|vue|svelte|ya?ml|toml|sql|sh|c|cpp|h|hpp|cs|php|swift|txt|env|lock))/g;
    let m;
    while ((m = re.exec(String(text || '')))) out.push(m[1]);
    return out;
  }

  /* ================================================================
   * Canvas & mise à l'échelle entière
   * ================================================================ */
  const canvas = $('#room');
  const ctx = canvas.getContext('2d');
  const buf = document.createElement('canvas');
  buf.width = W; buf.height = H;
  const g = buf.getContext('2d');
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  const bgx = bg.getContext('2d');
  let S = 3;          // pixels écran (device) par pixel du monde
  let DPR = 1;

  function resize() {
    const stage = $('#stage');
    DPR = window.devicePixelRatio || 1;
    const availW = (stage.clientWidth - 28) * DPR;
    const availH = (stage.clientHeight - 28) * DPR;
    S = Math.max(1, Math.floor(Math.min(availW / W, availH / H)));
    canvas.width = W * S;
    canvas.height = H * S;
    canvas.style.width = `${(W * S) / DPR}px`;
    canvas.style.height = `${(H * S) / DPR}px`;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);

  // Pixel du monde (sur le tampon g ou le fond bgx)
  function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }

  /* ================================================================
   * Pathfinding A* sur grille 8 px
   * ================================================================ */
  const blocked = new Uint8Array(GW * GH);
  const OBSTACLES = [
    { x: 0, y: 0, w: 320, h: 40 },          // mur
    { x: 220, y: 36, w: 100, h: 10 },       // bibliothèque + serveurs
    { x: 108, y: 38, w: 14, h: 10 },        // grande plante
    { x: 126, y: 82, w: 68, h: 26 },        // bureau de Claude
    { x: 112, y: 124, w: 36, h: 14 },       // bureaux dev
    { x: 174, y: 124, w: 36, h: 14 },
    { x: 112, y: 158, w: 36, h: 14 },
    { x: 174, y: 158, w: 36, h: 14 },
    { x: 2, y: 146, w: 80, h: 26 },         // banc de test
    { x: 2, y: 174, w: 12, h: 26 },         // tour serveur
    { x: 236, y: 128, w: 64, h: 12 },       // dossier du canapé
    { x: 252, y: 164, w: 32, h: 10 },       // table basse
    { x: 286, y: 172, w: 34, h: 36 },       // machine à café
    { x: 226, y: 140, w: 10, h: 10 },       // lampadaire
    { x: 0, y: 40, w: 4, h: 168 }, { x: 316, y: 40, w: 4, h: 168 }
  ];
  for (const o of OBSTACLES) {
    for (let cy = Math.floor(o.y / CELL); cy <= Math.floor((o.y + o.h - 1) / CELL); cy++) {
      for (let cx = Math.floor(o.x / CELL); cx <= Math.floor((o.x + o.w - 1) / CELL); cx++) {
        if (cx >= 0 && cy >= 0 && cx < GW && cy < GH) blocked[cy * GW + cx] = 1;
      }
    }
  }
  const isBlockedCell = (cx, cy) => cx < 0 || cy < 0 || cx >= GW || cy >= GH || blocked[cy * GW + cx] === 1;
  const isBlockedPt = (x, y) => isBlockedCell(Math.floor(x / CELL), Math.floor(y / CELL));

  function nearestFree(cx, cy) {
    if (!isBlockedCell(cx, cy)) return [cx, cy];
    for (let r = 1; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (!isBlockedCell(cx + dx, cy + dy)) return [cx + dx, cy + dy];
      }
    }
    return [cx, cy];
  }

  function lineFree(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(d / 2);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      if (isBlockedPt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  function findPath(sx, sy, tx, ty) {
    const [scx, scy] = nearestFree(Math.floor(sx / CELL), Math.floor(sy / CELL));
    const [tcx, tcy] = nearestFree(Math.floor(tx / CELL), Math.floor(ty / CELL));
    const start = scy * GW + scx, goal = tcy * GW + tcx;
    const gScore = new Float32Array(GW * GH).fill(Infinity);
    const came = new Int32Array(GW * GH).fill(-1);
    const closed = new Uint8Array(GW * GH);
    const open = [start];
    gScore[start] = 0;
    const fOf = i => gScore[i] + octile(i % GW, (i / GW) | 0, tcx, tcy);
    while (open.length) {
      let bi = 0, bf = Infinity;
      for (let k = 0; k < open.length; k++) { const f = fOf(open[k]); if (f < bf) { bf = f; bi = k; } }
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      closed[cur] = 1;
      const cx = cur % GW, cy = (cur / GW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (isBlockedCell(nx, ny)) continue;
        if (dx && dy && (isBlockedCell(cx + dx, cy) || isBlockedCell(cx, cy + dy))) continue;
        const ni = ny * GW + nx;
        if (closed[ni]) continue;
        const ng = gScore[cur] + (dx && dy ? 1.4142 : 1);
        if (ng < gScore[ni]) {
          gScore[ni] = ng; came[ni] = cur;
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
    const cells = [];
    let c = goal;
    if (came[c] === -1 && c !== start) return [{ x: tx, y: ty }];
    while (c !== -1 && c !== start) { cells.push(c); c = came[c]; }
    cells.reverse();
    const pts = cells.map(i => ({ x: (i % GW) * CELL + CELL / 2, y: ((i / GW) | 0) * CELL + CELL / 2 }));
    pts.push({ x: tx, y: ty });
    // Lissage : on saute les points intermédiaires visibles en ligne droite.
    const smooth = [];
    let ax = sx, ay = sy, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !lineFree(ax, ay, pts[j].x, pts[j].y)) j--;
      smooth.push(pts[j]);
      ax = pts[j].x; ay = pts[j].y; i = j + 1;
    }
    return smooth;
  }
  function octile(ax, ay, bx, by) {
    const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
    return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
  }

  /* ================================================================
   * Postes de travail
   * ================================================================ */
  const CODE_DESKS = [
    { x: 112, y: 126 }, { x: 174, y: 126 }, { x: 112, y: 160 }, { x: 174, y: 160 }
  ];
  const STATIONS = {
    whiteboard: { activity: 'planning', spots: [
      { x: 28, y: 50, face: 'up' }, { x: 50, y: 50, face: 'up' }, { x: 72, y: 50, face: 'up' }] },
    library: { activity: 'reading', spots: [
      { x: 234, y: 55, face: 'up' }, { x: 256, y: 55, face: 'up' }, { x: 290, y: 56, face: 'up' }] },
    code: { activity: 'coding', spots: CODE_DESKS.map(d => ({ x: d.x + 18, y: d.y + 21, face: 'up', pose: 'sit' })) },
    bench: { activity: 'bash', spots: [
      { x: 22, y: 184, face: 'up' }, { x: 43, y: 184, face: 'up' }, { x: 64, y: 184, face: 'up' }] },
    lounge: { activity: 'coffee', spots: [
      { x: 252, y: 151, face: 'down', pose: 'sit' }, { x: 268, y: 151, face: 'down', pose: 'sit' }, { x: 284, y: 151, face: 'down', pose: 'sit' },
      { x: 246, y: 188, face: 'right' }, { x: 264, y: 194, face: 'up' }, { x: 278, y: 186, face: 'right' }] },
    handoff: { activity: 'handoff', spots: [
      { x: 160, y: 117, face: 'up' }, { x: 146, y: 117, face: 'up' }, { x: 174, y: 117, face: 'up' }] }
  };
  for (const st of Object.values(STATIONS)) st.occ = st.spots.map(() => null);

  function claimSpot(agent, stationName) {
    const st = STATIONS[stationName];
    if (agent.station === stationName && agent.slot >= 0 && st.occ[agent.slot] === agent.id) return agent.slot;
    releaseSpot(agent);
    let idx = st.occ.indexOf(null);
    let overflow = false;
    if (idx < 0) { idx = Math.floor(Math.random() * st.spots.length); overflow = true; }
    if (!overflow) st.occ[idx] = agent.id;
    agent.station = stationName;
    agent.slot = overflow ? -1 : idx;
    const sp = st.spots[idx];
    agent.spot = overflow
      ? { ...sp, x: sp.x + rnd(-10, 10), y: sp.y + rnd(4, 9), pose: undefined }
      : sp;
    return idx;
  }
  function releaseSpot(agent) {
    if (agent.station && agent.slot >= 0) {
      const st = STATIONS[agent.station];
      if (st.occ[agent.slot] === agent.id) st.occ[agent.slot] = null;
    }
    agent.station = null; agent.slot = -1;
  }
  const loungeFull = () => STATIONS.lounge.occ.every(Boolean);

  /* ================================================================
   * État global
   * ================================================================ */
  const agents = new Map();
  const particles = [];
  const glyphs = [];
  const beams = [];
  const folders = [];
  const whiteboard = [];
  const benchLamps = [0, 1, 2].map(() => ({ state: 'idle', until: 0 }));
  const counters = { tools: 0, events: 0 };
  let colorIndex = 0;
  let selectedId = null;
  let replaying = false;
  let deskPile = 0;
  let lastSmallTalk = 0;
  let treeDirty = true;
  let hoverId = null;

  function makeAgent(id, opts = {}) {
    const isMain = id === MAIN_ID;
    const i = colorIndex++;
    const sp = isMain ? CLAUDE_SEAT : freeSpawnPoint();
    const a = {
      id,
      name: opts.name || (isMain ? 'Claude' : id),
      role: isMain ? 'Orchestrateur' : (opts.role || 'Coder'),
      parentId: isMain ? null : (opts.parentId || MAIN_ID),
      color: isMain ? '#d97757' : AGENT_COLORS[(i - 1 + AGENT_COLORS.length) % AGENT_COLORS.length],
      hair: isMain ? '#3d2a22' : HAIR[hash(i + 7) % HAIR.length],
      skin: isMain ? '#f2c8a0' : SKIN[hash(i + 3) % SKIN.length],
      x: sp.x,
      y: sp.y,
      face: 'down', pose: isMain ? 'sit' : 'stand',
      path: [], queue: [], waitUntil: 0,
      station: null, slot: -1, spot: null,
      activity: isMain ? 'orchestrating' : 'spawning',
      walkT: 0, dustT: 0, alpha: isMain ? 1 : 0, bornAt: now(),
      bubbles: [], locked: false, done: false, gone: false,
      errorUntil: 0, carrying: false, lastToolAt: 0, tool: null,
      prompt: opts.prompt || '', task: opts.task || '',
      files: new Set(), history: [], spawnedAt: opts.timestamp || Date.now(),
      blinkSeed: Math.random() * 10
    };
    agents.set(id, a);
    treeDirty = true;
    return a;
  }
  function freeSpawnPoint() {
    for (const sp of SPAWN_POINTS) {
      const taken = [...agents.values()].some(a => a.id !== MAIN_ID && !a.gone && Math.hypot(a.x - sp.x, a.y - sp.y) < 7);
      if (!taken) return sp;
    }
    return { x: SPAWN_POINT.x + rnd(-8, 8), y: SPAWN_POINT.y + rnd(-4, 8) };
  }
  function getMain() { return agents.get(MAIN_ID) || makeAgent(MAIN_ID); }

  /* ================================================================
   * File d'actions des agents
   * ================================================================ */
  function goStation(agent, stationName) {
    return { k: 'go', station: stationName };
  }
  function setQueue(agent, steps) {
    agent.queue = steps;
    agent.path = [];
    agent.waitUntil = 0;
  }
  function pushQueue(agent, steps) { agent.queue.push(...steps); }

  function stationForTool(tool, agent) {
    if (tool && TOOL_STATION[tool]) return TOOL_STATION[tool];
    if (tool && /^mcp__/.test(tool)) return 'library';
    return ROLE_STATION[agent.role] || 'code';
  }

  function runQueue(agent, t) {
    if (agent.path.length) return;           // en train de marcher
    if (agent.waitUntil && t < agent.waitUntil) return;
    agent.waitUntil = 0;
    while (agent.queue.length) {
      const step = agent.queue[0];
      if (step.k === 'go') {
        if (!step.started) {
          claimSpot(agent, step.station);
          step.started = true;
          agent.pose = 'stand';
          agent.activity = 'walking';
          agent.path = findPath(agent.x, agent.y, agent.spot.x, agent.spot.y);
          treeDirty = true;
          if (agent.path.length && Math.hypot(agent.spot.x - agent.x, agent.spot.y - agent.y) > 1) return;
          agent.path = [];
        }
        agent.queue.shift();
        arrive(agent, step.station);
        continue;
      }
      if (step.k === 'wait') {
        agent.queue.shift();
        agent.waitUntil = t + step.ms;
        return;
      }
      if (step.k === 'do') {
        agent.queue.shift();
        step.fn(agent);
        continue;
      }
      if (step.k === 'despawn') {
        agent.queue.shift();
        releaseSpot(agent);
        agent.gone = true;
        agent.fadeOutAt = t;
        burst(agent.x, agent.y - 8, agent.color, 14);
        treeDirty = true;
        return;
      }
      agent.queue.shift();
    }
  }

  function arrive(agent, stationName) {
    const st = STATIONS[stationName];
    const spot = agent.spot || {};
    agent.x = spot.x ?? agent.x; agent.y = spot.y ?? agent.y;
    agent.face = spot.face || agent.face;
    agent.pose = spot.pose || 'stand';
    agent.activity = st.activity;
    if (stationName === 'bench' && agent.slot >= 0 && agent.lastToolAt) {
      const l = benchLamps[agent.slot];
      if (l.state === 'idle') { l.state = 'run'; l.until = now() + 6000; }
    }
    treeDirty = true;
  }

  /* ================================================================
   * Bulles
   * ================================================================ */
  function say(agent, text, opts = {}) {
    if (replaying || !agent || !text) return;
    const b = { text: shortText(text, 180), style: opts.style || 'normal', minor: !!opts.minor, to: opts.to || null, shown: 0, start: 0, doneAt: 0 };
    // Les bulles "mineures" (appels d'outils) cèdent la place quand la file déborde.
    if (agent.bubbles.length >= 2) agent.bubbles = agent.bubbles.filter((x, i) => i === 0 || !x.minor);
    if (b.minor && agent.bubbles.length >= 2) return;
    agent.bubbles.push(b);
  }
  function updateBubbles(agent, t, dt) {
    const b = agent.bubbles[0];
    if (!b) return;
    if (!b.start) b.start = t;
    if (b.shown < b.text.length) {
      const speed = TYPE_SPEED * (agent.bubbles.length > 2 ? 2 : 1);
      b.shown = Math.min(b.text.length, b.shown + speed * dt);
      if (b.shown >= b.text.length) b.doneAt = t;
    } else {
      const hold = agent.bubbles.length > 1 ? BUBBLE_HOLD * 0.6 : BUBBLE_HOLD;
      if (t - b.doneAt > hold + 300) agent.bubbles.shift();
    }
  }

  /* ================================================================
   * Effets
   * ================================================================ */
  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: rnd(-25, 25), vy: rnd(-40, -5), life: 0, max: rnd(0.5, 1.1), color, size: Math.random() < 0.3 ? 2 : 1, grav: 60 });
    }
  }
  function dust(x, y) {
    particles.push({ x: x + rnd(-2, 2), y: y - 1, vx: rnd(-8, 8), vy: rnd(-6, -1), life: 0, max: rnd(0.3, 0.6), color: 'rgba(230,210,190,0.7)', size: 1, grav: 0 });
  }
  function spawnBeam(x, y, color) {
    if (replaying) return;
    beams.push({ x, y, color, t0: now(), dur: 1400 });
    burst(x, y - 6, color, 18);
  }

  /* ================================================================
   * Traitement des événements
   * ================================================================ */
  function ensureAgent(e) {
    let a = agents.get(e.agentId);
    if (a && a.gone) { agents.delete(e.agentId); a = null; }
    if (!a) {
      a = makeAgent(e.agentId, { name: e.name || e.agentId, role: normRole(e.role), parentId: e.parentId, timestamp: e.timestamp });
      if (a.id !== MAIN_ID) {
        a.alpha = 0;
        spawnBeam(a.x, a.y, a.color);
        setQueue(a, [{ k: 'wait', ms: 900 }, { k: 'do', fn: x => { x.locked = false; } }]);
        a.locked = true;
      }
    }
    return a;
  }
  function normRole(r) {
    if (!r) return 'Coder';
    const s = String(r).split('|')[0].trim();
    const known = Object.keys(ROLE_COLORS).find(k => k.toLowerCase() === s.toLowerCase());
    return known || s.charAt(0).toUpperCase() + s.slice(1);
  }
  function record(agent, e, text) {
    agent.history.push({ t: e.timestamp || Date.now(), type: e.type, tool: e.tool || '', text: text || e.message || '' });
    if (agent.history.length > 200) agent.history.shift();
    const files = new Set([e.file, ...extractFiles(e.message)].filter(Boolean));
    files.forEach(f => agent.files.add(f));
    if (selectedId === agent.id) renderInspector();
  }

  function handleEvent(raw) {
    const e = { ...raw };
    e.type = String(e.type || '').toUpperCase();
    e.agentId = e.agentId || MAIN_ID;
    e.timestamp = e.timestamp || Date.now();
    counters.events++;
    const main = getMain();

    switch (e.type) {
      case 'RESET': return resetRoom(true);

      case 'SUBAGENT_SPAWN': {
        let a = agents.get(e.agentId);
        if (a && a.gone) { agents.delete(e.agentId); a = null; }
        const isNew = !a;
        if (!a) a = makeAgent(e.agentId, { name: e.name, role: normRole(e.role), parentId: e.parentId, prompt: e.prompt || e.message, task: e.message, timestamp: e.timestamp });
        else { a.name = e.name || a.name; a.role = normRole(e.role || a.role); a.prompt = e.prompt || e.message || a.prompt; a.done = false; }
        const task = shortText(e.message || e.prompt || 'une nouvelle tâche', 90);
        say(main, `Je crée ${a.name} pour : ${task}`);
        main.lastToolAt = now();
        if (isNew) spawnBeam(a.x, a.y, a.color);
        a.locked = true;
        setQueue(a, [
          { k: 'wait', ms: 1300 },
          { k: 'do', fn: x => { x.face = 'up'; say(x, 'Bien reçu chef, je m\'en occupe !'); } },
          { k: 'wait', ms: 1500 },
          { k: 'do', fn: x => { x.locked = false; } },
          goStation(a, ROLE_STATION[a.role] || 'code')
        ]);
        record(a, e, `Créé pour : ${task}`);
        record(main, e, `Crée ${a.name} (${a.role})`);
        log(main, 'SPAWN', `crée ${a.name} · ${a.role} → ${task}`, e);
        break;
      }

      case 'TOOL_START': {
        counters.tools++;
        const a = ensureAgent(e);
        a.tool = e.tool || null;
        a.lastToolAt = now();
        const text = e.message || `Outil ${e.tool || ''}`;
        record(a, e, text);
        log(a, 'TOOL', text, e);
        if (a.id === MAIN_ID) {
          say(a, `[${e.tool || 'outil'}] ${text}`, { minor: true });
          break;
        }
        if (a.done) { a.done = false; treeDirty = true; }
        const station = stationForTool(e.tool, a);
        if (station === 'bench') {
          const st = STATIONS.bench;
          const idx = a.station === 'bench' ? a.slot : st.occ.indexOf(null);
          if (idx >= 0) { benchLamps[idx].state = 'run'; benchLamps[idx].until = now() + 15000; }
        }
        const steps = [goStation(a, station)];
        if (a.locked) pushQueue(a, steps); else setQueue(a, steps);
        say(a, `[${e.tool || 'outil'}] ${text}`, { minor: true });
        break;
      }

      case 'TOOL_END': {
        const a = ensureAgent(e);
        const ok = e.success !== false;
        if (a.station === 'bench' && a.slot >= 0) {
          benchLamps[a.slot].state = ok ? 'ok' : 'fail';
          benchLamps[a.slot].until = now() + 9000;
        }
        if (!ok || e.message) {
          record(a, e, (ok ? '✓ ' : '✗ ') + (e.message || e.tool || ''));
          log(a, ok ? 'OK' : 'ERR', e.message || `${e.tool} terminé`, e);
        }
        if (!ok && !replaying) a.errorUntil = now() + 3500;
        else if (e.message && e.tool === 'Bash') say(a, e.message, { minor: true });
        break;
      }

      case 'AGENT_MESSAGE': {
        const a = ensureAgent(e);
        const target = e.targetAgentId && agents.get(e.targetAgentId);
        if (target && target !== a && a.id !== MAIN_ID && (a.activity === 'coffee' || a.activity === 'idle' || a.station === 'whiteboard' || a.station === 'library' || a.station === 'bench')) {
          a.face = Math.abs(target.x - a.x) > Math.abs(target.y - a.y) ? (target.x > a.x ? 'right' : 'left') : (target.y > a.y ? 'down' : 'up');
        }
        const prefix = target && target !== a ? `@${target.name} ` : '';
        say(a, prefix + (e.message || ''), { to: target ? target.id : null });
        record(a, e, prefix + (e.message || ''));
        log(a, 'MSG', e.message || '', e, target);
        break;
      }

      case 'SUBAGENT_COMPLETE': {
        const a = agents.get(e.agentId);
        if (!a || a.id === MAIN_ID) { log(main, 'DONE', e.message || 'Terminé', e); break; }
        if (a.done) break;
        a.done = true;
        a.tool = null;
        const report = shortText(e.message || 'Mission accomplie.', 150);
        record(a, e, `Rapport : ${report}`);
        record(main, e, `Rapport de ${a.name}`);
        log(a, 'DONE', report, e);
        a.locked = true;
        setQueue(a, [
          goStation(a, 'handoff'),
          { k: 'do', fn: x => { x.face = 'up'; x.carrying = false; throwFolder(x); say(x, `Rapport : ${report}`); } },
          { k: 'wait', ms: 2200 },
          { k: 'do', fn: x => { say(getMain(), `Merci ${x.name}, beau travail !`); x.activity = 'done'; } },
          { k: 'wait', ms: 1200 },
          { k: 'do', fn: x => {
            x.locked = false;
            if (loungeFull()) pushQueue(x, [{ k: 'despawn' }]);
            else pushQueue(x, [goStation(x, 'lounge')]);
          } }
        ]);
        a.carrying = true;
        treeDirty = true;
        break;
      }

      case 'ERROR': {
        const a = ensureAgent(e);
        if (!replaying) a.errorUntil = now() + 4000;
        if (a.station === 'bench' && a.slot >= 0) { benchLamps[a.slot].state = 'fail'; benchLamps[a.slot].until = now() + 9000; }
        say(a, e.message || 'Erreur !', { style: 'error' });
        record(a, e, `Erreur : ${e.message || ''}`);
        log(a, 'ERR', e.message || 'Erreur', e);
        burst(a.x, a.y - 14, '#ff5555', 8);
        break;
      }

      default:
        log(main, 'SYS', `Événement inconnu : ${e.type}`, e);
    }
    treeDirty = true;
    updateCounters();
  }

  function throwFolder(agent) {
    if (replaying) { deskPile = Math.min(6, deskPile + 1); return; }
    folders.push({ x0: agent.x, y0: agent.y - 9, x1: 186, y1: 86 - Math.min(5, deskPile), t0: now(), dur: 750, color: agent.color });
  }

  // Après un rejeu d'historique, chaque agent saute directement à sa destination.
  function fastForward(agent) {
    let guard = 0;
    while (agent.queue.length && guard++ < 50) {
      const step = agent.queue.shift();
      if (step.k === 'go') { claimSpot(agent, step.station); arrive(agent, step.station); }
      else if (step.k === 'do') step.fn(agent);
      else if (step.k === 'despawn') { releaseSpot(agent); agents.delete(agent.id); return; }
    }
    agent.path = []; agent.waitUntil = 0; agent.alpha = 1; agent.locked = false;
    agent.carrying = false;
  }

  function resetRoom(announce) {
    for (const [id] of agents) if (id !== MAIN_ID) agents.delete(id);
    for (const st of Object.values(STATIONS)) st.occ.fill(null);
    particles.length = 0; glyphs.length = 0; beams.length = 0; folders.length = 0; whiteboard.length = 0;
    benchLamps.forEach(l => { l.state = 'idle'; l.until = 0; });
    counters.tools = 0; counters.events = 0;
    deskPile = 0; colorIndex = 1;
    const main = getMain();
    main.bubbles = []; main.history = []; main.files.clear();
    if (selectedId && selectedId !== MAIN_ID) closeInspector();
    if (announce && !replaying) addLogEntry({ t: Date.now(), who: 'Système', color: '#ffb86b', kind: 'SYS', text: 'Chambre réinitialisée.' });
    treeDirty = true;
    updateCounters();
  }

  /* ================================================================
   * Mise à jour (simulation)
   * ================================================================ */
  let lastT = now();
  function update(t, dt) {
    for (const a of agents.values()) {
      if (a.gone) {
        a.alpha = Math.max(0, a.alpha - dt * 2);
        if (a.alpha <= 0) { agents.delete(a.id); if (selectedId === a.id) closeInspector(); treeDirty = true; }
        continue;
      }
      if (a.alpha < 1 && t - a.bornAt > 500) a.alpha = Math.min(1, a.alpha + dt * 2);
      runQueue(a, t);

      if (a.path.length) {
        const p = a.path[0];
        const dx = p.x - a.x, dy = p.y - a.y;
        const d = Math.hypot(dx, dy);
        const step = WALK_SPEED * dt;
        if (d <= step) { a.x = p.x; a.y = p.y; a.path.shift(); }
        else { a.x += (dx / d) * step; a.y += (dy / d) * step; }
        if (Math.abs(dx) > Math.abs(dy)) a.face = dx > 0 ? 'right' : 'left';
        else if (d > 0.1) a.face = dy > 0 ? 'down' : 'up';
        a.walkT += dt;
        a.dustT += dt;
        if (a.dustT > 0.16) { a.dustT = 0; dust(a.x, a.y); }
        if (!a.path.length) runQueue(a, t);
      } else {
        a.walkT = 0;
      }

      // Effets d'activité
      if (!a.path.length && a.activity === 'coding' && a.station === 'code' && Math.random() < dt * 2.2) {
        const d = CODE_DESKS[a.slot] || { x: a.x - 18, y: a.y - 21 };
        glyphs.push({ x: d.x + 18 + rnd(-6, 6), y: d.y - 9, vy: rnd(-12, -7), life: 0, max: rnd(1, 1.6), text: pick(CODE_GLYPHS), color: a.color });
      }
      if (!a.path.length && a.activity === 'planning' && Math.random() < dt * 0.8) addStroke(a);
      updateBubbles(a, t, dt);
    }

    for (const l of benchLamps) if (l.state !== 'idle' && t > l.until) l.state = 'idle';

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.grav || 0) * dt;
      if (p.life > p.max) particles.splice(i, 1);
    }
    for (let i = glyphs.length - 1; i >= 0; i--) {
      const q = glyphs[i];
      q.life += dt; q.y += q.vy * dt;
      if (q.life > q.max) glyphs.splice(i, 1);
    }
    for (let i = beams.length - 1; i >= 0; i--) if (t - beams[i].t0 > beams[i].dur) beams.splice(i, 1);
    for (let i = folders.length - 1; i >= 0; i--) {
      if (t - folders[i].t0 > folders[i].dur) { folders.splice(i, 1); deskPile = Math.min(6, deskPile + 1); }
    }

    // Discussions au coin canapé
    const lounging = [...agents.values()].filter(a => !a.gone && a.activity === 'coffee' && !a.path.length && !a.bubbles.length);
    if (lounging.length && t - lastSmallTalk > 11000 + Math.random() * 9000) {
      lastSmallTalk = t;
      const a = pick(lounging);
      say(a, pick(SMALL_TALK));
      const others = lounging.filter(x => x !== a);
      if (others.length) {
        const b = pick(others);
        setTimeout(() => { if (agents.has(b.id) && b.activity === 'coffee') say(b, pick(REPLIES)); }, 2600);
      }
    }
  }

  function addStroke(agent) {
    if (whiteboard.length > 16) whiteboard.shift();
    const kinds = ['box', 'box', 'arrow', 'line', 'circle'];
    const k = pick(kinds);
    const x = 16 + Math.floor(Math.random() * 56), y = 10 + Math.floor(Math.random() * 14);
    whiteboard.push({ k, x, y, w: 6 + Math.floor(Math.random() * 10), h: 3 + Math.floor(Math.random() * 5), color: agent.color, t0: now() });
  }

  /* ================================================================
   * Rendu : fond statique
   * ================================================================ */
  function drawStaticBackground() {
    const c = bgx;
    const rand = seeded(42);
    // Sol en lattes
    R(c, 0, 36, W, H - 36, '#5d3f33');
    for (let y = 36; y < H; y += 6) {
      R(c, 0, y, W, 1, '#4c3229');
      const off = ((y / 6) % 2) * 17;
      for (let x = -off; x < W; x += 34) R(c, x, y + 1, 1, 5, '#4f352b');
      for (let x = 0; x < W; x += 3) if (rand() < 0.08) R(c, x, y + 2 + Math.floor(rand() * 3), 2, 1, '#674637');
    }
    // Mur
    R(c, 0, 0, W, 36, '#2b2340');
    for (let x = 0; x < W; x += 8) R(c, x, 0, 1, 26, '#30274a');
    R(c, 0, 25, W, 10, '#3a2f55');
    R(c, 0, 25, W, 1, '#4a3d6b');
    R(c, 0, 34, W, 2, '#1c1629');
    R(c, 0, 36, W, 3, 'rgba(0,0,0,0.25)');

    // Tableau blanc
    R(c, 10, 4, 76, 26, '#9aa3b5');
    R(c, 12, 6, 72, 22, '#f4f6fb');
    R(c, 12, 27, 72, 1, '#d5dae6');
    R(c, 18, 30, 60, 2, '#7b8496');
    R(c, 24, 29, 4, 1, '#ff5c8a'); R(c, 30, 29, 4, 1, '#2f7bff'); R(c, 36, 29, 4, 1, '#20b46b');

    // Poster
    R(c, 92, 7, 16, 20, '#1d1730');
    R(c, 93, 8, 14, 18, '#ffb86b');
    R(c, 93, 8, 14, 9, '#ff7eb6');
    R(c, 96, 11, 6, 6, '#ffe28a');
    R(c, 93, 18, 14, 8, '#6b3fa0');
    R(c, 95, 16, 4, 3, '#6b3fa0'); R(c, 100, 15, 5, 4, '#6b3fa0');

    // Cadre de fenêtre
    R(c, 124, 4, 72, 26, '#4a3a2c');
    R(c, 124, 29, 72, 2, '#6b5440');

    // Bibliothèque
    R(c, 220, 4, 52, 40, '#6b4a2f');
    R(c, 222, 6, 48, 36, '#3e2a1b');
    for (let s = 0; s < 4; s++) {
      const sy = 6 + s * 9;
      R(c, 222, sy + 8, 48, 1, '#6b4a2f');
      let x = 223;
      while (x < 268) {
        const bw = 2 + Math.floor(rand() * 3);
        const bh = 5 + Math.floor(rand() * 3);
        const col = ['#c0392b', '#2e86de', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#e67e22', '#d35400', '#7f8c8d', '#f1c40f'][Math.floor(rand() * 10)];
        if (x + bw > 269) break;
        if (rand() < 0.1) { R(c, x, sy + 8 - bh + 1, bh, 1, col); x += 2; continue; }
        R(c, x, sy + 8 - bh, bw, bh, col);
        R(c, x, sy + 8 - bh, bw, 1, shade(col, 0.3));
        x += bw + (rand() < 0.15 ? 1 : 0);
      }
    }
    // Baies serveurs (RAG)
    for (let k = 0; k < 2; k++) {
      const x = 276 + k * 20;
      R(c, x, 6, 18, 38, '#1f2230');
      R(c, x + 1, 7, 16, 36, '#2b2f42');
      for (let u = 0; u < 7; u++) { R(c, x + 2, 9 + u * 5, 14, 3, '#171a26'); R(c, x + 2, 9 + u * 5, 14, 1, '#3a3f58'); }
    }

    // Tapis central
    roundRect(c, 102, 76, 116, 46, '#3b2b52');
    roundRect(c, 105, 79, 110, 40, '#4a3768');
    for (let x = 108; x < 212; x += 6) { R(c, x, 81, 2, 1, '#6a50a0'); R(c, x + 3, 116, 2, 1, '#6a50a0'); }
    // Tapis du salon
    roundRect(c, 232, 142, 76, 50, '#2c4b4f');
    roundRect(c, 235, 145, 70, 44, '#35605f');
    for (let y = 148; y < 188; y += 5) R(c, 238, y, 64, 1, '#3e6f6c');
    // Tapis de l'îlot dev
    R(c, 106, 140, 110, 1, 'rgba(0,0,0,0.15)');
  }
  function roundRect(c, x, y, w, h, col) {
    R(c, x + 2, y, w - 4, h, col); R(c, x, y + 2, w, h - 4, col); R(c, x + 1, y + 1, w - 2, h - 2, col);
  }

  /* ================================================================
   * Rendu : éléments dynamiques du décor
   * ================================================================ */
  function drawWindow(t) {
    R(g, 126, 6, 68, 22, '#141a3a');
    R(g, 126, 6, 68, 8, '#1b1f4a');
    R(g, 126, 20, 68, 8, '#2a2457');
    for (let i = 0; i < 18; i++) {
      const sx = 127 + (hash(i * 13) % 66), sy = 7 + (hash(i * 7 + 1) % 10);
      if ((hash(i + Math.floor(t / 700)) % 5) !== 0) R(g, sx, sy, 1, 1, i % 4 ? '#c9d4ff' : '#fff6c9');
    }
    R(g, 178, 9, 6, 6, '#f6f0d0'); R(g, 180, 9, 4, 4, '#d8d0b0'); R(g, 177, 10, 1, 4, '#f6f0d0');
    // silhouette de ville
    const sky = [8, 12, 6, 14, 9, 11, 5, 13, 7, 10, 12, 6];
    let x = 126;
    sky.forEach((h, i) => {
      const w = 5 + (hash(i) % 4);
      R(g, x, 28 - h, Math.min(w, 194 - x), h, '#0b0d22');
      for (let wy = 28 - h + 2; wy < 27; wy += 3) for (let wx = x + 1; wx < x + w - 1 && wx < 193; wx += 2) {
        if (hash(wx * 31 + wy * 7 + Math.floor(t / 4000)) % 4 === 0) R(g, wx, wy, 1, 1, '#ffcf6b');
      }
      x += w;
    });
    R(g, 159, 6, 2, 22, '#4a3a2c');
    R(g, 126, 16, 68, 1, '#4a3a2c');
  }

  function drawStringLights(t) {
    for (let x = 4, i = 0; x < W; x += 9, i++) {
      const y = 2 + Math.round(Math.sin(x * 0.12) * 1.2 + 1);
      R(g, x, y - 1, 1, 1, '#3a3050');
      const cols = ['#ffb86b', '#ff6ac1', '#5ef1ff', '#f1fa8c'];
      const on = (Math.sin(t / 600 + i * 1.7) + 1) / 2;
      const col = cols[i % 4];
      R(g, x, y, 2, 2, on > 0.35 ? col : shade(col, -0.5));
      if (on > 0.6) { g.fillStyle = rgba(col, 0.12); g.fillRect(x - 2, y - 1, 6, 5); }
    }
  }

  function drawClock(t) {
    const cx = 207, cy = 14;
    R(g, cx - 6, cy - 6, 13, 13, '#1b1528');
    R(g, cx - 5, cy - 5, 11, 11, '#efe6d2');
    R(g, cx, cy - 5, 1, 1, '#8a7a66'); R(g, cx, cy + 5, 1, 1, '#8a7a66'); R(g, cx - 5, cy, 1, 1, '#8a7a66'); R(g, cx + 5, cy, 1, 1, '#8a7a66');
    const d = new Date();
    const ang = [((d.getHours() % 12) + d.getMinutes() / 60) / 12, d.getMinutes() / 60, d.getSeconds() / 60];
    const lens = [2.5, 4, 4.5], cols = ['#2a2238', '#2a2238', '#e0445a'];
    ang.forEach((a, i) => {
      const th = a * Math.PI * 2 - Math.PI / 2;
      for (let r = 0; r <= lens[i]; r += 0.5) R(g, Math.round(cx + Math.cos(th) * r), Math.round(cy + Math.sin(th) * r), 1, 1, cols[i]);
    });
  }

  function drawWhiteboard(t) {
    R(g, 16, 8, 30, 1, '#c4cad8'); // titre griffonné
    for (const s of whiteboard) {
      const p = clamp((t - s.t0) / 700, 0, 1);
      const col = s.color;
      if (s.k === 'box') {
        const w = Math.round(s.w * p);
        R(g, s.x, s.y, w, 1, col); R(g, s.x, s.y + s.h, w, 1, col);
        if (p > 0.5) { R(g, s.x, s.y, 1, s.h, col); R(g, s.x + s.w, s.y, 1, s.h + 1, col); }
      } else if (s.k === 'arrow') {
        const w = Math.round(s.w * p);
        R(g, s.x, s.y, w, 1, col);
        if (p > 0.9) { R(g, s.x + s.w - 1, s.y - 1, 1, 1, col); R(g, s.x + s.w - 1, s.y + 1, 1, 1, col); }
      } else if (s.k === 'line') {
        for (let i = 0; i < s.w * p; i += 2) R(g, s.x + i, s.y + (i % 4 ? 0 : 1), 2, 1, '#555b6e');
      } else {
        if (p > 0.2) { R(g, s.x + 1, s.y, 3, 1, col); R(g, s.x + 1, s.y + 4, 3, 1, col); }
        if (p > 0.6) { R(g, s.x, s.y + 1, 1, 3, col); R(g, s.x + 4, s.y + 1, 1, 3, col); }
      }
    }
  }

  function drawShelfActivity(t) {
    for (const a of agents.values()) {
      if (a.station !== 'library' || a.path.length || a.slot < 0) continue;
      if (a.slot <= 1) {
        const bx = Math.round(a.x) - 2 + ((Math.floor(t / 900) % 3) - 1) * 3;
        const sy = 6 + (Math.floor(t / 1800 + a.slot) % 4) * 9;
        R(g, bx, sy + 4, 3, 5, '#f5ecd7');
        R(g, bx, sy + 4, 3, 1, a.color);
      }
    }
  }

  function drawServers(t) {
    const busy = [...agents.values()].some(a => a.station === 'library' && !a.path.length);
    for (let k = 0; k < 2; k++) {
      const x = 276 + k * 20;
      for (let u = 0; u < 7; u++) {
        for (let l = 0; l < 3; l++) {
          const speed = busy ? 120 : 600;
          const on = hash(k * 100 + u * 10 + l + Math.floor(t / speed)) % 3 !== 0;
          R(g, x + 11 + l * 2, 10 + u * 5, 1, 1, on ? (l === 2 ? '#ffb86b' : '#57f287') : '#21402a');
        }
        R(g, x + 3, 10 + u * 5, 5, 1, '#3d4460');
      }
    }
  }

  /* ---------- Accessoires triés en profondeur (y de base) ---------- */
  function propList(t) {
    const list = [];
    list.push({ y: 48, draw: () => drawBigPlant(t) });
    list.push({ y: 108, draw: () => drawMasterDesk(t) });
    CODE_DESKS.forEach((d, i) => list.push({ y: d.y + 12, draw: () => drawCodeDesk(d, i, t) }));
    list.push({ y: 172, draw: () => drawBench(t) });
    list.push({ y: 141, draw: () => drawSofaBack() });
    list.push({ y: 150, draw: () => drawFloorLamp(t) });
    list.push({ y: 174, draw: () => drawCoffeeTable(t) });
    list.push({ y: 205, draw: () => drawCoffeeMachine(t) });
    list.push({ y: 182, draw: () => drawCat(t) });
    return list;
  }

  function drawBigPlant(t) {
    const sway = Math.round(Math.sin(t / 1400));
    R(g, 110, 40, 10, 8, '#8b5a3c'); R(g, 110, 40, 10, 2, '#a86f4b'); R(g, 111, 47, 8, 1, '#6e4630');
    const leaf = (x, y, c) => R(g, x + sway * (y < 30 ? 1 : 0), y, 3, 2, c);
    [[108, 34], [113, 30], [117, 33], [110, 28], [116, 26], [112, 24], [119, 29], [107, 30], [114, 35]].forEach(([x, y], i) => leaf(x, y, i % 2 ? '#3fa66b' : '#2e8a56'));
    R(g, 114, 30, 1, 10, '#2a6b45');
  }

  function drawMasterDesk(t) {
    const main = agents.get(MAIN_ID);
    const active = main && now() - main.lastToolAt < 2500;
    // plateau + façade
    R(g, 126, 86, 68, 8, '#9a6a45');
    R(g, 126, 86, 68, 1, '#b8845a');
    R(g, 126, 94, 68, 12, '#7a5236');
    R(g, 128, 96, 30, 8, '#6d4930'); R(g, 162, 96, 30, 8, '#6d4930');
    R(g, 142, 99, 4, 1, '#c99a6b'); R(g, 174, 99, 4, 1, '#c99a6b');
    R(g, 126, 106, 68, 2, 'rgba(0,0,0,0.3)');
    // deux écrans (dos) + lueur
    for (const mx of [140, 168]) {
      R(g, mx, 76, 13, 9, '#22202e');
      R(g, mx + 1, 77, 11, 7, '#2e2b3d');
      R(g, mx + 5, 85, 3, 2, '#22202e');
      R(g, mx + 3, 87, 7, 1, '#3a3648');
      g.fillStyle = active ? 'rgba(120,230,255,0.22)' : 'rgba(120,230,255,0.1)';
      g.fillRect(mx - 1, 75, 15, 1);
    }
    // clavier
    R(g, 153, 88, 14, 3, '#2e2b3d'); R(g, 154, 88, 12, 1, '#4a4660');
    // plante sur le bureau
    R(g, 129, 82, 6, 5, '#c66b3d'); R(g, 129, 82, 6, 1, '#e08850');
    R(g, 128, 78, 3, 3, '#3fa66b'); R(g, 132, 76, 3, 4, '#2e8a56'); R(g, 134, 79, 3, 3, '#3fa66b'); R(g, 130, 75, 2, 3, '#4fbf7d');
    // tasse fumante
    R(g, 185, 83, 4, 4, '#f2efe8'); R(g, 189, 84, 1, 2, '#f2efe8'); R(g, 186, 84, 2, 1, '#6b3e26');
    for (let i = 0; i < 3; i++) {
      const ph = (t / 900 + i / 3) % 1;
      const sx = 186 + Math.round(Math.sin(ph * 6 + i) * 1);
      g.fillStyle = `rgba(255,255,255,${0.45 * (1 - ph)})`;
      g.fillRect(sx, Math.round(82 - ph * 8), 1, 1);
    }
    // pile de dossiers reçus
    for (let i = 0; i < deskPile; i++) {
      R(g, 178 - (i % 2), 86 - i, 7, 2, i % 2 ? '#f4c95d' : '#e8b84a');
      R(g, 178 - (i % 2), 86 - i, 7, 1, '#ffe08a');
    }
    // plaque
    R(g, 151, 99, 18, 5, '#2b2340'); R(g, 152, 100, 16, 3, '#d97757');
  }

  function drawCodeDesk(d, i, t) {
    const user = [...agents.values()].find(a => a.station === 'code' && a.slot === i && !a.path.length && a.activity === 'coding');
    // chaise
    R(g, d.x + 13, d.y + 17, 10, 5, '#3b3350'); R(g, d.x + 13, d.y + 17, 10, 1, '#4e4568');
    R(g, d.x + 17, d.y + 22, 2, 2, '#2a2438');
    // bureau
    R(g, d.x, d.y, 36, 5, '#a77b54'); R(g, d.x, d.y, 36, 1, '#c4966a');
    R(g, d.x, d.y + 5, 36, 7, '#7c5639');
    R(g, d.x + 1, d.y + 6, 2, 6, '#694830'); R(g, d.x + 33, d.y + 6, 2, 6, '#694830');
    R(g, d.x, d.y + 12, 36, 1, 'rgba(0,0,0,0.3)');
    // écran
    const mx = d.x + 11;
    R(g, mx, d.y - 9, 14, 10, '#1d1b26');
    R(g, mx + 6, d.y + 1, 2, 2, '#1d1b26');
    if (user) {
      R(g, mx + 1, d.y - 8, 12, 8, '#0d1b2a');
      for (let r = 0; r < 4; r++) {
        const seed = hash(i * 97 + r + Math.floor(t / 260));
        const len = 2 + (seed % 9);
        const indent = (seed >> 4) % 3;
        R(g, mx + 2 + indent, d.y - 7 + r * 2, Math.min(len, 10 - indent), 1, ['#5ef1ff', '#ff6ac1', '#7ee787', '#f1fa8c', '#bd93f9'][(seed >> 8) % 5]);
      }
      g.fillStyle = rgba(user.color, 0.16);
      g.fillRect(mx - 4, d.y - 12, 22, 16);
    } else {
      R(g, mx + 1, d.y - 8, 12, 8, '#161a24');
      R(g, mx + 2, d.y - 7, 3, 1, '#232a3a');
    }
    // clavier + tasse ou livre
    R(g, d.x + 12, d.y + 2, 11, 2, '#2e2b3d');
    if (i % 2) { R(g, d.x + 29, d.y + 1, 3, 3, '#e8e2d6'); } else { R(g, d.x + 3, d.y + 1, 5, 3, '#2e86de'); R(g, d.x + 3, d.y + 1, 5, 1, '#5aa5f0'); }
  }

  function drawBench(t) {
    // plan de travail
    R(g, 4, 152, 76, 6, '#59606e'); R(g, 4, 152, 76, 1, '#7a8394');
    R(g, 4, 158, 76, 12, '#3d4250');
    for (let x = 8; x < 78; x += 18) R(g, x, 160, 14, 8, '#353946');
    R(g, 4, 170, 76, 2, 'rgba(0,0,0,0.3)');
    // oscilloscope (poste 1)
    R(g, 7, 140, 22, 13, '#2a2f3b'); R(g, 9, 142, 14, 9, '#0c1a12');
    for (let x = 0; x < 14; x++) {
      const amp = benchLamps[0].state === 'run' ? 3 : 1.5;
      const y = Math.round(146 + Math.sin(x * 0.9 + t / 160) * amp);
      R(g, 9 + x, y, 1, 1, '#57f287');
    }
    R(g, 25, 143, 2, 2, '#888'); R(g, 25, 147, 2, 2, '#888');
    // terminal (poste 2)
    R(g, 31, 138, 22, 15, '#22252f'); R(g, 33, 140, 18, 10, '#05110a');
    const running = benchLamps.some(l => l.state === 'run');
    for (let r = 0; r < 4; r++) {
      const seed = hash(r + Math.floor(t / (running ? 180 : 1400)));
      R(g, 34, 141 + r * 2, 2 + (seed % 14), 1, r === 3 && Math.floor(t / 400) % 2 ? '#57f287' : '#2f9e5a');
    }
    R(g, 36, 153, 12, 1, '#555b6e');
    // rack de tubes à essai (poste 3)
    R(g, 55, 145, 22, 8, '#30343f');
    ['#ff6ac1', '#5ef1ff', '#f1fa8c', '#7ee787', '#ffb86b'].forEach((c, k) => {
      R(g, 57 + k * 4, 141, 2, 7, '#c9d6e3'); R(g, 57 + k * 4, 144 + (k % 2), 2, 4 - (k % 2), c);
    });
    // voyants (un par poste)
    const lampX = [18, 42, 66];
    benchLamps.forEach((l, k) => {
      const x = lampX[k] - 2, y = 133;
      R(g, x, y + 4, 5, 3, '#1c1f27');
      let col = '#3a3f4c', glow = null;
      if (l.state === 'run') { const on = Math.floor(t / 250) % 2; col = on ? '#ffb347' : '#7a5420'; glow = on ? '#ffb347' : null; }
      if (l.state === 'ok') { col = '#57f287'; glow = col; }
      if (l.state === 'fail') { const on = Math.floor(t / 180) % 2; col = on ? '#ff4d5e' : '#8a1f2a'; glow = on ? '#ff4d5e' : null; }
      R(g, x + 1, y, 3, 4, col); R(g, x + 1, y, 1, 1, shade(col, 0.4));
      if (glow) { g.fillStyle = rgba(glow, 0.22); g.fillRect(x - 3, y - 3, 11, 10); }
    });
    // tour serveur au sol
    R(g, 4, 176, 9, 22, '#23262f'); R(g, 5, 177, 7, 20, '#2f3340');
    for (let u = 0; u < 5; u++) R(g, 7, 179 + u * 4, 1, 1, hash(u + Math.floor(t / 300)) % 2 ? '#57f287' : '#1f3d29');
  }

  function drawSofaBack() {
    R(g, 236, 128, 64, 10, '#7a3e5c'); R(g, 236, 128, 64, 1, '#9a5a7a');
    R(g, 238, 138, 60, 9, '#8c4a6b'); R(g, 238, 138, 60, 1, '#a8668a');
    R(g, 258, 139, 1, 7, '#7a3e5c'); R(g, 278, 139, 1, 7, '#7a3e5c');
    R(g, 234, 132, 5, 16, '#6b3550'); R(g, 297, 132, 5, 16, '#6b3550');
    R(g, 238, 147, 60, 2, '#5e2d47');
    R(g, 242, 132, 8, 5, '#f1c27d'); R(g, 242, 132, 8, 1, '#ffd89a'); // coussin
  }

  function drawFloorLamp(t) {
    R(g, 229, 148, 6, 2, '#2a2438');
    R(g, 231, 124, 2, 24, '#3a3348');
    R(g, 226, 118, 12, 7, '#f6c97a'); R(g, 227, 117, 10, 1, '#ffe2a8');
  }

  function drawCoffeeTable(t) {
    R(g, 252, 164, 32, 8, '#9a6a45'); R(g, 252, 164, 32, 1, '#b8845a');
    R(g, 254, 172, 2, 2, '#6d4930'); R(g, 280, 172, 2, 2, '#6d4930');
    R(g, 258, 165, 6, 4, '#2e86de'); R(g, 258, 165, 6, 1, '#5aa5f0');
    R(g, 270, 165, 3, 3, '#f2efe8'); R(g, 276, 166, 4, 2, '#e05561');
  }

  function drawCoffeeMachine(t) {
    R(g, 288, 174, 30, 32, '#5a4636'); R(g, 288, 174, 30, 2, '#776050');
    R(g, 293, 160, 18, 16, '#2b2f3a'); R(g, 294, 161, 16, 3, '#3d4252');
    R(g, 296, 166, 6, 3, '#57f287'); R(g, 304, 166, 3, 3, '#ff6ac1');
    R(g, 299, 170, 6, 4, '#15171d'); R(g, 300, 172, 4, 2, '#f2efe8');
    const ph = (t / 1100) % 1;
    g.fillStyle = `rgba(255,255,255,${0.4 * (1 - ph)})`;
    g.fillRect(301 + Math.round(Math.sin(t / 300)), Math.round(170 - ph * 9), 1, 1);
    R(g, 290, 178, 5, 6, '#c98b4e'); R(g, 290, 178, 5, 1, '#e8b46e'); // bocal
    R(g, 312, 176, 4, 5, '#f2efe8');
  }

  function drawCat(t) {
    const x = 214, y = 182;
    const breathe = Math.round((Math.sin(t / 900) + 1) / 2);
    R(g, x, y - 4 - breathe, 10, 4 + breathe, '#e08a3c');
    R(g, x + 1, y - 5 - breathe, 8, 1, '#e08a3c');
    R(g, x + 2, y - 3, 6, 1, '#c8702a');
    R(g, x + 8, y - 7, 5, 4, '#e08a3c'); R(g, x + 8, y - 8, 1, 1, '#e08a3c'); R(g, x + 12, y - 8, 1, 1, '#e08a3c');
    R(g, x + 9, y - 5, 1, 1, '#3a2a20'); R(g, x + 11, y - 5, 1, 1, '#3a2a20');
    const flick = Math.floor(t / 1600) % 4 === 0 ? -1 : 0;
    R(g, x - 3, y - 2 + flick, 4, 1, '#e08a3c'); R(g, x - 4, y - 3 + flick, 1, 1, '#e08a3c');
    R(g, x, y, 12, 1, 'rgba(0,0,0,0.25)');
    if (Math.floor(t / 1200) % 3 === 0) R(g, x + 14, y - 11 - (Math.floor(t / 300) % 3), 2, 1, '#cfd8ff');
  }

  /* ================================================================
   * Rendu : personnages
   * ================================================================ */
  function drawAgent(a, t) {
    const walking = a.path.length > 0;
    const sitting = !walking && a.pose === 'sit';
    const bob = walking ? -Math.abs(Math.round(Math.sin(a.walkT * 14))) : 0;
    const fx = Math.round(a.x), fy = Math.round(a.y) + bob + (sitting ? 2 : 0);
    const x = fx - 5;
    const y = fy;
    const face = a.face;
    const col = a.color;
    const pants = '#2a2238', shoe = '#15111c';

    g.save();
    g.globalAlpha = a.alpha;

    // ombre
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x + 1, Math.round(a.y) - 1 + (sitting ? 2 : 0), 8, 2);

    // jambes
    if (!sitting) {
      const ph = walking ? Math.floor(a.walkT * 8) % 2 : -1;
      const lh = ph === 1 ? 2 : 3, rh = ph === 0 ? 2 : 3;
      R(g, x + 2, y - 3, 2, lh, pants); R(g, x + 2, y - 3 + lh - 1, 2, 1, shoe);
      R(g, x + 6, y - 3, 2, rh, pants); R(g, x + 6, y - 3 + rh - 1, 2, 1, shoe);
    } else if (face === 'down') {
      R(g, x + 2, y - 3, 2, 2, pants); R(g, x + 6, y - 3, 2, 2, pants);
    }

    // corps
    R(g, x + 1, y - 9, 8, 6, col);
    R(g, x + 1, y - 4, 8, 1, shade(col, -0.3));
    R(g, x + 4, y - 9, 2, 1, shade(col, 0.35));
    const swing = walking ? Math.round(Math.sin(a.walkT * 14)) : 0;
    const typing = !walking && (a.activity === 'coding' || a.activity === 'orchestrating') && Math.floor(t / 140) % 2;
    R(g, x, y - 9 + swing, 1, 4, shade(col, -0.15)); R(g, x, y - 5 + swing, 1, 1, a.skin);
    R(g, x + 9, y - 9 - swing, 1, 4, shade(col, -0.15)); R(g, x + 9, y - 5 - swing + (typing ? -1 : 0), 1, 1, a.skin);
    if (a.id === MAIN_ID) { R(g, x, y - 10, 10, 2, shade(col, -0.2)); } // capuche

    // tête
    R(g, x + 1, y - 16, 8, 7, a.skin);
    const blink = ((t / 1000 + a.blinkSeed) % 3.6) < 0.12;
    const eye = '#1b1424';
    if (face === 'up') {
      R(g, x + 1, y - 16, 8, 6, a.hair);
    } else {
      R(g, x + 1, y - 16, 8, 2, a.hair);
      if (face === 'down') {
        R(g, x + 1, y - 14, 1, 2, a.hair); R(g, x + 8, y - 14, 1, 2, a.hair);
        R(g, x + 3, y - 12 + (blink ? 1 : 0), 1, blink ? 1 : 2, eye);
        R(g, x + 6, y - 12 + (blink ? 1 : 0), 1, blink ? 1 : 2, eye);
        R(g, x + 2, y - 10, 1, 1, 'rgba(255,120,120,0.45)'); R(g, x + 7, y - 10, 1, 1, 'rgba(255,120,120,0.45)');
      } else if (face === 'left') {
        R(g, x + 5, y - 14, 4, 3, a.hair);
        R(g, x + 2, y - 12 + (blink ? 1 : 0), 1, blink ? 1 : 2, eye);
      } else {
        R(g, x + 1, y - 14, 4, 3, a.hair);
        R(g, x + 7, y - 12 + (blink ? 1 : 0), 1, blink ? 1 : 2, eye);
      }
    }
    drawAccessory(a, x, y, face, t);

    // objets en main
    if (a.carrying) { R(g, x + 3, y - 8, 6, 4, '#f4c95d'); R(g, x + 3, y - 8, 6, 1, '#ffe08a'); }
    if (!walking && a.activity === 'coffee') {
      const hx = face === 'left' ? x - 1 : x + 9;
      R(g, hx, y - 7, 2, 2, '#f2efe8');
      const ph = (t / 800 + a.blinkSeed) % 1;
      g.fillStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`;
      g.fillRect(hx + (ph > 0.5 ? 1 : 0), Math.round(y - 9 - ph * 5), 1, 1);
    }
    if (!walking && a.activity === 'reading' && face === 'up') {
      const lift = Math.floor(t / 500 + a.blinkSeed) % 2;
      R(g, x + 9, y - 13 - lift, 1, 5, shade(col, -0.15));
      R(g, x + 9, y - 14 - lift, 1, 1, a.skin);
    }

    // marqueurs
    if (a.errorUntil > now() && Math.floor(t / 200) % 2) {
      R(g, fx - 1, y - 26, 2, 5, '#ff4d5e'); R(g, fx - 1, y - 20, 2, 2, '#ff4d5e');
    }
    if (a.id === MAIN_ID) {
      const pulse = (Math.sin(t / 500) + 1) / 2;
      const c2 = pulse > 0.5 ? '#ffd2a8' : '#d97757';
      R(g, fx, y - 22, 1, 3, c2); R(g, fx - 1, y - 21, 3, 1, c2);
    }
    if (selectedId === a.id) {
      const by = y - 25 - Math.round((Math.sin(t / 220) + 1));
      R(g, fx - 2, by, 5, 1, '#f1fa8c'); R(g, fx - 1, by + 1, 3, 1, '#f1fa8c'); R(g, fx, by + 2, 1, 1, '#f1fa8c');
    }
    g.restore();
  }

  function drawAccessory(a, x, y, face, t) {
    const role = a.role;
    if (a.id === MAIN_ID) {
      R(g, x + 1, y - 17, 8, 1, '#2b2b36');
      R(g, x, y - 14, 1, 3, '#2b2b36'); R(g, x + 9, y - 14, 1, 3, '#2b2b36');
      if (face === 'down') R(g, x + 1, y - 11, 2, 1, '#2b2b36');
      return;
    }
    if (role === 'Architect') { R(g, x, y - 17, 10, 2, '#f6c945'); R(g, x + 2, y - 18, 6, 1, '#f6c945'); R(g, x + 1, y - 17, 8, 1, '#ffe27a'); }
    else if (role === 'Coder') { R(g, x + 1, y - 18, 8, 3, '#3a3f58'); R(g, x + 1, y - 16, 8, 1, a.color); R(g, x + 4, y - 19, 2, 1, '#3a3f58'); }
    else if (role === 'Researcher' && face !== 'up') {
      if (face === 'down') { R(g, x + 2, y - 13, 7, 1, '#9be7ff'); R(g, x + 2, y - 12, 1, 1, '#9be7ff'); R(g, x + 7, y - 12, 1, 1, '#9be7ff'); }
      else R(g, face === 'left' ? x + 1 : x + 6, y - 13, 3, 1, '#9be7ff');
    }
    else if (role === 'Tester') { R(g, x + 1, y - 14, 8, 1, '#2b8a3e'); if (face === 'down') { R(g, x + 2, y - 13, 3, 2, 'rgba(126,231,135,0.75)'); R(g, x + 5, y - 13, 3, 2, 'rgba(126,231,135,0.75)'); } }
    else if (role === 'Reviewer') { R(g, x + 1, y - 18, 7, 2, '#e05561'); R(g, x + 7, y - 17, 2, 1, '#e05561'); R(g, x + 4, y - 19, 1, 1, '#e05561'); }
    else if (role === 'Debugger') { R(g, x + 3, y - 19, 1, 3, '#333'); R(g, x + 6, y - 19, 1, 3, '#333'); R(g, x + 2, y - 20, 2, 1, '#ff5c8a'); R(g, x + 6, y - 20, 2, 1, '#ff5c8a'); }
  }

  /* ================================================================
   * Rendu : lumière d'ambiance
   * ================================================================ */
  function glow(x, y, r, col, a) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rgba(col, a)); grd.addColorStop(1, rgba(col, 0));
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function drawLighting(t) {
    g.fillStyle = 'rgba(14, 8, 30, 0.28)';
    g.fillRect(0, 0, W, H);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const flicker = 1 + Math.sin(t / 130) * 0.02;
    glow(232, 122, 48 * flicker, '#ffb86b', 0.20);
    glow(160, 30, 60, '#5a6bff', 0.10);
    glow(160, 82, 30, '#ffb27a', 0.10);
    glow(300, 170, 22, '#ff6ac1', 0.08);
    glow(46, 40, 40, '#ffffff', 0.05);
    const main = agents.get(MAIN_ID);
    if (main && now() - main.lastToolAt < 2500) { glow(146, 80, 16, '#78e6ff', 0.18); glow(174, 80, 16, '#78e6ff', 0.18); }
    if (benchLamps.some(l => l.state === 'run')) glow(41, 146, 26, '#57f287', 0.08);
    g.restore();
    // vignette
    const v = g.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 210);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(5,2,12,0.45)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }

  function drawEffects(t) {
    for (const b of beams) {
      const p = (t - b.t0) / b.dur;
      const a = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
      const w = 4 + Math.round(Math.sin(p * 20) * 1);
      g.fillStyle = rgba(b.color, 0.25 * a); g.fillRect(b.x - w, 0, w * 2, b.y);
      g.fillStyle = `rgba(255,255,255,${0.6 * a})`; g.fillRect(b.x - 1, 0, 2, b.y);
      const rr = Math.round(p * 12);
      g.fillStyle = rgba(b.color, 0.5 * a);
      g.fillRect(b.x - rr, b.y - 1, rr * 2, 1); g.fillRect(b.x - rr + 2, b.y + 1, rr * 2 - 4, 1);
      if (Math.random() < 0.6) particles.push({ x: b.x + rnd(-4, 4), y: b.y - rnd(0, 6), vx: 0, vy: rnd(-40, -20), life: 0, max: 0.6, color: '#ffffff', size: 1, grav: 0 });
    }
    for (const p of particles) {
      g.globalAlpha = clamp(1 - p.life / p.max, 0, 1);
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    g.globalAlpha = 1;
    for (const f of folders) {
      const p = clamp((t - f.t0) / f.dur, 0, 1);
      const e = p * p * (3 - 2 * p);
      const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e - Math.sin(p * Math.PI) * 16;
      R(g, x - 3, y - 2, 7, 5, '#f4c95d'); R(g, x - 3, y - 2, 7, 1, '#ffe08a'); R(g, x - 3, y - 3, 3, 1, '#f4c95d');
    }
  }

  /* ================================================================
   * Rendu : couche texte haute résolution
   * ================================================================ */
  const FONT = '"Pixelify Sans", "Silkscreen", ui-monospace, monospace';

  function pixelBox(x, y, w, h, p, border, fill) {
    ctx.fillStyle = border;
    ctx.fillRect(x + p, y, w - 2 * p, h); ctx.fillRect(x, y + p, w, h - 2 * p);
    ctx.fillStyle = fill;
    ctx.fillRect(x + 2 * p, y + p, w - 4 * p, h - 2 * p); ctx.fillRect(x + p, y + 2 * p, w - 2 * p, h - 4 * p);
  }

  function wrap(text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines.slice(0, 5);
  }

  function drawOverlay(t) {
    const U = S;
    const p = Math.max(2, Math.round(U * 0.7));

    // étiquettes de nom
    const tagSize = Math.max(9, Math.round(U * 2.6));
    ctx.font = `600 ${tagSize}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const tags = [];
    for (const a of agents.values()) {
      if (a.alpha < 0.3) continue;
      const isMain = a.id === MAIN_ID;
      const label = isMain ? 'Claude · Orchestrateur' : `${a.name} · ${a.role}`;
      const bw = ctx.measureText(label).width + p * 4, bh = tagSize + p * 2;
      const cx = (isMain ? 160 : a.x) * U;
      const cy = (isMain ? 111 : a.y + (a.pose === 'sit' && !a.path.length ? 6 : 4)) * U;
      tags.push({ a, label, w: bw, h: bh, x: clamp(Math.round(cx - bw / 2), 0, canvas.width - bw), y: Math.round(cy - bh / 2 + p) });
    }
    tags.sort((m, n) => m.y - n.y || m.x - n.x);
    const placedTags = [];
    for (const tg of tags) {
      let guard = 0, hit = true;
      while (hit && guard++ < 8) {
        hit = false;
        for (const o of placedTags) {
          if (tg.x < o.x + o.w && tg.x + tg.w > o.x && tg.y < o.y + o.h && tg.y + tg.h > o.y) { tg.y = o.y + o.h + 1; hit = true; }
        }
      }
      placedTags.push(tg);
      const a = tg.a;
      ctx.globalAlpha = a.alpha * (a.done ? 0.7 : 1);
      ctx.fillStyle = 'rgba(12,8,20,0.8)';
      ctx.fillRect(tg.x, tg.y, tg.w, tg.h);
      ctx.fillStyle = ROLE_COLORS[a.role] || a.color;
      ctx.fillRect(tg.x, tg.y, p, tg.h);
      ctx.fillStyle = '#f3eefc';
      ctx.fillText(tg.label, Math.round(tg.x + tg.w / 2 + p / 2), Math.round(tg.y + tg.h / 2 + 1));
      ctx.globalAlpha = 1;
    }

    // particules de code
    ctx.font = `600 ${Math.max(9, Math.round(U * 2.8))}px ${FONT}`;
    for (const q of glyphs) {
      ctx.globalAlpha = clamp(1 - q.life / q.max, 0, 1);
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, q.x * U, q.y * U);
    }
    ctx.globalAlpha = 1;

    // bulles
    const fs = Math.max(11, Math.round(U * 3.3));
    ctx.font = `${fs}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lh = Math.round(fs * 1.2);
    const maxW = Math.round(84 * U);
    const items = [];
    for (const a of agents.values()) {
      const b = a.bubbles[0];
      if (!b || a.alpha < 0.5) continue;
      const full = wrap(b.text, maxW);
      const shown = b.text.slice(0, Math.floor(b.shown));
      // la mise en page est figée sur le texte complet, on n'affiche que la partie tapée
      let remaining = shown.length;
      const lines = full.map(l => { const part = l.slice(0, Math.max(0, remaining)); remaining -= l.length + 1; return part; });
      const w = Math.max(...full.map(l => ctx.measureText(l).width)) + p * 6;
      const h = full.length * lh + p * 5;
      const headY = (a.y - (a.pose === 'sit' && !a.path.length ? 16 : 19) - (a.id === MAIN_ID ? 6 : 0)) * U;
      let x = Math.round(a.x * U - w / 2);
      x = clamp(x, p, canvas.width - w - p);
      let fade = 1;
      if (b.doneAt) {
        const hold = a.bubbles.length > 1 ? BUBBLE_HOLD * 0.6 : BUBBLE_HOLD;
        fade = clamp(1 - (t - b.doneAt - hold) / 300, 0, 1);
      }
      items.push({ a, b, lines, w, h, x, y: Math.round(headY - h - p * 3), ax: a.x * U, ay: headY, fade });
    }
    // empilement sans chevauchement
    items.sort((m, n) => n.ay - m.ay);
    const placed = [];
    for (const it of items) {
      let moved = true, guard = 0;
      while (moved && guard++ < 20) {
        moved = false;
        for (const o of placed) {
          if (it.x < o.x + o.w + p && it.x + it.w + p > o.x && it.y < o.y + o.h + p && it.y + it.h + p > o.y) {
            it.y = o.y - it.h - p * 2; moved = true;
          }
        }
      }
      if (it.y < p) it.y = p;
      placed.push(it);
    }
    for (const it of placed) {
      const { b, a } = it;
      ctx.globalAlpha = it.fade * a.alpha;
      const isErr = b.style === 'error';
      const border = isErr ? '#ff4d5e' : '#1a1326';
      const fill = isErr ? '#ffe3e6' : (a.id === MAIN_ID ? '#fff3ea' : '#fbf8ff');
      // queue
      const tx = clamp(it.ax, it.x + p * 3, it.x + it.w - p * 3);
      const gap = it.ay - (it.y + it.h);
      if (gap <= p * 4) {
        ctx.fillStyle = border;
        ctx.fillRect(tx - p * 2, it.y + it.h - p, p * 4, p * 2);
        ctx.fillRect(tx - p, it.y + it.h + p, p * 2, p);
        ctx.fillStyle = fill;
        ctx.fillRect(tx - p, it.y + it.h - p * 2, p * 2, p * 2);
      } else {
        ctx.fillStyle = rgba(isErr ? '#ff4d5e' : '#fbf8ff', 0.55);
        for (let yy = it.y + it.h; yy < it.ay - p; yy += p * 2) ctx.fillRect(Math.round(tx - p / 2), yy, p, p);
      }
      pixelBox(it.x, it.y, it.w, it.h, p, border, fill);
      ctx.fillStyle = a.color;
      ctx.fillRect(it.x + p * 2, it.y + p, it.w - p * 4, p);
      ctx.fillStyle = isErr ? '#7a0f1c' : '#231a33';
      it.lines.forEach((l, i) => ctx.fillText(l, it.x + p * 3, it.y + p * 3 + i * lh));
      if (b.shown < b.text.length && Math.floor(t / 250) % 2) {
        const li = Math.max(0, it.lines.findIndex((l, i) => i === it.lines.length - 1 || !it.lines[i + 1]));
        const lw = ctx.measureText(it.lines[li] || '').width;
        ctx.fillRect(it.x + p * 3 + lw + 1, it.y + p * 3 + li * lh + 2, Math.max(2, p), fs - 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ================================================================
   * Boucle principale
   * ================================================================ */
  function frame() {
    const t = now();
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    update(t, dt);

    g.clearRect(0, 0, W, H);
    g.drawImage(bg, 0, 0);
    drawWindow(t);
    drawStringLights(t);
    drawClock(t);
    drawWhiteboard(t);
    drawShelfActivity(t);
    drawServers(t);

    const drawables = propList(t);
    for (const a of agents.values()) drawables.push({ y: a.y + (a.pose === 'sit' && !a.path.length ? 2 : 0) + 0.5, draw: () => drawAgent(a, t) });
    drawables.sort((m, n) => m.y - n.y);
    for (const d of drawables) d.draw();

    drawEffects(t);
    drawLighting(t);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, W * S, H * S);
    drawOverlay(t);

    if (treeDirty) { treeDirty = false; renderTree(); }
    requestAnimationFrame(frame);
  }

  /* ================================================================
   * HUD : arbre, journal, compteurs, fiche
   * ================================================================ */
  function statusOf(a) {
    if (a.gone) return 'Parti';
    if (a.errorUntil > now()) return STATUS_LABEL.error;
    if (a.path.length) return STATUS_LABEL.walking;
    if (a.done && a.activity !== 'handoff') return a.activity === 'coffee' ? 'Terminé · café' : STATUS_LABEL.done;
    return STATUS_LABEL[a.activity] || a.activity;
  }

  setInterval(() => { treeDirty = true; }, 500);

  function renderTree() {
    const tree = $('#tree');
    const main = getMain();
    const subs = [...agents.values()].filter(a => a.id !== MAIN_ID);
    const node = a => {
      const li = document.createElement('li');
      const div = document.createElement('div');
      div.className = 'node' + (selectedId === a.id ? ' selected' : '') + (a.done ? ' done' : '');
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = a.color; sw.style.color = a.color;
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = a.name;
      const role = document.createElement('span'); role.className = 'role-chip'; role.textContent = a.role; role.style.color = ROLE_COLORS[a.role] || a.color; role.style.marginLeft = '6px';
      nm.appendChild(role);
      const st = document.createElement('span');
      const s = statusOf(a);
      st.className = 'st' + (s === 'Erreur' ? ' err' : (/Écrit|Lit|Lance|Planifie|marche|Orchestre/.test(s) ? ' busy' : ''));
      st.textContent = s + (a.tool && !a.done && a.id !== MAIN_ID ? ` · ${a.tool}` : '');
      div.append(sw, nm, st);
      div.addEventListener('mousedown', () => openInspector(a.id));
      li.appendChild(div);
      return li;
    };
    const root = node(main);
    const ul = document.createElement('ul'); ul.className = 'children';
    // sous-agents imbriqués (parentId) si présents
    const byParent = new Map();
    subs.forEach(s => { const pid = agents.has(s.parentId) ? s.parentId : MAIN_ID; if (!byParent.has(pid)) byParent.set(pid, []); byParent.get(pid).push(s); });
    const build = (pid, container) => {
      (byParent.get(pid) || []).forEach(s => {
        const li = node(s);
        if (byParent.has(s.id)) { const sub = document.createElement('ul'); sub.className = 'children'; build(s.id, sub); li.appendChild(sub); }
        container.appendChild(li);
      });
    };
    build(MAIN_ID, ul);
    if (!subs.length) { const e = document.createElement('li'); e.className = 'empty'; e.textContent = 'Aucun sous-agent pour le moment.'; ul.appendChild(e); }
    root.appendChild(ul);
    tree.replaceChildren(root);
    $('#empty-hint').classList.toggle('hidden', subs.length > 0 || main.bubbles.length > 0 || connection.demoRunning);
  }

  function updateCounters() {
    const active = [...agents.values()].filter(a => a.id !== MAIN_ID && !a.done && !a.gone).length;
    $('#c-agents').textContent = active;
    $('#c-tools').textContent = counters.tools;
    $('#c-events').textContent = counters.events;
  }

  const logEl = $('#log');
  function log(agent, kind, text, e, target) {
    addLogEntry({ t: e && e.timestamp ? e.timestamp : Date.now(), who: agent.name, color: agent.color, kind, tool: e && e.tool, text, target: target ? target.name : null, targetColor: target ? target.color : null });
  }
  function addLogEntry(entry) {
    const stick = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
    const li = document.createElement('li');
    if (entry.kind === 'ERR') li.className = 'err';
    const time = document.createElement('time'); time.textContent = fmtTime(entry.t);
    const body = document.createElement('div');
    const who = document.createElement('span'); who.className = 'who'; who.style.color = entry.color; who.textContent = entry.who;
    body.appendChild(who);
    if (entry.target) {
      const ar = document.createElement('span'); ar.className = 'arrow'; ar.textContent = ' → ';
      const tg = document.createElement('span'); tg.className = 'who'; tg.style.color = entry.targetColor; tg.textContent = entry.target;
      body.append(ar, tg);
    }
    const chip = document.createElement('span'); chip.className = `chip t-${entry.kind}`;
    chip.textContent = entry.kind === 'TOOL' && entry.tool ? entry.tool : entry.kind;
    const txt = document.createElement('span'); txt.className = 'txt'; txt.textContent = entry.text;
    body.append(chip, txt);
    li.append(time, body);
    logEl.appendChild(li);
    while (logEl.children.length > 400) logEl.firstChild.remove();
    if (stick) logEl.scrollTop = logEl.scrollHeight;
  }
  $('#btn-clear-log').addEventListener('click', () => logEl.replaceChildren());

  function openInspector(id) {
    selectedId = id;
    renderInspector();
    $('#inspector').classList.remove('hidden');
    treeDirty = true;
  }
  function closeInspector() {
    selectedId = null;
    $('#inspector').classList.add('hidden');
    treeDirty = true;
  }
  function renderInspector() {
    const a = agents.get(selectedId);
    if (!a) return closeInspector();
    $('#i-swatch').style.background = a.color; $('#i-swatch').style.color = a.color;
    $('#i-name').textContent = a.name;
    const role = $('#i-role'); role.textContent = a.role; role.style.color = ROLE_COLORS[a.role] || a.color;
    $('#i-status').textContent = `${statusOf(a)} · depuis ${fmtTime(a.spawnedAt)}`;
    $('#i-prompt').textContent = a.id === MAIN_ID
      ? `Orchestrateur principal. ${[...agents.values()].filter(x => x.id !== MAIN_ID).length} sous-agent(s) dans la chambre.`
      : (a.prompt || a.task || '(aucun prompt transmis)');
    const files = $('#i-files');
    files.replaceChildren();
    $('#i-files-count').textContent = a.files.size ? `(${a.files.size})` : '';
    if (!a.files.size) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'aucun pour le moment'; files.appendChild(li); }
    [...a.files].slice(-40).forEach(f => { const li = document.createElement('li'); li.textContent = f; files.appendChild(li); });
    const hist = $('#i-history');
    hist.replaceChildren();
    a.history.slice(-60).reverse().forEach(h => {
      const li = document.createElement('li');
      const tm = document.createElement('time'); tm.textContent = fmtTime(h.t);
      const tx = document.createElement('span');
      tx.textContent = (h.tool ? `[${h.tool}] ` : '') + h.text;
      li.append(tm, tx);
      hist.appendChild(li);
    });
  }
  $('#i-close').addEventListener('click', closeInspector);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeInspector(); });

  function agentAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const wx = ((clientX - r.left) / r.width) * W;
    const wy = ((clientY - r.top) / r.height) * H;
    let best = null, bd = Infinity;
    for (const a of agents.values()) {
      if (a.alpha < 0.3) continue;
      const top = a.y - 20, bottom = a.y + 3;
      if (wx >= a.x - 7 && wx <= a.x + 7 && wy >= top && wy <= bottom) {
        const d = Math.abs(wy - (a.y - 8));
        if (d < bd) { bd = d; best = a; }
      }
    }
    return best;
  }
  canvas.addEventListener('click', e => {
    const a = agentAt(e.clientX, e.clientY);
    if (a) openInspector(a.id); else closeInspector();
  });
  canvas.addEventListener('mousemove', e => {
    const a = agentAt(e.clientX, e.clientY);
    const id = a ? a.id : null;
    if (id !== hoverId) { hoverId = id; canvas.classList.toggle('hovering', !!a); }
  });

  /* ================================================================
   * Connexion temps réel (WebSocket) + mode démo local
   * ================================================================ */
  const connection = { ws: null, live: false, retry: 0, demoRunning: false, demoTimers: [] };
  const statusEl = $('#status');
  function setStatus(kind) {
    statusEl.className = `status status--${kind}`;
    statusEl.querySelector('.label').textContent =
      kind === 'live' ? '🟢 Connecté en direct' : kind === 'demo' ? '🟠 Mode Démo' : 'Connexion…';
  }

  function connect() {
    if (location.protocol === 'file:') { setStatus('demo'); return; }
    let ws;
    try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); }
    catch { setStatus('demo'); return; }
    connection.ws = ws;
    ws.onopen = () => {
      connection.live = true; connection.retry = 0;
      stopLocalDemo();
      setStatus('live');
    };
    ws.onmessage = msg => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.kind === 'hello') replayHistory(data.history || []);
      else if (data.kind === 'event') handleEvent(data.event);
    };
    ws.onclose = () => {
      connection.live = false;
      setStatus('demo');
      const delay = Math.min(5000, 800 * 2 ** connection.retry++);
      setTimeout(connect, delay);
    };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }

  function replayHistory(history) {
    replaying = true;
    resetRoom(false);
    logEl.replaceChildren();
    for (const e of history) handleEvent(e);
    for (const a of [...agents.values()]) if (a.id !== MAIN_ID) fastForward(a);
    replaying = false;
    counters.events = history.length;
    updateCounters();
    if (history.length) addLogEntry({ t: Date.now(), who: 'Système', color: '#ffb86b', kind: 'SYS', text: `${history.length} événement(s) récents rejoués.` });
  }

  function emitLocal(ev) { handleEvent({ timestamp: Date.now(), ...ev }); }
  async function send(ev) {
    if (connection.live) {
      try {
        const r = await fetch('/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) });
        if (r.ok) return;
      } catch { /* bascule en local */ }
    }
    emitLocal(ev);
  }

  function stopLocalDemo() {
    connection.demoTimers.forEach(clearTimeout);
    connection.demoTimers = [];
    connection.demoRunning = false;
  }
  function runLocalDemo() {
    stopLocalDemo();
    resetRoom(true);
    connection.demoRunning = true;
    const sc = window.DEMO_SCENARIO;
    sc.steps.forEach(({ at, ...ev }) => connection.demoTimers.push(setTimeout(() => emitLocal(ev), at)));
    connection.demoTimers.push(setTimeout(() => { connection.demoRunning = false; treeDirty = true; }, sc.durationMs));
  }

  $('#btn-demo').addEventListener('click', async () => {
    if (connection.live) {
      try { const r = await fetch('/api/demo', { method: 'POST' }); if (r.ok) return; } catch { /* local */ }
    }
    runLocalDemo();
  });

  let testCount = 0;
  const TEST_AGENTS = [
    { role: 'Researcher', name: 'Scout', task: 'explorer les dépendances obsolètes', tools: [['Glob', 'package*.json'], ['Read', 'package.json']] },
    { role: 'Coder', name: 'Pixel', task: 'refactorer le composant Navbar', tools: [['Read', 'src/components/Navbar.tsx'], ['Edit', 'src/components/Navbar.tsx']] },
    { role: 'Tester', name: 'Probe', task: 'lancer la suite de tests e2e', tools: [['Bash', 'npm run test:e2e']] },
    { role: 'Architect', name: 'Blueprint', task: 'découper le monolithe en modules', tools: [['TodoWrite', '']] },
    { role: 'Reviewer', name: 'Lynx', task: 'relire la PR #42', tools: [['Grep', 'TODO|FIXME'], ['Read', 'src/api/routes.ts']] },
    { role: 'Debugger', name: 'Patch', task: 'traquer la fuite mémoire du worker', tools: [['Bash', 'node --inspect worker.js'], ['Edit', 'src/worker.ts']] }
  ];
  $('#btn-spawn').addEventListener('click', () => {
    const base = TEST_AGENTS[testCount % TEST_AGENTS.length];
    const id = `test-${Date.now().toString(36)}`;
    const name = `${base.name}${testCount >= TEST_AGENTS.length ? '-' + (Math.floor(testCount / TEST_AGENTS.length) + 1) : ''}`;
    testCount++;
    send({ type: 'SUBAGENT_SPAWN', agentId: id, parentId: MAIN_ID, role: base.role, name, message: base.task, prompt: `Mission de test : ${base.task}.` });
    let at = 4200;
    base.tools.forEach(([tool, file]) => {
      setTimeout(() => send({ type: 'TOOL_START', agentId: id, tool, file: /\.\w+$/.test(file) ? file : undefined, message: file ? `${tool} ${file}` : `${tool}…` }), at);
      at += 4200;
      if (tool === 'Bash') setTimeout(() => send({ type: 'TOOL_END', agentId: id, tool, success: Math.random() > 0.3, message: 'commande terminée' }), at - 1200);
    });
    setTimeout(() => send({ type: 'SUBAGENT_COMPLETE', agentId: id, message: `Fini : ${base.task}.` }), at + 1500);
  });

  $('#btn-reset').addEventListener('click', async () => {
    stopLocalDemo();
    if (connection.live) { try { await fetch('/api/reset', { method: 'POST' }); return; } catch { /* local */ } }
    resetRoom(true);
  });

  /* ================================================================
   * Démarrage
   * ================================================================ */
  function start() {
    resize();
    drawStaticBackground();
    getMain();
    colorIndex = 1;
    updateCounters();
    setStatus('connecting');
    connect();
    // Sans serveur (fichier ouvert directement), la démo locale démarre seule.
    setTimeout(() => { if (!connection.live && !connection.demoRunning && agents.size <= 1) runLocalDemo(); }, 2500);
    requestAnimationFrame(frame);
  }

  const fontsReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load(`16px ${FONT}`), new Promise(r => setTimeout(r, 1200))])
    : Promise.resolve();
  fontsReady.then(start, start);

  // Accès console pour expérimenter : roomDebug.emit({...})
  window.roomDebug = { emit: emitLocal, agents, stations: STATIONS, findPath };
})();
