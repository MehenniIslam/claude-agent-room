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
  const W = 320, H = 208;           // plan logique (pathfinding, postes)
  const IW = 264, IH = 184;         // tampon de rendu isométrique
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
  const RETIRE_DELAY = 4500;        // ms au canapé avant d'être retiré (mode pompe)
  const EXEC_LINES = [
    'Merci pour tes services, {name}.', '{name}, ton contexte est clos.', 'Fin de mission, {name}. Adieu.',
    "On n'a plus besoin de toi, {name} !", '{name}, tu as bien travaillé. Désolé.'
  ];
  const GHOST_LINES = [
    'Adieu monde cruel…', "J'avais encore des tokens…", 'Au moins mes tests passent.',
    'Je reviendrai… en sous-agent.', 'Pensez à commit mon travail !'
  ];

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
  buf.width = IW; buf.height = IH;
  const g = buf.getContext('2d');
  const bg = document.createElement('canvas');
  bg.width = IW; bg.height = IH;
  const bgx = bg.getContext('2d');
  let S = 3;          // pixels écran (device) par pixel du tampon
  let DPR = 1;

  function resize() {
    const stage = $('#stage');
    DPR = window.devicePixelRatio || 1;
    const availW = (stage.clientWidth - 28) * DPR;
    const availH = (stage.clientHeight - 28) * DPR;
    // Facteur entier (pixels nets) ; sur petit écran, on dessine au facteur supérieur puis on ajuste à la place disponible.
    const fit = Math.max(0.5, Math.min(availW / IW, availH / IH));
    S = Math.max(1, fit >= 2 ? Math.floor(fit) : Math.ceil(fit));
    canvas.width = IW * S;
    canvas.height = IH * S;
    const shown = fit >= 2 ? S : fit;
    canvas.style.width = `${(IW * shown) / DPR}px`;
    canvas.style.height = `${(IH * shown) / DPR}px`;
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
  let endingMode = 'pompe';
  const execQueue = [];
  let exec = null;
  let execCooldown = 0;
  let shakeUntil = 0;
  const comicTexts = [];
  const fileIndex = new Map();      // chemin -> { path, kind: 'w'|'e'|'r', count, agentId, t }
  let filesDirty = true;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FILE_KIND = { Write: 'w', NotebookEdit: 'e', Edit: 'e', MultiEdit: 'e' };
  // Bornes pour les gros projets et les longues sessions : la mémoire et le DOM ne grossissent jamais sans fin.
  const MAX_FILES = 500;            // fichiers suivis dans l'onglet Fichiers
  const MAX_AGENT_FILES = 100;      // fichiers retenus par agent (fiche)
  const MAX_AGENTS = 40;            // personnages dans la chambre ; au-delà, les plus vieux terminés s'en vont
  const MAX_EXEC_QUEUE = 4;         // retraites à la pompe en attente
  let inspectorDirty = false;

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
    if (a && (a.gone || a.dying)) { forgetAgent(a); a = null; }
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
  function forgetAgent(a) {
    releaseSpot(a);
    agents.delete(a.id);
    const qi = execQueue.indexOf(a.id);
    if (qi >= 0) execQueue.splice(qi, 1);
    if (exec && exec.id === a.id) exec = null;
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
    // Les chemins repérés dans le message qui ne sont qu'un bout de e.file ne comptent pas en double.
    const files = new Set([e.file, ...extractFiles(e.message).filter(f => !e.file || !String(e.file).endsWith(f))].filter(Boolean));
    files.forEach(f => {
      agent.files.delete(f); agent.files.add(f); // le plus récent en dernier
      if (agent.files.size > MAX_AGENT_FILES) agent.files.delete(agent.files.values().next().value);
    });
    if (e.type === 'TOOL_START') {
      for (const f of files) {
        if (/[\\/]$/.test(f)) continue; // dossier, pas un fichier
        const kind = FILE_KIND[e.tool] || 'r';
        const prev = fileIndex.get(f);
        // Un fichier écrit ou modifié garde ce statut même s'il est relu ensuite.
        const keep = prev && kind === 'r' && prev.kind !== 'r';
        fileIndex.set(f, {
          path: f, count: (prev ? prev.count : 0) + 1, t: e.timestamp || Date.now(),
          kind: keep ? prev.kind : (prev && prev.kind === 'w' && kind === 'e' ? 'w' : kind),
          agentId: keep ? prev.agentId : agent.id
        });
        filesDirty = true;
      }
      if (fileIndex.size > MAX_FILES) trimFiles();
    }
    if (selectedId === agent.id) inspectorDirty = true; // redessinée une fois par image, pas à chaque événement
  }

  // Évince d'abord les fichiers seulement lus, puis les plus anciens.
  function trimFiles() {
    const sorted = [...fileIndex.values()].sort((a, b) => (b.kind === 'r') - (a.kind === 'r') || a.t - b.t);
    for (const f of sorted.slice(0, fileIndex.size - MAX_FILES)) fileIndex.delete(f.path);
  }

  function trimRoom() {
    if (agents.size <= MAX_AGENTS) return;
    const idle = [...agents.values()]
      .filter(a => a.id !== MAIN_ID && a.done && !a.dying && !a.gone && a.id !== selectedId)
      .sort((a, b) => a.spawnedAt - b.spawnedAt);
    for (const a of idle.slice(0, agents.size - MAX_AGENTS)) { a.gone = true; releaseSpot(a); }
    treeDirty = true;
  }

  function handleEvent(raw) {
    const e = { ...raw };
    e.type = String(e.type || '').toUpperCase();
    e.agentId = e.agentId || MAIN_ID;
    e.timestamp = e.timestamp || Date.now();
    counters.events++;
    if (e.source === 'claude-code' && !claudeSeen) { claudeSeen = true; updateSource(); }
    const main = getMain();

    switch (e.type) {
      case 'RESET': return resetRoom(true);

      case 'SUBAGENT_SPAWN': {
        let a = agents.get(e.agentId);
        if (a && (a.gone || a.dying)) { forgetAgent(a); a = null; }
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
        a.retireAt = 0;
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
            if (endingMode === 'pompe') pushQueue(x, [goStation(x, 'lounge'), { k: 'do', fn: y => { y.retireAt = now() + RETIRE_DELAY; } }]);
            else if (loungeFull()) pushQueue(x, [{ k: 'despawn' }]);
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
    if (endingMode === 'pompe' && agent.done) forgetAgent(agent);
  }

  function resetRoom(announce) {
    for (const [id] of agents) if (id !== MAIN_ID) agents.delete(id);
    for (const st of Object.values(STATIONS)) st.occ.fill(null);
    particles.length = 0; glyphs.length = 0; beams.length = 0; folders.length = 0; whiteboard.length = 0;
    execQueue.length = 0; exec = null; comicTexts.length = 0;
    benchLamps.forEach(l => { l.state = 'idle'; l.until = 0; });
    counters.tools = 0; counters.events = 0;
    deskPile = 0; colorIndex = 1;
    fileIndex.clear(); filesDirty = true;
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
      if (a.dying) { updateBubbles(a, t, dt); continue; }
      if (a.alpha < 1 && t - a.bornAt > 500) a.alpha = Math.min(1, a.alpha + dt * 2);
      runQueue(a, t);
      if (endingMode === 'pompe' && a.retireAt && t > a.retireAt && !a.path.length && !a.queue.length && !a.locked) {
        a.retireAt = 0; a.dying = true; execQueue.push(a.id); treeDirty = true; updateCounters();
      }

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
        glyphs.push({ x: d.x + 18 + rnd(-6, 6), y: d.y - 9, vy: rnd(-12, -7), life: 0, max: rnd(1, 1.6), text: pick(world.glyphs), color: a.color });
      }
      if (!a.path.length && a.activity === 'planning' && Math.random() < dt * 0.8) addStroke(a);
      updateBubbles(a, t, dt);
    }

    for (const l of benchLamps) if (l.state !== 'idle' && t > l.until) l.state = 'idle';
    updateExecution(t);
    for (let i = comicTexts.length - 1; i >= 0; i--) if (t - comicTexts[i].t0 > comicTexts[i].dur) comicTexts.splice(i, 1);

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

  /* ================================================================
   * Retraite à la pompe
   * ================================================================ */
  const GUN_HAND = { x: 165, y: 88 };
  const EXEC = { pump: 700, fire: 1300, ghost: 2300, end: 4400 };

  function updateExecution(t) {
    // Beaucoup d'agents terminés d'un coup : les plus anciens s'effacent au lieu d'attendre leur tour.
    while (execQueue.length > MAX_EXEC_QUEUE) {
      const old = agents.get(execQueue.shift());
      if (old) { old.gone = true; old.dying = false; releaseSpot(old); treeDirty = true; }
    }
    if (!exec) {
      if (execQueue.length && t > execCooldown) {
        const id = execQueue.shift();
        const a = agents.get(id);
        if (!a) return;
        exec = { id, t0: t, pumped: false, fired: false, ghosted: false };
        say(getMain(), pick(EXEC_LINES).replace('{name}', a.name));
      }
      return;
    }
    const a = agents.get(exec.id);
    if (!a) { exec = null; return; }
    const el = t - exec.t0;
    const main = getMain();
    main.face = a.y < main.y ? 'up' : Math.abs(a.x - main.x) > 30 ? (a.x > main.x ? 'right' : 'left') : 'down';
    if (!exec.pumped && el > EXEC.pump) {
      exec.pumped = true;
      comicTexts.push({ text: 'CLIC-CLAC', x: 160, y: 66, t0: t, dur: 650, size: 2.4, fill: '#f1fa8c', stroke: '#2a1a10' });
    }
    if (!exec.fired && el > EXEC.fire) {
      exec.fired = true;
      const dx = a.x - GUN_HAND.x, dy = (a.y - 8) - GUN_HAND.y, d = Math.hypot(dx, dy) || 1;
      a.hitAt = t;
      a.knock = { dx: dx / d, dy: dy / d };
      a.bubbles = [];
      shakeUntil = t + 280;
      comicTexts.push({ text: 'BANG !', x: (GUN_HAND.x + a.x) / 2, y: Math.min(GUN_HAND.y, a.y) - 22, t0: t, dur: 900, size: 5, fill: '#ffd23f', stroke: '#c0392b' });
      burst(a.x, a.y - 8, a.color, 16);
      burst(a.x, a.y - 8, '#ffffff', 10);
      const tip = gunTip(a, 0);
      for (let i = 0; i < 8; i++) particles.push({ x: tip.x, y: tip.y, vx: rnd(-6, 6), vy: rnd(-18, -6), life: 0, max: rnd(0.8, 1.4), color: 'rgba(200,200,210,0.8)', size: 2, grav: 0 });
      record(a, { timestamp: Date.now(), type: 'RETIRE' }, 'Retiré du service à la pompe');
    }
    if (exec.fired && !exec.landed && el > EXEC.fire + 380) {
      exec.landed = true;
      const pos = deadPos(a, t);
      comicTexts.push({ text: 'K.O.', x: pos.x, y: pos.y - 10, t0: t, dur: 900, size: 2.6, fill: '#ffffff', stroke: '#2a1a10' });
    }
    if (!exec.ghosted && el > EXEC.ghost) {
      exec.ghosted = true;
      say(a, pick(GHOST_LINES));
    }
    if (el > EXEC.end) {
      log(a, 'ERR', '💥 retiré du service à la pompe', { timestamp: Date.now() });
      if (selectedId === a.id) closeInspector();
      forgetAgent(a);
      main.face = 'down';
      exec = null;
      execCooldown = t + 350;
      treeDirty = true;
      updateCounters();
    }
  }

  function gunDir(a) {
    const dx = a.x - GUN_HAND.x, dy = (a.y - 8) - GUN_HAND.y, d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }
  function gunTip(a, back) {
    const d = gunDir(a);
    return { x: GUN_HAND.x + d.x * (14 - back), y: GUN_HAND.y + d.y * (14 - back) };
  }
  function deadPos(a, t) {
    const kt = (t - a.hitAt) / 1000;
    const e = Math.min(1, kt / 0.35), ease = 1 - (1 - e) * (1 - e);
    return { x: a.x + a.knock.dx * 8 * ease, y: a.y + a.knock.dy * 5 * ease - Math.sin(e * Math.PI) * 7, e, kt };
  }

  /* ---------- Pompe : rendu à l'écran (la logique ci-dessus reste en coordonnées du plan) ---------- */
  function gunScreen(a) {
    const m = getMain();
    const hs = P(m.x, m.y), vs = P(a.x, a.y);
    const h = { x: hs.x + 5, y: hs.y - 11 }, v = { x: vs.x, y: vs.y - 11 };
    const dx = v.x - h.x, dy = v.y - h.y, d = Math.hypot(dx, dy) || 1;
    return { h, v, x: dx / d, y: dy / d };
  }
  function drawShotgun(t) {
    if (!exec) return;
    const a = agents.get(exec.id);
    if (!a) return;
    const el = t - exec.t0;
    if (el > EXEC.ghost) return;
    const { h, x: ux, y: uy } = gunScreen(a);
    const perp = { x: -uy, y: ux };
    const raise = Math.min(1, el / 400);
    const recoil = exec.fired && el - EXEC.fire < 140 ? 2 : 0;
    const pump = el > EXEC.pump && el < EXEC.pump + 360 ? Math.round(Math.sin((el - EXEC.pump) / 360 * Math.PI) * 2.5) : 0;
    const dot = (s, off, col) => R(g, h.x + ux * (s - recoil) + perp.x * off, h.y + uy * (s - recoil) + perp.y * off, 1, 1, col);
    const len = Math.round(14 * raise);
    for (let s = -5; s < 0; s++) { dot(s, 0, '#6b4226'); dot(s, 1, '#8a5a32'); if (s < -2) dot(s, 2, '#6b4226'); }
    for (let s = 0; s <= len; s++) { dot(s, 0, '#5b6070'); if (s < len - 1) dot(s, 1, '#3c404c'); }
    if (len > 8) for (let s = 4 - pump; s <= 8 - pump; s++) { dot(s, 1, '#4a3020'); dot(s, 2, '#4a3020'); }
    dot(len, 0, '#8a91a3');
  }

  function drawShotFx(t) {
    if (!exec || !exec.fired) return;
    const a = agents.get(exec.id);
    if (!a) return;
    const since = t - exec.t0 - EXEC.fire;
    const { h, v, x: ux, y: uy } = gunScreen(a);
    const tip = { x: Math.round(h.x + ux * 14), y: Math.round(h.y + uy * 14) };
    if (since < 130) {
      R(g, tip.x - 3, tip.y, 7, 1, '#ffd23f'); R(g, tip.x, tip.y - 3, 1, 7, '#ffd23f');
      R(g, tip.x - 2, tip.y - 2, 5, 5, '#ffb347'); R(g, tip.x - 1, tip.y - 1, 3, 3, '#ffffff');
      g.save(); g.globalCompositeOperation = 'lighter'; glow(tip.x, tip.y, 18, '#ffd23f', 0.5); g.restore();
    }
    if (since < 220) {
      const alpha = 1 - since / 220;
      const base = Math.atan2(v.y - tip.y, v.x - tip.x);
      const dist = Math.hypot(v.x - tip.x, v.y - tip.y);
      for (const spread of [-0.07, 0, 0.07]) {
        for (let r = 0; r < dist; r += 3) {
          g.fillStyle = `rgba(255,${200 + Math.round(r) % 55},120,${alpha * (1 - r / dist * 0.4)})`;
          g.fillRect(Math.round(tip.x + Math.cos(base + spread) * r), Math.round(tip.y + Math.sin(base + spread) * r), 1, 1);
        }
      }
    }
  }

  // Agent touché : glisse au sol avec un petit saut, puis s'envole en fantôme.
  function deadScreen(a, t) {
    const kt = (t - a.hitAt) / 1000;
    const e = Math.min(1, kt / 0.35), ease = 1 - (1 - e) * (1 - e);
    const s = P(a.x + a.knock.dx * 8 * ease, a.y + a.knock.dy * 8 * ease);
    return { gx: s.x, gy: s.y, x: s.x, y: s.y - Math.sin(e * Math.PI) * 7, e, kt };
  }
  function drawDeadAgent(a, t) {
    const pos = deadScreen(a, t);
    const { e, kt } = pos;
    const bodyAlpha = kt < 1.0 ? 1 : Math.max(0, 1 - (kt - 1.0) / 1.8);
    const side = a.knock.dx >= 0 ? 1 : -1;
    if (bodyAlpha > 0) {
      g.save();
      g.globalAlpha = bodyAlpha;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(Math.round(pos.gx) - 9, Math.round(pos.gy) - 1, 18, 2);
      g.translate(Math.round(pos.x), Math.round(pos.y) - 8);
      g.rotate(side * (Math.PI / 2) * e);
      const clone = { ...a, id: '__dead', path: [], pose: 'stand', alpha: 1, errorUntil: 0, carrying: false, activity: 'done', face: 'down', hitAt: 0 };
      drawSprite(clone, 0, 8, t);
      if (kt < 0.12) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(-5, -14, 11, 22); }
      g.restore();
      if (e >= 1 && kt < 1.8) {
        for (let i = 0; i < 3; i++) {
          const ang = t / 180 + i * 2.1;
          R(g, pos.x + Math.cos(ang) * 7, pos.y - 12 + Math.sin(ang) * 2, 1, 1, '#ffd23f');
        }
      }
    }
    if (kt > 1.0) {
      const gk = kt - 1.0;
      const gx = Math.round(pos.x + Math.sin(gk * 4) * 3), gy = Math.round(pos.y - 8 - gk * 24);
      g.save();
      g.globalAlpha = Math.max(0, Math.min(0.9, 2.6 - gk));
      R(g, gx - 3, gy - 11, 7, 1, '#f4f4ff'); R(g, gx - 4, gy - 10, 9, 9, '#f4f4ff');
      const wv = Math.floor(t / 150) % 2;
      for (let k = 0; k < 9; k += 2) R(g, gx - 4 + k + wv, gy - 1, 1, 1, '#f4f4ff');
      R(g, gx - 2, gy - 7, 1, 2, '#2a2238'); R(g, gx + 2, gy - 7, 1, 2, '#2a2238'); R(g, gx, gy - 4, 1, 1, '#2a2238');
      R(g, gx - 3, gy - 5, 1, 1, rgba(a.color, 0.9)); R(g, gx + 3, gy - 5, 1, 1, rgba(a.color, 0.9));
      R(g, gx - 3, gy - 14, 7, 1, '#ffd23f'); R(g, gx - 4, gy - 13, 1, 1, '#ffd23f'); R(g, gx + 4, gy - 13, 1, 1, '#ffd23f');
      g.restore();
      a.ghostScr = { x: gx, y: gy };
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
   * Rendu isométrique
   *
   * La logique reste en « plan » 320×208 : x = largeur, y = profondeur,
   * mur du fond en y = 40. Le rendu projette ce plan en vue isométrique 2:1
   * sur un tampon IW×IH, agrandi d'un facteur entier sans lissage.
   *   - la coque (sol + murs) est calculée pixel par pixel, une fois par monde ;
   *   - chaque meuble est pré-rendu dans une petite image (découpée en tranches
   *     pour que les personnages passent devant ou derrière) ;
   *   - à chaque image : fond + meubles et personnages triés par profondeur.
   * ================================================================ */
  const ISO_OX = 92, ISO_OY = 52, WALL_H = 46, FLOOR_Y = 40, DEPTH = H - FLOOR_Y;

  // Point du plan (x, y) à la hauteur z → pixel du tampon.
  function P(x, y, z = 0) {
    const d = y - FLOOR_Y;
    return { x: ISO_OX + (x - d) / 2, y: ISO_OY + (x + d) / 4 - z };
  }
  // Comme P, mais un point au-dessus du sol (y < 40) reste à la verticale du mur.
  function toScreen(x, y) {
    if (y >= FLOOR_Y) return P(x, y);
    const p = P(x, FLOOR_Y);
    return { x: p.x, y: p.y - (FLOOR_Y - y) };
  }
  function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixRgb(c, amt) { const t = amt < 0 ? 0 : 255, p = Math.abs(amt); return c.map(v => Math.round((t - v) * p + v)); }

  /* ---------- Primitives (colonnes de pixels : bords nets, aucun flou) ---------- */
  // Rectangle peint sur un plan vertical orienté vers le sud (y fixe) : x..x+w, hauteur z..z+h.
  function planeS(c, x, y, w, z, h, col) {
    c.fillStyle = col;
    for (let i = 0; i < w; i += 2) { const p = P(x + i, y, z + h); c.fillRect(Math.floor(p.x), Math.round(p.y), 1, h); }
  }
  // Même chose sur un plan orienté vers l'est (x fixe) : y..y+dep.
  function planeE(c, x, y, dep, z, h, col) {
    c.fillStyle = col;
    for (let j = 0; j < dep; j += 2) { const p = P(x, y + j, z + h); c.fillRect(Math.floor(p.x), Math.round(p.y), 1, h); }
  }
  // Boîte pleine posée en z : dessus, face sud (cols.left), face est (cols.right), arête avant éclairée.
  function isoBox(c, x, y, w, dep, h, cols, z = 0) {
    const d0 = y - FLOOR_Y, d1 = d0 + dep, x1 = x + w;
    const sxMin = Math.floor(ISO_OX + (x - d1) / 2), sxMax = Math.ceil(ISO_OX + (x1 - d0) / 2);
    for (let sx = sxMin; sx < sxMax; sx++) {
      const k = 2 * (sx + 0.5 - ISO_OX);           // x - d au centre de la colonne
      const xa = Math.max(x, d0 + k), xb = Math.min(x1, d1 + k);
      if (xa > xb) continue;
      const yBack = Math.round(ISO_OY + (2 * xa - k) / 4 - h - z);
      const yFront = Math.round(ISO_OY + (2 * xb - k) / 4 - h - z);
      c.fillStyle = cols.top;
      c.fillRect(sx, yBack, 1, Math.max(1, yFront - yBack));
      if (cols.edge) { c.fillStyle = cols.edge; c.fillRect(sx, yFront - 1, 1, 1); }
      c.fillStyle = d1 + k < x1 ? cols.left : cols.right;
      c.fillRect(sx, yFront, 1, h);
    }
  }
  function boxBounds(x, y, w, dep, h, z = 0) {
    const pts = [P(x, y, z), P(x + w, y, z), P(x, y + dep, z), P(x + w, y + dep, z)];
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { x0: Math.floor(Math.min(...xs)) - 1, x1: Math.ceil(Math.max(...xs)) + 1, y0: Math.floor(Math.min(...ys) - h) - 1, y1: Math.ceil(Math.max(...ys)) + 1 };
  }
  const cols3 = (top, left, right, edge) => ({ top, left, right, edge });

  /* ---------- Coque de la pièce (sol + 2 murs), pixel par pixel ---------- */
  function paintShell(c, pal) {
    const img = c.createImageData(IW, IH);
    const D = img.data;
    const fa = hexRgb(pal.floorA), fb = hexRgb(pal.floorB), gr = hexRgb(pal.grout);
    const wb = hexRgb(pal.wallBack), wl = hexRgb(pal.wallLeft), tr = hexRgb(pal.trim), ba = hexRgb(pal.base), out = hexRgb(pal.bg);
    const rand = seeded(7);
    for (let sy = 0; sy < IH; sy++) for (let sx = 0; sx < IW; sx++) {
      const k = 2 * (sx + 0.5 - ISO_OX);              // x - d
      const m = 4 * (sy + 0.5 - ISO_OY);              // x + d
      const x = (k + m) / 2, d = (m - k) / 2;
      let col = out;
      if (x >= 0 && x < W && d >= 0 && d < DEPTH) {
        const tile = (Math.floor(x / 16) + Math.floor(d / 16)) & 1;
        col = (x % 16 < 1.2 || d % 16 < 1.2) ? gr : (tile ? fa : fb);
        if (pal.grain && rand() < pal.grain) col = mixRgb(col, rand() < 0.5 ? -0.08 : 0.06);
        const ao = Math.min(x, d);                    // ombre portée au pied des murs
        if (ao < 8) col = mixRgb(col, -0.32 * (1 - ao / 8));
      } else if (k >= 0 && k <= W) {                  // mur du fond (d = 0)
        const z = ISO_OY + k / 4 - (sy + 0.5);
        if (z >= 0 && z <= WALL_H + 2) col = z > WALL_H ? mixRgb(tr, 0.2) : z > WALL_H - 3 ? tr : z < 3 ? ba : mixRgb(wb, (z / WALL_H) * 0.08);
      } else if (k < 0 && -k <= DEPTH) {              // mur de gauche (x = 0)
        const z = ISO_OY - k / 4 - (sy + 0.5);
        if (z >= 0 && z <= WALL_H + 2) col = z > WALL_H ? mixRgb(tr, 0.05) : z > WALL_H - 3 ? mixRgb(tr, -0.15) : z < 3 ? mixRgb(ba, -0.1) : mixRgb(wl, (z / WALL_H) * 0.06);
      }
      const o = (sy * IW + sx) * 4;
      D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    // arête verticale du coin
    const top = P(0, FLOOR_Y, WALL_H);
    c.fillStyle = shade(pal.trim, -0.35); c.fillRect(Math.floor(top.x), Math.round(top.y), 1, WALL_H);
  }

  /* ---------- Éléments muraux et mobilier contre les murs (statiques) ---------- */
  function paintWallItems(c, pal) {
    const rand = seeded(11);
    // fenêtre
    planeS(c, 118, FLOOR_Y, 74, 16, 26, pal.windowFrame || shade(pal.wallBack, -0.35));
    planeS(c, 122, FLOOR_Y, 66, 18, 22, pal.sky);
    if (pal.day) {
      for (const [cx, cz] of [[132, 34], [168, 30]]) { planeS(c, cx, FLOOR_Y, 14, cz, 3, '#ffffff'); planeS(c, cx + 4, FLOOR_Y, 8, cz + 3, 2, '#ffffff'); }
    } else {
      planeS(c, 170, FLOOR_Y, 6, 32, 5, '#fff6c8');
    }
    planeS(c, 154, FLOOR_Y, 2, 18, 22, pal.windowFrame || shade(pal.wallBack, -0.35));
    planeS(c, 122, FLOOR_Y, 66, 28, 1, pal.windowFrame || shade(pal.wallBack, -0.35));
    planeS(c, 116, FLOOR_Y, 78, 15, 2, shade(pal.trim, -0.1));
    // tableau / partition / plan
    planeS(c, 16, FLOOR_Y, 76, 12, 28, pal.boardFrame);
    planeS(c, 19, FLOOR_Y, 70, 14, 24, pal.board);
    planeS(c, 26, FLOOR_Y, 56, 10, 2, shade(pal.boardFrame, -0.2)); // rebord
    // horloge
    planeS(c, 202, FLOOR_Y, 10, 30, 8, '#1b1528'); planeS(c, 203, FLOOR_Y, 8, 31, 6, '#efe6d2');
    // bibliothèque (ou serre, orgue…) : caisson + objets sur 3 étagères
    const sh = cols3(shade(pal.shelf, 0.12), pal.shelf, pal.shelfSide || shade(pal.shelf, -0.25));
    isoBox(c, 220, FLOOR_Y, 80, 8, 36, sh);
    for (let r = 0; r < 3; r++) {
      planeS(c, 222, FLOOR_Y + 8, 76, 3 + r * 11, 9, shade(pal.shelf, -0.45));
      for (let i = 0; i < 38; i++) {
        if (rand() < 0.12) continue;
        const hgt = 5 + Math.floor(rand() * 4);
        planeS(c, 222 + i * 2, FLOOR_Y + 8, 2, 3 + r * 11, hgt, pal.items[Math.floor(rand() * pal.items.length)]);
      }
    }
    // baie de serveurs / colonne décorative
    isoBox(c, 302, FLOOR_Y, 16, 8, 40, cols3(pal.metal, pal.metalDark, shade(pal.metalDark, -0.25)));
    for (let r = 0; r < 6; r++) planeS(c, 304, FLOOR_Y + 8, 12, 4 + r * 6, 1, shade(pal.metalDark, -0.4));
    // grande plante
    isoBox(c, 108, FLOOR_Y + 1, 12, 8, 7, cols3('#3a2a20', '#7a4b2a', '#5a3820'));
    const pot = P(114, FLOOR_Y + 5, 7);
    const leaf = pal.leaf || '#3f8f4a';
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, rr = 2 + rand() * 7;
      c.fillStyle = rand() < 0.5 ? leaf : shade(leaf, 0.25);
      c.fillRect(Math.round(pot.x + Math.cos(a) * rr), Math.round(pot.y - 6 - Math.abs(Math.sin(a)) * rr * 1.2), 2, 2);
    }
    // tapis sous le bureau de Claude
    floorRect(c, 120, 84, 80, 40, pal.rug);
    floorRect(c, 122, 86, 76, 36, shade(pal.rug, 0.08));
  }
  // Rectangle peint au sol (tapis, chemin…).
  function floorRect(c, x, y, w, dep, col) {
    c.fillStyle = col;
    for (let j = 0; j < dep; j += 1) for (let i = 0; i < w; i += 2) {
      const p = P(x + i, y + j);
      c.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
    }
  }

  /* ---------- Mobilier trié avec les personnages ---------- */
  let furniture = [];
  function furnitureDefs(pal) {
    const wood = cols3(pal.wood, pal.woodSide, pal.woodDark, shade(pal.wood, 0.18));
    const metal = cols3(pal.metal, pal.metalDark, shade(pal.metalDark, -0.25));
    const sofa = cols3(shade(pal.sofa, 0.1), pal.sofa, shade(pal.sofa, -0.25));
    const seat = cols3(pal.seat || shade(pal.sofa, 0.2), shade(pal.sofa, -0.05), shade(pal.sofa, -0.3));
    const bench = cols3(pal.bench, pal.benchSide, shade(pal.benchSide, -0.25), shade(pal.bench, 0.15));
    const screenCols = cols3(pal.metal, pal.screen, pal.metalDark);
    return [
      // chaise de Claude (derrière lui), bureau en 4 tranches, écrans dos à nous
      { boxes: [[152, 84, 16, 4, 14, sofa]] },
      { boxes: [[130, 96, 60, 10, 9, wood], [133, 97, 12, 3, 10, metal, 9], [175, 97, 12, 3, 10, metal, 9]], slice: 15, id: 'master' },
      ...CODE_DESKS.map((d, i) => ({ boxes: [[d.x, d.y - 2, 36, 12, 8, wood], [d.x + 11, d.y - 1, 14, 3, 10, screenCols, 8]], id: 'desk', i })),
      { boxes: [[2, 148, 80, 20, 10, bench]], slice: 20, id: 'bench' },
      { boxes: [[2, 176, 12, 22, 26, metal]], id: 'tower' },
      { boxes: [[236, 128, 64, 6, 16, sofa], [230, 128, 6, 22, 11, sofa], [300, 128, 6, 22, 11, sofa]], slice: 16 },
      { boxes: [[236, 134, 64, 14, 6, seat]], slice: 16 },
      { boxes: [[252, 164, 32, 10, 6, wood]], id: 'table' },
      // comptoir bas + petite machine à café (bas de la pièce : rien de haut qui masque le salon)
      { boxes: [[290, 180, 26, 20, 9, wood], [297, 184, 12, 8, 11, metal, 9]], id: 'coffee' },
      { boxes: [[229, 143, 4, 4, 30, cols3(pal.lampShade || '#ffe2a8', '#3a3040', '#2a2030')]], id: 'lamp' },
      { boxes: [], id: 'cat', key: 216 + 180 }
    ];
  }
  // Découpe chaque meuble en tranches (tri correct) et pré-rend chaque tranche dans une petite image.
  function buildFurniture(pal) {
    furniture = [];
    for (const def of furnitureDefs(pal)) {
      if (!def.boxes.length) { furniture.push({ key: def.key, id: def.id, img: null, def }); continue; }
      const [mx, my, mw, md] = def.boxes[0];
      const step = def.slice || Math.max(mw, md);
      const slices = [];
      for (let sx = mx; sx < mx + mw; sx += step) for (let sy = my; sy < my + md; sy += step) {
        slices.push({ x: sx, y: sy, w: Math.min(step, mx + mw - sx), d: Math.min(step, my + md - sy) });
      }
      slices.forEach((sl, si) => {
        // la première boîte est découpée ; les suivantes (écrans, accoudoirs) vont dans la tranche qui contient leur centre
        const parts = [[sl.x, sl.y, sl.w, sl.d, def.boxes[0][4], def.boxes[0][5], def.boxes[0][6] || 0]];
        for (const b of def.boxes.slice(1)) {
          const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2;
          const inside = cx >= sl.x && cx < sl.x + sl.w && cy >= sl.y && cy < sl.y + sl.d;
          const fallback = si === slices.length - 1 && !slices.some(s => cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.d);
          if (inside || fallback) parts.push([b[0], b[1], b[2], b[3], b[4], b[5], b[6] || 0]);
        }
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (const p of parts) {
          const b = boxBounds(p[0], p[1], p[2], p[3], p[4] + p[6]);
          bx0 = Math.min(bx0, b.x0); by0 = Math.min(by0, b.y0); bx1 = Math.max(bx1, b.x1); by1 = Math.max(by1, b.y1);
        }
        const img = document.createElement('canvas');
        img.width = bx1 - bx0; img.height = by1 - by0;
        const c = img.getContext('2d');
        c.translate(-bx0, -by0);
        for (const p of parts) isoBox(c, p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
        const last = si === slices.length - 1;
        furniture.push({ key: sl.x + sl.w / 2 + sl.y + sl.d / 2, img, ox: bx0, oy: by0, id: last ? def.id : null, def });
      });
    }
    furniture.sort((a, b) => a.key - b.key);
  }

  // Détails animés posés sur les meubles (écrans, voyants, vapeur…).
  function drawFurnitureLife(f, t) {
    const def = f.def;
    if (f.id === 'desk') {
      const d = CODE_DESKS[def.i];
      const user = worldApi.codeUser(def.i);
      planeS(g, d.x + 12, d.y + 2, 12, 9, 7, user ? shade(pal.screen, 0.15) : pal.screen);
      if (user) for (let l = 0; l < 3; l++) {
        const len = 2 + ((l * 5 + Math.floor(t / 300)) % 5) * 2;
        planeS(g, d.x + 13, d.y + 2, len, 14 - l * 2, 1, l % 2 ? pal.screenOn : user.color);
      }
    } else if (f.id === 'master') {
      if (worldApi.mainActive() && Math.floor(t / 180) % 4) {
        for (const mx of [139, 181]) { const p = P(mx, 97, 20); R(g, p.x - 3, p.y - 1, 7, 1, rgba(pal.screenOn, 0.7)); }
      }
      for (let i = 0; i < deskPile; i++) { const p = P(184, 101, 9 + i); R(g, p.x - 3, p.y, 6, 1, i % 2 ? '#f4c95d' : '#ffe08a'); }
    } else if (f.id === 'bench') {
      [18, 42, 66].forEach((lx, i) => {
        const l = benchLamps[i];
        const col = l.state === 'run' ? (Math.floor(t / 200) % 2 ? '#ffb86b' : '#ff9f43') : l.state === 'ok' ? '#57f287' : l.state === 'fail' ? '#ff4d5e' : '#5a5f6e';
        const p = P(lx, 156, 10);
        R(g, p.x - 1, p.y - 6, 3, 6, shade(col, -0.25)); R(g, p.x - 1, p.y - 6, 3, 1, col); R(g, p.x, p.y - 5, 1, 4, col);
      });
      const sc = P(8, 150, 10);
      R(g, sc.x, sc.y - 7, 9, 6, '#20242e'); R(g, sc.x + 1, sc.y - 6, 7, 4, worldApi.benchRunning() ? '#1f4d2a' : '#1a2a20');
      if (worldApi.benchRunning()) for (let i = 0; i < 7; i++) R(g, sc.x + 1 + i, sc.y - 4 + Math.round(Math.sin(t / 120 + i) * 1.5), 1, 1, '#57f287');
    } else if (f.id === 'tower') {
      for (let r = 0; r < 5; r++) {
        const on = (Math.floor(t / (180 + r * 70)) + r) % 3;
        planeS(g, 4, 198, 2, 4 + r * 4, 1, on ? '#57f287' : '#1f3d28');
        planeS(g, 8, 198, 2, 4 + r * 4, 1, on === 1 ? '#ffb86b' : '#3d2a18');
      }
    } else if (f.id === 'coffee') {
      planeS(g, 299, 192, 8, 12, 5, '#20242e');
      planeS(g, 305, 192, 2, 18, 1, Math.floor(t / 900) % 2 ? '#ff4d5e' : '#7a1f28');
      const cup = P(302, 196, 9); R(g, cup.x, cup.y - 2, 2, 2, '#f2efe8');
      if (Math.floor(t / 2400) % 3 === 0) {
        const p = P(302, 194, 18);
        const ph = (t % 2400) / 2400;
        R(g, p.x + Math.round(Math.sin(ph * 12)), p.y - 3 - Math.round(ph * 8), 1, 1, 'rgba(255,255,255,0.6)');
      }
    } else if (f.id === 'table') {
      const p = P(262, 168, 6); R(g, p.x, p.y - 3, 3, 3, '#f2efe8'); R(g, p.x + 3, p.y - 2, 1, 1, '#f2efe8');
    } else if (f.id === 'lamp') {
      const p = P(231, 145, 30);
      R(g, p.x - 4, p.y - 2, 9, 4, pal.lampShade || '#ffe2a8'); R(g, p.x - 3, p.y + 2, 7, 1, shade(pal.lampShade || '#ffe2a8', -0.2));
    } else if (f.id === 'cat') {
      const p = P(216, 180);
      const breathe = Math.floor(t / 900) % 2;
      const fur = pal.cat || '#d9894a';
      R(g, p.x - 5, p.y - 1, 12, 2, 'rgba(0,0,0,0.25)');
      R(g, p.x - 5, p.y - 5 - breathe, 10, 5 + breathe, fur); R(g, p.x - 5, p.y - 5 - breathe, 10, 1, shade(fur, 0.2));
      R(g, p.x + 3, p.y - 7, 4, 4, fur); R(g, p.x + 3, p.y - 8, 1, 1, fur); R(g, p.x + 6, p.y - 8, 1, 1, fur);
      R(g, p.x + 4, p.y - 6, 1, 1, '#2a1a10'); R(g, p.x - 7, p.y - 2, 3, 1, fur);
      if (Math.floor(t / 3000) % 2) { R(g, p.x + 6, p.y - 12 - Math.floor(t / 500) % 3, 2, 1, '#cfc7e4'); }
    }
  }

  /* ---------- Vie des murs (derrière tout le reste) ---------- */
  function drawWallLife(t) {
    // étoiles / guirlande
    if (!pal.day) for (let i = 0; i < 7; i++) {
      if ((Math.floor(t / 700) + i) % 4 === 0) continue;
      planeS(g, 126 + i * 9, FLOOR_Y, 2, 22 + ((i * 7) % 15), 1, '#fff6c8');
    }
    if (pal.lights) {
      const hues = ['#ff6ac1', '#5ef1ff', '#ffb86b', '#7ee787', '#bd93f9'];
      for (let i = 0; i < 40; i++) {
        const on = (Math.floor(t / 420) + i) % 3 !== 0;
        planeS(g, 4 + i * 8, FLOOR_Y, 2, WALL_H - 6 - (i % 2), 1, on ? hues[i % hues.length] : '#3a3050');
      }
    }
    // horloge : aiguilles
    const ck = P(207, FLOOR_Y, 34);
    const ang = t / 6000;
    R(g, ck.x + Math.round(Math.cos(ang) * 2), ck.y + Math.round(Math.sin(ang) * 2), 1, 1, '#1b1528');
    R(g, ck.x, ck.y, 1, 1, '#c0392b');
    // tableau : schémas tracés par les agents
    drawBoardStrokes(t);
    // lecture : un objet s'illumine quand quelqu'un lit
    if (worldApi.readers().length) {
      const i = Math.floor(t / 600) % 30;
      planeS(g, 224 + i * 2, FLOOR_Y + 8, 2, 3 + (i % 3) * 11, 8, 'rgba(255,255,255,0.35)');
    }
    // voyants de la baie
    for (let r = 0; r < 6; r++) {
      const on = (Math.floor(t / (240 + r * 50)) + r) % 3 !== 0;
      planeS(g, 314, FLOOR_Y + 8, 2, 6 + r * 6, 1, on ? (r % 2 ? '#57f287' : '#5ef1ff') : '#1f2a2a');
    }
  }
  // Les traits du tableau (coordonnées locales 16–88 × 10–32) projetés sur le mur du fond.
  function drawBoardStrokes(t) {
    for (const s of whiteboard) {
      const p = clamp((t - s.t0) / 700, 0, 1);
      const pts = [];
      if (s.k === 'box') { for (let i = 0; i <= s.w; i++) { pts.push([s.x + i, s.y], [s.x + i, s.y + s.h]); } for (let j = 0; j <= s.h; j++) { pts.push([s.x, s.y + j], [s.x + s.w, s.y + j]); } }
      else if (s.k === 'line') for (let i = 0; i <= s.w * 1.5; i++) pts.push([s.x + i, s.y + Math.round(Math.sin(i / 3))]);
      else if (s.k === 'arrow') { for (let i = 0; i <= s.w; i++) pts.push([s.x + i, s.y]); pts.push([s.x + s.w - 1, s.y - 1], [s.x + s.w - 1, s.y + 1], [s.x + s.w - 2, s.y - 2], [s.x + s.w - 2, s.y + 2]); }
      else for (let a = 0; a < 24; a++) pts.push([s.x + 4 + Math.round(Math.cos(a / 24 * 6.283) * 4), s.y + 3 + Math.round(Math.sin(a / 24 * 6.283) * 3)]);
      const col = pal.boardInk || s.color;
      const n = Math.ceil(pts.length * p);
      for (let i = 0; i < n; i++) {
        const [u, v] = pts[i];
        const q = P(clamp(u + 4, 20, 88), FLOOR_Y, clamp(38 - (v - 6), 14, 37));
        R(g, Math.floor(q.x), Math.round(q.y), 1, 1, col);
      }
    }
  }

  /* ---------- Personnages ---------- */
  const PANTS = '#2a2238', SHOE = '#15111c', EYE = '#1b1424';
  function drawAgent(a, t) {
    if (a.hitAt) return drawDeadAgent(a, t);
    const s = P(a.x, a.y);
    drawSprite(a, s.x, s.y, t);
  }
  // Sprite ~26 px, 4 directions : face (bas / droite) ou dos (haut / gauche), en miroir.
  function drawSprite(a, sx, sy, t) {
    const walking = a.path.length > 0;
    const sitting = !walking && a.pose === 'sit';
    const onSofa = sitting && a.station === 'lounge';
    const bob = walking ? -Math.abs(Math.round(Math.sin(a.walkT * 14))) : 0;
    const x = Math.round(sx), base = Math.round(sy);
    const y = base + bob + (sitting ? (onSofa ? -4 : 2) : 0);
    const face = a.face;
    const back = face === 'up' || face === 'left';
    const mirror = face === 'right' || face === 'up';
    const col = a.color, isMain = a.id === MAIN_ID;
    const r = (dx, dy, w, h, c) => R(g, x + dx, y + dy, w, h, c);
    const dark = shade(col, -0.3), light = shade(col, 0.28);

    g.save();
    g.globalAlpha = a.alpha;
    // ombre au sol
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x - 4, base - 1, 8, 1); g.fillRect(x - 5, base, 10, 1); g.fillRect(x - 3, base + 1, 6, 1);

    // jambes
    if (!sitting) {
      const ph = walking ? Math.floor(a.walkT * 8) % 2 : -1;
      const lh = ph === 1 ? 4 : 5, rh = ph === 0 ? 4 : 5;
      r(-3, -5, 2, lh, PANTS); r(-3, -5 + lh - 1, 2, 1, SHOE);
      r(1, -5, 2, rh, PANTS); r(1, -5 + rh - 1, 2, 1, SHOE);
    } else if (onSofa) {
      r(-3, -4, 2, 3, PANTS); r(1, -4, 2, 3, PANTS); r(-3, -1, 2, 1, SHOE); r(1, -1, 2, 1, SHOE);
    }

    // corps
    r(-4, -13, 8, 8, col);
    r(mirror ? -4 : 3, -13, 1, 8, dark);
    r(-4, -6, 8, 1, dark);
    if (!back) { r(-1, -13, 2, 1, light); if (isMain) { r(-2, -9, 4, 2, dark); r(-1, -12, 1, 3, shade(col, -0.15)); } }
    else if (isMain) r(-3, -13, 6, 2, dark);
    // bras
    const swing = walking ? Math.round(Math.sin(a.walkT * 14)) : 0;
    const typing = !walking && (a.activity === 'coding' || a.activity === 'orchestrating') && Math.floor(t / 140) % 2;
    r(-6, -12 + swing, 2, 6, shade(col, -0.12)); r(-6, -7 + swing, 2, 1, a.skin);
    r(4, -12 - swing, 2, 6, shade(col, -0.12)); r(4, -7 - swing - (typing ? 1 : 0), 2, 1, a.skin);

    // tête
    const ex = mirror ? 0 : -2;
    const blink = ((t / 1000 + a.blinkSeed) % 3.6) < 0.12;
    r(-4, -21, 8, 8, a.skin);
    r(mirror ? -4 : 3, -21, 1, 8, shade(a.skin, -0.12));
    if (back) {
      r(-4, -22, 8, 8, a.hair); r(-4, -22, 8, 1, shade(a.hair, 0.2));
    } else {
      r(-4, -22, 8, 3, a.hair); r(mirror ? -4 : 3, -20, 1, 3, a.hair);
      r(ex - 1, -17 + (blink ? 1 : 0), 1, blink ? 1 : 2, EYE);
      r(ex + 2, -17 + (blink ? 1 : 0), 1, blink ? 1 : 2, EYE);
      r(ex - 2, -15, 1, 1, 'rgba(255,120,120,0.45)'); r(ex + 3, -15, 1, 1, 'rgba(255,120,120,0.45)');
      r(ex, -14, 2, 1, shade(a.skin, -0.28));
    }
    if (isMain) drawClaudeHood(r, back, col, t);
    else drawAccessory(a, r, back, mirror, ex, col);

    // objets en main
    if (a.carrying) { r(-3, -11, 7, 5, '#f4c95d'); r(-3, -11, 7, 1, '#ffe08a'); }
    if (!walking && a.activity === 'coffee') {
      const hx = mirror ? 5 : -8;
      r(hx, -10, 3, 3, '#f2efe8'); r(hx + (mirror ? 3 : -1), -9, 1, 1, '#f2efe8');
      const ph = (t / 800 + a.blinkSeed) % 1;
      g.fillStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`;
      g.fillRect(x + hx + 1 + (ph > 0.5 ? 1 : 0), Math.round(y - 12 - ph * 5), 1, 1);
    }
    if (!walking && a.activity === 'reading') {
      const lift = Math.floor(t / 500 + a.blinkSeed) % 2;
      r(mirror ? 3 : -7, -15 - lift, 4, 5, shade(col, -0.35)); r(mirror ? 4 : -6, -14 - lift, 2, 3, '#f2efe8');
    }

    // marqueurs
    const topY = isMain ? -38 : -30;
    if (a.errorUntil > now() && Math.floor(t / 200) % 2) { r(-1, topY - 2, 2, 5, '#ff4d5e'); r(-1, topY + 4, 2, 2, '#ff4d5e'); }
    if (selectedId === a.id) {
      const by = topY - 4 - Math.round((Math.sin(t / 220) + 1));
      r(-2, by, 5, 1, '#f1fa8c'); r(-1, by + 1, 3, 1, '#f1fa8c'); r(0, by + 2, 1, 1, '#f1fa8c');
    }
    g.restore();
  }

  // Claude : sweat orange à capuche et petite étincelle qui scintille au-dessus de la tête.
  function drawClaudeHood(r, back, col, t) {
    const hood = shade(col, -0.12);
    if (back) { r(-5, -23, 10, 10, hood); r(-5, -23, 10, 1, shade(col, 0.2)); r(-1, -14, 2, 1, shade(col, -0.3)); }
    else { r(-5, -23, 10, 2, hood); r(-5, -21, 1, 8, hood); r(4, -21, 1, 8, hood); r(-4, -23, 8, 1, shade(col, 0.2)); }
    const pulse = (Math.sin(t / 420) + 1) / 2;
    const c1 = pulse > 0.5 ? '#ffe0c8' : '#ffb48f', c2 = shade(col, 0.15);
    const sy = -29 - Math.round(pulse);
    r(0, sy - 3, 1, 7, c1); r(-3, sy, 7, 1, c1);
    if (Math.floor(t / 600) % 2) { r(-2, sy - 2, 1, 1, c2); r(2, sy - 2, 1, 1, c2); r(-2, sy + 2, 1, 1, c2); r(2, sy + 2, 1, 1, c2); }
    r(0, sy, 1, 1, '#ffffff');
  }

  function drawAccessory(a, r, back, mirror, ex, col) {
    const role = a.role;
    if (role === 'Architect') { r(-5, -23, 10, 2, '#f6c945'); r(-3, -24, 6, 1, '#f6c945'); r(-4, -23, 8, 1, '#ffe27a'); }
    else if (role === 'Coder') { r(-4, -24, 8, 3, '#3a3f58'); r(-4, -22, 8, 1, col); r(-1, -25, 2, 1, '#3a3f58'); }
    else if (role === 'Researcher' && !back) { r(ex - 2, -18, 7, 1, '#9be7ff'); r(ex - 2, -17, 1, 1, '#9be7ff'); r(ex + 4, -17, 1, 1, '#9be7ff'); }
    else if (role === 'Tester') { r(-4, -19, 8, 1, '#2b8a3e'); if (!back) { r(ex - 2, -18, 3, 2, 'rgba(126,231,135,0.75)'); r(ex + 1, -18, 3, 2, 'rgba(126,231,135,0.75)'); } }
    else if (role === 'Reviewer') { r(-4, -24, 8, 2, '#e05561'); r(mirror ? 4 : -6, -23, 2, 1, '#e05561'); }
    else if (role === 'Debugger') { r(-2, -25, 1, 3, '#333'); r(1, -25, 1, 3, '#333'); r(-3, -26, 2, 1, '#ff5c8a'); r(1, -26, 2, 1, '#ff5c8a'); }
  }

  /* ---------- Lumière ---------- */
  function glow(x, y, r, col, a) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rgba(col, a)); grd.addColorStop(1, rgba(col, 0));
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function drawLighting(t) {
    if (pal.night) { g.fillStyle = pal.night; g.fillRect(0, 0, IW, IH); }
    g.save();
    g.globalCompositeOperation = 'lighter';
    const flicker = 1 + Math.sin(t / 130) * 0.02;
    const lamp = P(231, 145, 26);
    glow(lamp.x, lamp.y + 14, 42 * flicker, pal.lamp, 0.2);
    const win = P(155, FLOOR_Y, 28);
    glow(win.x, win.y + 8, 52, pal.day ? '#fff6d8' : '#5a6bff', pal.day ? 0.12 : 0.1);
    if (worldApi.mainActive()) { const m = P(160, 98, 18); glow(m.x, m.y, 18, pal.screenOn, 0.16); }
    CODE_DESKS.forEach((d, i) => { const u = worldApi.codeUser(i); if (u) { const p = P(d.x + 18, d.y + 4, 14); glow(p.x, p.y, 12, u.color, 0.14); } });
    if (worldApi.benchRunning()) { const b = P(42, 156, 14); glow(b.x, b.y, 24, '#57f287', 0.1); }
    g.restore();
    const v = g.createRadialGradient(IW / 2, IH / 2 + 10, 60, IW / 2, IH / 2, 170);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(5,2,12,${pal.vignette ?? 0.4})`);
    g.fillStyle = v; g.fillRect(0, 0, IW, IH);
  }

  /* ================================================================
   * Mondes
   * ================================================================ */
  const busyAgents = () => [...agents.values()].filter(a => !a.path.length && !a.dying && !a.gone);
  const worldApi = {
    codeUser: i => busyAgents().find(a => a.station === 'code' && a.slot === i && a.activity === 'coding') || null,
    readers: () => busyAgents().filter(a => a.station === 'library' && a.slot >= 0),
    mainActive: () => { const m = agents.get(MAIN_ID); return !!m && now() - m.lastToolAt < 2500; },
    benchRunning: () => benchLamps.some(l => l.state === 'run')
  };
  const FALLBACK_WORLD = {
    id: 'studio', name: 'Studio dev', icon: '💻', claudeTitle: 'Orchestrateur', glyphs: CODE_GLYPHS, status: {},
    pal: {
      bg: '#0c0a12', floorA: '#6b4a36', floorB: '#74523c', grout: '#5a3d2c', wallBack: '#3a2f57', wallLeft: '#2e2547', trim: '#4a3d6e', base: '#241c38',
      rug: '#3b2d5e', wood: '#8a5a3c', woodSide: '#6e4630', woodDark: '#5a3826', metal: '#2a2f3a', metalDark: '#1b1f27', screen: '#123040', screenOn: '#5ef1ff',
      bench: '#4a4f5c', benchSide: '#3a3e49', sofa: '#6b3a6e', board: '#e9e4f5', boardFrame: '#9a93b0', shelf: '#5a3d2a',
      items: ['#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2'], sky: '#1b2b4a', lights: true, night: 'rgba(14,8,30,0.22)', lamp: '#ffb86b'
    }
  };
  const WORLDS = {};
  for (const [id, w] of Object.entries(window.ROOM_WORLDS || {})) {
    if (w && w.pal) WORLDS[id] = { glyphs: CODE_GLYPHS, status: {}, ...w, pal: { ...FALLBACK_WORLD.pal, ...w.pal } };
    else console.error(`Monde "${id}" ignoré : palette (pal) manquante.`);
  }
  if (!WORLDS.studio) WORLDS.studio = FALLBACK_WORLD;
  let world = WORLDS.studio;
  let pal = world.pal;
  function setWorld(id) {
    world = WORLDS[id] || WORLDS.studio;
    pal = world.pal;
    bgx.clearRect(0, 0, IW, IH);
    paintShell(bgx, pal);
    paintWallItems(bgx, pal);
    if (typeof world.decor === 'function') {
      try {
        world.decor({ c: bgx, P, planeS: (...a) => planeS(bgx, ...a), planeE: (...a) => planeE(bgx, ...a), box: (...a) => isoBox(bgx, ...a), floor: (...a) => floorRect(bgx, ...a), px: (x, y, w, h, col) => R(bgx, x, y, w, h, col), shade, rand: seeded(23), FLOOR_Y, WALL_H, cols3 });
      } catch (err) { console.error(`Décor du monde "${world.id}" :`, err); }
    }
    buildFurniture(pal);
    treeDirty = true;
  }

  function drawEffects(t) {
    for (const b of beams) {
      const p = (t - b.t0) / b.dur;
      const a = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
      const s = P(b.x, b.y);
      const w = 3 + Math.round(Math.sin(p * 20));
      g.fillStyle = rgba(b.color, 0.25 * a); g.fillRect(Math.round(s.x) - w, 0, w * 2, Math.round(s.y));
      g.fillStyle = `rgba(255,255,255,${0.6 * a})`; g.fillRect(Math.round(s.x), 0, 1, Math.round(s.y));
      const rr = Math.round(p * 10);
      g.fillStyle = rgba(b.color, 0.5 * a);
      g.fillRect(Math.round(s.x) - rr, Math.round(s.y) - 1, rr * 2, 1); g.fillRect(Math.round(s.x) - rr + 2, Math.round(s.y) + 1, rr * 2 - 4, 1);
      if (Math.random() < 0.6) particles.push({ x: b.x + rnd(-4, 4), y: b.y - rnd(0, 4), vx: 0, vy: rnd(-40, -20), life: 0, max: 0.6, color: '#ffffff', size: 1, grav: 0 });
    }
    for (const p of particles) {
      // l'origine est projetée une seule fois, le mouvement reste à l'écran (les étincelles montent droit)
      if (p.ox === undefined) { const s = toScreen(p.x, p.y); p.ox = s.x - p.x; p.oy = s.y - p.y; }
      g.globalAlpha = clamp(1 - p.life / p.max, 0, 1);
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x + p.ox), Math.round(p.y + p.oy), p.size, p.size);
    }
    g.globalAlpha = 1;
    const pile = P(184, 101, 9 + Math.min(5, deskPile));
    for (const f of folders) {
      const p = clamp((t - f.t0) / f.dur, 0, 1);
      const e = p * p * (3 - 2 * p);
      const s0 = P(f.x0, f.y0 + 9, 9);
      const x = s0.x + (pile.x - s0.x) * e, y = s0.y + (pile.y - s0.y) * e - Math.sin(p * Math.PI) * 16;
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
    // Compactes (nom seul, rôle = liseré coloré). En cas de chevauchement, l'étiquette la moins
    // prioritaire est masquée au lieu d'être poussée : la chambre reste lisible avec beaucoup d'agents.
    const tagSize = Math.max(9, Math.round(U * 2.4));
    ctx.font = `600 ${tagSize}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const tags = [];
    for (const a of agents.values()) {
      if (a.alpha < 0.3 || a.hitAt) continue;
      const isMain = a.id === MAIN_ID;
      const label = isMain ? 'Claude' : a.name;
      const bw = ctx.measureText(label).width + p * 4, bh = tagSize + p * 2;
      const foot = P(a.x, a.y);
      const cx = foot.x * U;
      const cy = (foot.y + 4) * U;
      const prio = a.id === selectedId ? 0 : a.id === hoverId ? 1 : isMain ? 2 : a.done ? 4 : 3;
      tags.push({ a, label, prio, w: bw, h: bh, x: clamp(Math.round(cx - bw / 2), 0, canvas.width - bw), y: Math.round(cy - bh / 2 + p) });
    }
    tags.sort((m, n) => m.prio - n.prio || n.y - m.y);
    const placedTags = [];
    for (const tg of tags) {
      if (tg.prio > 1 && placedTags.some(o => tg.x < o.x + o.w && tg.x + tg.w > o.x && tg.y < o.y + o.h && tg.y + tg.h > o.y)) continue;
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
      // au-dessus de l'écran du poste ; la montée reste verticale à l'écran
      if (!q.s0) { q.s0 = P(q.x, q.y + 13, 18); q.y0 = q.y; }
      ctx.globalAlpha = clamp(1 - q.life / q.max, 0, 1);
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, q.s0.x * U, (q.s0.y + (q.y - q.y0)) * U);
    }
    ctx.globalAlpha = 1;

    // bulles
    const fs = Math.max(11, Math.round(U * 3.0));
    ctx.font = `${fs}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lh = Math.round(fs * 1.2);
    const maxW = Math.round(72 * U);
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
      const foot = P(a.x, a.y);
      const sitting = a.pose === 'sit' && !a.path.length;
      const anchor = a.hitAt && a.ghostScr ? { x: a.ghostScr.x, y: a.ghostScr.y - 14 }
        : { x: foot.x, y: foot.y - (sitting ? (a.station === 'lounge' ? 30 : 24) : 26) - (a.id === MAIN_ID ? 8 : 0) };
      const headY = anchor.y * U;
      let x = Math.round(anchor.x * U - w / 2);
      x = clamp(x, p, canvas.width - w - p);
      let fade = 1;
      if (b.doneAt) {
        const hold = a.bubbles.length > 1 ? BUBBLE_HOLD * 0.6 : BUBBLE_HOLD;
        fade = clamp(1 - (t - b.doneAt - hold) / 300, 0, 1);
      }
      items.push({ a, b, lines, w, h, x, y: Math.round(headY - h - p * 3), ax: anchor.x * U, ay: headY, fade });
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

    // onomatopées
    for (const c of comicTexts) {
      const age = t - c.t0;
      const pop = 1 + 0.5 * Math.max(0, 1 - age / 140);
      const size = Math.round(c.size * U * pop);
      ctx.font = `600 ${size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = clamp((c.dur - age) / (c.dur * 0.3), 0, 1);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, Math.round(U * 1.2));
      ctx.strokeStyle = c.stroke;
      const sc = toScreen(c.x, c.y);
      const x = clamp(sc.x * U, size * 2, canvas.width - size * 2), y = Math.max(size, (sc.y - 8) * U);
      ctx.strokeText(c.text, x, y);
      ctx.fillStyle = c.fill;
      ctx.fillText(c.text, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  /* ================================================================
   * Boucle principale
   * ================================================================ */
  const drawList = []; // réutilisée à chaque image : aucune allocation dans la boucle
  function frame() {
    tick();
    requestAnimationFrame(frame);
  }
  // Une image : simulation + dessin (appelable à la main via roomDebug.tick, ex. onglet en arrière-plan).
  function tick() {
    const t = now();
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    update(t, dt);

    g.clearRect(0, 0, IW, IH);
    g.drawImage(bg, 0, 0);
    drawWallLife(t);

    // Meubles (images pré-rendues) et personnages triés par profondeur x + y du plan.
    drawList.length = 0;
    for (const f of furniture) drawList.push(f);
    for (const a of agents.values()) { a.key = a.x + a.y + 0.5; drawList.push(a); }
    drawList.sort((m, n) => m.key - n.key);
    for (const d of drawList) {
      if (d.def) { if (d.img) g.drawImage(d.img, d.ox, d.oy); if (d.id) drawFurnitureLife(d, t); }
      else drawAgent(d, t);
    }
    drawShotgun(t);

    drawEffects(t);
    drawLighting(t);
    drawShotFx(t);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const shake = t < shakeUntil && !reducedMotion ? S * 2 : 0;
    ctx.drawImage(buf, shake ? Math.round(rnd(-1, 1)) * shake : 0, shake ? Math.round(rnd(-1, 1)) * shake : 0, IW * S, IH * S);
    drawOverlay(t);

    if (treeDirty) { treeDirty = false; renderTree(); }
    if (inspectorDirty) { inspectorDirty = false; if (selectedId) renderInspector(); }
  }

  /* ================================================================
   * HUD : arbre, journal, compteurs, fiche
   * ================================================================ */
  function statusOf(a) {
    if (a.gone) return 'Parti';
    if (a.dying) return a.hitAt ? '💥 Retiré' : 'Va être retiré…';
    if (a.errorUntil > now()) return STATUS_LABEL.error;
    if (a.path.length) return STATUS_LABEL.walking;
    if (a.done && a.activity !== 'handoff') return a.activity === 'coffee' ? 'Terminé · café' : STATUS_LABEL.done;
    return (world.status && world.status[a.activity]) || STATUS_LABEL[a.activity] || a.activity;
  }

  setInterval(() => { treeDirty = true; trimRoom(); }, 500);

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
    const calm = !subs.length && !main.bubbles.length && !connection.demoRunning;
    $('#onboarding').classList.toggle('hidden', !calm || onboardingDismissed);
    if (filesDirty) { filesDirty = false; renderFiles(); }
  }

  const FILE_ICON = { w: ['✚', 'écrit'], e: ['✎', 'modifié'], r: ['◌', 'lu'] };
  function renderFiles() {
    const list = $('#file-list');
    const items = [...fileIndex.values()].sort((a, b) => (a.kind === 'r') - (b.kind === 'r') || b.t - a.t).slice(0, 200);
    $('#files-count').textContent = fileIndex.size;
    if (!items.length) {
      const li = document.createElement('li'); li.className = 'none';
      li.textContent = 'Aucun fichier touché pour le moment.';
      return list.replaceChildren(li);
    }
    list.replaceChildren(...items.map(f => {
      const a = agents.get(f.agentId);
      const li = document.createElement('li');
      li.title = `${f.path} · ${FILE_ICON[f.kind][1]} ${f.count} fois`;
      const act = document.createElement('span'); act.className = `act ${f.kind}`; act.textContent = FILE_ICON[f.kind][0];
      const path = document.createElement('span'); path.className = 'path';
      const bdi = document.createElement('bdi'); bdi.textContent = f.path; path.appendChild(bdi);
      const by = document.createElement('span'); by.className = 'by';
      const sw = document.createElement('i'); sw.style.background = a ? a.color : 'var(--muted)';
      by.append(sw, a ? a.name : 'parti');
      li.append(act, path, by);
      if (a) li.addEventListener('click', () => openInspector(a.id));
      return li;
    }));
  }

  let lastCounts = [0, 0, 0];
  function updateCounters() {
    const active = [...agents.values()].filter(a => a.id !== MAIN_ID && !a.done && !a.gone && !a.dying).length;
    const values = [active, counters.tools, counters.events];
    ['#c-agents', '#c-tools', '#c-events'].forEach((sel, i) => {
      const el = $(sel);
      el.textContent = values[i];
      if (values[i] > lastCounts[i] && !replaying && !reducedMotion) {
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      }
    });
    lastCounts = values;
  }

  const logEl = $('#log');
  function log(agent, kind, text, e, target) {
    addLogEntry({ t: e && e.timestamp ? e.timestamp : Date.now(), who: agent.name, color: agent.color, kind, tool: e && e.tool, text, target: target ? target.name : null, targetColor: target ? target.color : null });
  }
  function addLogEntry(entry) {
    const stick = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
    const li = document.createElement('li');
    if (entry.kind === 'ERR') li.className = 'err';
    li.dataset.kind = entry.kind;
    li.hidden = !matchesFilter(entry.kind);
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

  // Filtres du journal : chaque filtre regroupe plusieurs types d'entrées.
  const FILTER_KINDS = { all: null, TOOL: ['TOOL', 'OK'], MSG: ['MSG', 'SPAWN', 'DONE'], ERR: ['ERR'] };
  let logFilter = 'all';
  function matchesFilter(kind) { const k = FILTER_KINDS[logFilter]; return !k || k.includes(kind); }
  document.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => {
    logFilter = btn.dataset.filter;
    document.querySelectorAll('.filter').forEach(b => b.classList.toggle('active', b === btn));
    for (const li of logEl.children) li.hidden = !matchesFilter(li.dataset.kind);
    logEl.scrollTop = logEl.scrollHeight;
  }));

  // Onglets Journal / Fichiers
  function selectTab(name) {
    for (const t of ['log', 'files']) {
      const on = t === name;
      $(`#tab-${t}`).classList.toggle('active', on);
      $(`#tab-${t}`).setAttribute('aria-selected', String(on));
      $(`#pane-${t}`).classList.toggle('hidden', !on);
    }
    $('#btn-clear-log').classList.toggle('hidden', name !== 'log');
    if (name === 'files') renderFiles();
  }
  $('#tab-log').addEventListener('click', () => selectTab('log'));
  $('#tab-files').addEventListener('click', () => selectTab('files'));

  // Notifications
  function toast(text, kind = '') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 3200);
  }

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
    const bx = ((clientX - r.left) / r.width) * IW;
    const by = ((clientY - r.top) / r.height) * IH;
    let best = null, bd = Infinity;
    for (const a of agents.values()) {
      if (a.alpha < 0.3 || a.hitAt) continue;
      const s = P(a.x, a.y);
      if (bx >= s.x - 7 && bx <= s.x + 7 && by >= s.y - 26 && by <= s.y + 3) {
        const d = Math.abs(by - (s.y - 12)) + Math.abs(bx - s.x);
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
  let claudeSeen = false;
  let onboardingDismissed = false;

  // Jeton (serveur exposé sur le réseau) : lu une fois dans l'URL, gardé pour l'onglet, retiré de la barre d'adresse.
  const token = (() => {
    let t = '';
    try {
      const url = new URL(location.href);
      t = url.searchParams.get('token') || sessionStorage.getItem('agent-room:token') || '';
      if (url.searchParams.has('token')) {
        sessionStorage.setItem('agent-room:token', t);
        url.searchParams.delete('token');
        history.replaceState(null, '', url);
      }
    } catch { /* file:// ou stockage indisponible */ }
    return t;
  })();
  const authHeaders = extra => (token ? { ...extra, 'x-agent-room-token': token } : { ...extra });
  const api = (path, opts = {}) => fetch(path, { ...opts, headers: authHeaders(opts.headers) });

  function setStatus(kind) {
    statusEl.className = `status status--${kind}`;
    statusEl.querySelector('.label').textContent =
      kind === 'live' ? 'En direct' : kind === 'demo' ? 'Mode démo' : kind === 'auth' ? 'Jeton requis' : 'Connexion…';
    statusEl.title = kind === 'auth'
      ? 'Le serveur exige un jeton : ouvre l\'URL affichée dans le terminal (…/?token=…)'
      : kind === 'demo' ? 'Serveur injoignable : la chambre rejoue la démo localement' : 'Connecté au serveur';
    updateSource();
  }
  function updateSource() {
    $('#status-source').textContent = !connection.live ? '' : claudeSeen ? 'Claude Code branché' : 'en attente de Claude';
  }

  function connect() {
    if (location.protocol === 'file:') { setStatus('demo'); return; }
    let ws;
    const q = token ? `?token=${encodeURIComponent(token)}` : '';
    try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${q}`); }
    catch { setStatus('demo'); return; }
    connection.ws = ws;
    ws.onopen = () => {
      const wasRetry = connection.retry > 0;
      connection.live = true; connection.retry = 0;
      stopLocalDemo();
      setStatus('live');
      if (wasRetry) toast('Reconnecté au serveur.', 'ok');
    };
    ws.onmessage = msg => {
      let data;
      try { data = JSON.parse(msg.data); } catch { return; }
      if (data.kind === 'hello') replayHistory(data.history || []);
      else if (data.kind === 'event') handleEvent(data.event);
    };
    ws.onclose = async () => {
      const wasLive = connection.live;
      connection.live = false;
      // Refus d'authentification ? /api/health indique si un jeton est exigé.
      let needsAuth = false;
      try { const h = await (await fetch('/api/health')).json(); needsAuth = h.auth && !wasLive; } catch { /* serveur arrêté */ }
      setStatus(needsAuth ? 'auth' : 'demo');
      if (wasLive) toast('Connexion perdue, nouvel essai…', 'err');
      if (needsAuth && connection.retry === 0) toast('Ce serveur exige un jeton : ouvre l\'URL avec ?token=… affichée dans le terminal.', 'err');
      const delay = Math.min(needsAuth ? 15000 : 5000, 800 * 2 ** connection.retry++);
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
        const r = await api('/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) });
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

  async function startDemo() {
    if (connection.live) {
      try { const r = await api('/api/demo', { method: 'POST' }); if (r.ok) return; } catch { /* local */ }
    }
    runLocalDemo();
  }
  $('#btn-demo').addEventListener('click', startDemo);
  $('#onb-demo').addEventListener('click', startDemo);
  $('#onb-close').addEventListener('click', () => { onboardingDismissed = true; $('#onboarding').classList.add('hidden'); });

  let testCount = 0;
  const TEST_AGENTS = [
    { role: 'Researcher', name: 'Scout', task: 'explorer les dépendances obsolètes', tools: [['Glob', 'package*.json'], ['Read', 'package.json']] },
    { role: 'Coder', name: 'Pixel', task: 'refactorer le composant Navbar', tools: [['Read', 'src/components/Navbar.tsx'], ['Edit', 'src/components/Navbar.tsx']] },
    { role: 'Tester', name: 'Probe', task: 'lancer la suite de tests e2e', tools: [['Bash', 'npm run test:e2e']] },
    { role: 'Architect', name: 'Blueprint', task: 'découper le monolithe en modules', tools: [['TodoWrite', '']] },
    { role: 'Reviewer', name: 'Lynx', task: 'relire la PR #42', tools: [['Grep', 'TODO|FIXME'], ['Read', 'src/api/routes.ts']] },
    { role: 'Debugger', name: 'Patch', task: 'traquer la fuite mémoire du worker', tools: [['Bash', 'node --inspect worker.js'], ['Edit', 'src/worker.ts']] }
  ];
  function spawnTestAgent() {
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
  }
  $('#btn-spawn').addEventListener('click', spawnTestAgent);

  async function resetAll() {
    stopLocalDemo();
    if (connection.live) { try { const r = await api('/api/reset', { method: 'POST' }); if (r.ok) return; } catch { /* local */ } }
    resetRoom(true);
  }
  $('#btn-reset').addEventListener('click', resetAll);

  /* ================================================================
   * Plein écran, aide, copie, raccourcis clavier
   * ================================================================ */
  function toggleFullscreen() {
    const stage = $('#stage');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => toast('Plein écran indisponible ici.', 'err'));
  }
  document.addEventListener('fullscreenchange', () => setTimeout(resize, 50));
  $('#btn-fullscreen').addEventListener('click', toggleFullscreen);

  const helpEl = $('#help');
  const openHelp = () => { if (helpEl.showModal && !helpEl.open) helpEl.showModal(); };
  $('#btn-help').addEventListener('click', openHelp);
  $('#help-close').addEventListener('click', () => helpEl.close());
  helpEl.addEventListener('click', e => { if (e.target === helpEl) helpEl.close(); });

  document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
    const text = $(btn.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copié ✓'; btn.classList.add('done');
      setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('done'); }, 1600);
    } catch { toast('Copie impossible : sélectionne la commande à la main.', 'err'); }
  }));

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const el = e.target instanceof Element ? e.target : null;
    if ((el && el.closest('input, select, textarea, [contenteditable]')) || helpEl.open) return;
    const k = e.key.toLowerCase();
    if (k === 'd') startDemo();
    else if (k === 's') spawnTestAgent();
    else if (k === 'r') resetAll();
    else if (k === 'f') toggleFullscreen();
    else if (k === '?' || k === 'h') openHelp();
    else if (k === 'w') {
      const ws = $('#world-select');
      ws.selectedIndex = (ws.selectedIndex + 1) % ws.options.length;
      ws.dispatchEvent(new Event('change'));
      toast(`Monde : ${ws.options[ws.selectedIndex].textContent}`);
    } else return;
    e.preventDefault();
  });

  /* ================================================================
   * Sélecteurs de monde et de fin
   * ================================================================ */
  function readPref(key, fallback) {
    const q = new URLSearchParams(location.search).get(key);
    if (q) return q;
    try { return localStorage.getItem(`agent-room:${key}`) || fallback; } catch { return fallback; }
  }
  function savePref(key, value) {
    try { localStorage.setItem(`agent-room:${key}`, value); } catch { /* stockage indisponible */ }
    try {
      const url = new URL(location.href);
      url.searchParams.set(key, value);
      history.replaceState(null, '', url);
    } catch { /* file:// */ }
  }
  function initPickers() {
    const ws = $('#world-select'), es = $('#ending-select');
    for (const w of Object.values(WORLDS)) {
      const o = document.createElement('option');
      o.value = w.id; o.textContent = `${w.icon} ${w.name}`;
      ws.appendChild(o);
    }
    const wid = WORLDS[readPref('world', 'studio')] ? readPref('world', 'studio') : 'studio';
    ws.value = wid; setWorld(wid);
    ws.addEventListener('change', () => { setWorld(ws.value); savePref('world', ws.value); });
    const fin = readPref('fin', 'pompe');
    endingMode = fin === 'cafe' ? 'cafe' : 'pompe';
    es.value = endingMode;
    es.addEventListener('change', () => {
      endingMode = es.value;
      savePref('fin', endingMode);
      for (const a of agents.values()) {
        if (endingMode === 'pompe') { if (a.done && !a.dying && a.activity === 'coffee') a.retireAt = now() + RETIRE_DELAY; }
        else a.retireAt = 0;
      }
    });
  }

  /* ================================================================
   * Démarrage
   * ================================================================ */
  function start() {
    resize();
    initPickers();
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
  window.roomDebug = { emit: emitLocal, agents, stations: STATIONS, findPath, setWorld, worlds: WORLDS, execution: () => exec, tick, project: P };
})();
