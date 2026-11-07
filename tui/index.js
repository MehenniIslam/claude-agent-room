/*
 * Mode terminal : la chambre dessinée en couleurs dans le terminal, sans navigateur.
 *
 *   claude-agent-room tui [--port 3030]
 *
 * Se connecte au WebSocket du serveur et affiche :
 *   - le plan de la chambre en demi-blocs colorés (▀ : 2 pixels par caractère),
 *     avec Claude (✦) et chaque sous-agent (son initiale) à son poste ;
 *   - la liste des agents, les fichiers modifiés et le journal.
 * Touches : q quitter · d démo · r vider · w monde suivant.
 *
 * Léger par construction : redessin à 10 images/s au plus, et seulement quand
 * quelque chose a changé ; état borné (40 agents, 200 lignes de journal, 100 fichiers).
 */
const WebSocket = require('ws');

const W = 320, H = 208, MAIN_ID = 'claude-main';
const MAX_AGENTS = 40, MAX_LOG = 200, MAX_FILES = 100;
const COLORS = ['#5ef1ff', '#ff6ac1', '#7ee787', '#ffb86b', '#bd93f9', '#f1fa8c', '#ff7b72', '#79c0ff', '#56d4bc', '#e3a6ff'];
const ROLE_STATION = { Architect: 'whiteboard', Researcher: 'library', Reviewer: 'library', Coder: 'code', Tester: 'bench', Debugger: 'bench' };
const TOOL_STATION = {
  Read: 'library', Grep: 'library', Glob: 'library', LS: 'library', WebSearch: 'library', WebFetch: 'library',
  Write: 'code', Edit: 'code', MultiEdit: 'code', NotebookEdit: 'code',
  Bash: 'bench', BashOutput: 'bench', KillShell: 'bench', PowerShell: 'bench',
  Task: 'whiteboard', Agent: 'whiteboard', TodoWrite: 'whiteboard', TaskCreate: 'whiteboard', TaskUpdate: 'whiteboard', ExitPlanMode: 'whiteboard'
};
// Places dans le plan (mêmes repères que la page web).
const SPOTS = {
  whiteboard: [[28, 52], [50, 52], [72, 52]],
  library: [[234, 56], [256, 56], [278, 56]],
  code: [[130, 147], [192, 147], [130, 181], [192, 181]],
  bench: [[22, 184], [43, 184], [64, 184]],
  lounge: [[252, 151], [268, 151], [284, 151], [246, 188], [264, 194], [278, 186]],
  handoff: [[160, 117], [146, 117], [174, 117]],
  spawn: [[112, 114], [98, 114], [112, 126], [98, 126]]
};
const LABEL = { whiteboard: 'planifie', library: 'lit', code: 'code', bench: 'teste', lounge: 'en pause', handoff: 'fait son rapport', spawn: 'arrive' };
// Meubles du plan : [x, y, w, h, couleur].
const FURNITURE = [
  [16, 6, 76, 28, '#e9e4f5'], [118, 8, 74, 26, '#1b2b4a'], [220, 4, 82, 40, '#5a3d2a'], [302, 4, 16, 40, '#2a2f3a'],
  [130, 96, 60, 10, '#8a5a3c'], [152, 84, 16, 4, '#6b3a6e'],
  [112, 124, 36, 12, '#8a5a3c'], [174, 124, 36, 12, '#8a5a3c'], [112, 158, 36, 12, '#8a5a3c'], [174, 158, 36, 12, '#8a5a3c'],
  [2, 148, 80, 20, '#4a4f5c'], [2, 176, 12, 22, '#2a2f3a'],
  [230, 128, 76, 22, '#6b3a6e'], [252, 164, 32, 10, '#8a5a3c'], [290, 180, 26, 20, '#8a5a3c']
];
const THEMES = [
  { name: 'Studio dev', wall: '#3a2f57', floorA: '#6b4a36', floorB: '#74523c' },
  { name: 'Opéra', wall: '#3b1a24', floorA: '#5a1e2a', floorB: '#62232f' },
  { name: 'Jardin', wall: '#2f5a2a', floorA: '#4f7a3a', floorB: '#578443' },
  { name: 'Salle de classe', wall: '#d9cfae', floorA: '#b08a5a', floorB: '#a7814f' }
];

/* ---------------------------- Couleurs ANSI ---------------------------- */
const TRUECOLOR = !process.argv.includes('--256') && process.env.TERM !== 'dumb';
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const to256 = ([r, g, b]) => 16 + 36 * Math.round(r / 51) + 6 * Math.round(g / 51) + Math.round(b / 51);
const fg = hex => { const c = rgb(hex); return TRUECOLOR ? `\x1b[38;2;${c[0]};${c[1]};${c[2]}m` : `\x1b[38;5;${to256(c)}m`; };
const bg = hex => { const c = rgb(hex); return TRUECOLOR ? `\x1b[48;2;${c[0]};${c[1]};${c[2]}m` : `\x1b[48;5;${to256(c)}m`; };
const RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m';
const visible = s => s.replace(/\x1b\[[0-9;]*m/g, '');
function fit(s, width) {
  // tronque une ligne colorée à `width` colonnes visibles
  let out = '', n = 0;
  for (const part of s.split(/(\x1b\[[0-9;]*m)/)) {
    if (part.startsWith('\x1b[')) { out += part; continue; }
    for (const ch of part) { if (n >= width) return out + RESET; out += ch; n++; }
  }
  return out + ' '.repeat(Math.max(0, width - n)) + RESET;
}
const short = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const clock = ts => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/* ---------------------------- État ---------------------------- */
function createState() {
  return { agents: new Map(), log: [], files: new Map(), lastMsg: null, colorIdx: 0, claudeSeen: false };
}
let state = createState();
let theme = 0;
let status = 'Connexion…';
let dirty = true;

function agent(id, e = {}) {
  let a = state.agents.get(id);
  if (!a) {
    const isMain = id === MAIN_ID;
    a = {
      id, name: isMain ? 'Claude' : (e.name || id), role: isMain ? 'Orchestrateur' : (e.role || 'Coder'),
      color: isMain ? '#d97757' : COLORS[state.colorIdx++ % COLORS.length],
      station: isMain ? 'master' : 'spawn', x: 112, y: 114, tx: 112, ty: 114, tool: '', done: false, errUntil: 0, doneAt: 0
    };
    if (isMain) { a.x = a.tx = 160; a.y = a.ty = 92; }
    state.agents.set(id, a);
    if (state.agents.size > MAX_AGENTS) {
      const old = [...state.agents.values()].find(x => x.done && x.id !== MAIN_ID);
      if (old) state.agents.delete(old.id);
    }
  }
  return a;
}
function moveTo(a, station) {
  if (a.id === MAIN_ID) return;
  const spots = SPOTS[station];
  const taken = new Set([...state.agents.values()].filter(o => o !== a && o.station === station).map(o => o.slot));
  let slot = spots.findIndex((_, i) => !taken.has(i));
  if (slot < 0) slot = Math.floor(Math.random() * spots.length);
  a.station = station; a.slot = slot;
  [a.tx, a.ty] = spots[slot];
}
function log(who, color, text, kind = '') {
  state.log.push({ t: Date.now(), who, color, text: short(text, 160), kind });
  if (state.log.length > MAX_LOG) state.log.shift();
}

function handle(e, replay = false) {
  const type = String(e.type || '').toUpperCase();
  if (e.source === 'claude-code') state.claudeSeen = true;
  if (type === 'RESET') { state = createState(); log('Système', '#ffb86b', 'Chambre réinitialisée.'); return; }
  const a = agent(e.agentId || MAIN_ID, e);
  if (type === 'SUBAGENT_SPAWN') {
    a.name = e.name || a.name; a.role = e.role || a.role; a.done = false;
    moveTo(a, 'spawn');
    if (replay) moveTo(a, ROLE_STATION[a.role] || 'code');
    else setTimeout(() => { if (a.station === 'spawn') { moveTo(a, ROLE_STATION[a.role] || 'code'); dirty = true; } }, 1500);
    log('Claude', '#d97757', `crée ${a.name} (${a.role}) : ${e.message || ''}`, 'spawn');
  } else if (type === 'TOOL_START') {
    a.tool = e.tool || '';
    if (a.id !== MAIN_ID) { a.done = false; moveTo(a, TOOL_STATION[e.tool] || (String(e.tool).startsWith('mcp__') ? 'library' : ROLE_STATION[a.role] || 'code')); }
    if (e.file) {
      const kind = /^(Write)$/.test(e.tool) ? '+' : /Edit/.test(e.tool) ? '~' : '·';
      const prev = state.files.get(e.file);
      state.files.delete(e.file);
      state.files.set(e.file, { kind: prev && prev.kind !== '·' && kind === '·' ? prev.kind : kind, by: a.name, color: a.color });
      if (state.files.size > MAX_FILES) state.files.delete(state.files.keys().next().value);
    }
    log(a.name, a.color, `[${e.tool || 'outil'}] ${e.message || ''}`, 'tool');
  } else if (type === 'TOOL_END') {
    if (e.success === false) { a.errUntil = Date.now() + 4000; log(a.name, a.color, `✗ ${e.message || e.tool}`, 'err'); }
  } else if (type === 'AGENT_MESSAGE') {
    state.lastMsg = { who: a.name, color: a.color, text: e.message || '' };
    log(a.name, a.color, e.message || '', 'msg');
  } else if (type === 'SUBAGENT_COMPLETE') {
    if (a.id === MAIN_ID) return;
    a.done = true; a.tool = ''; a.doneAt = Date.now();
    moveTo(a, replay ? 'lounge' : 'handoff');
    if (!replay) setTimeout(() => { if (a.done) { moveTo(a, 'lounge'); dirty = true; } }, 3500);
    state.lastMsg = { who: a.name, color: a.color, text: `Rapport : ${e.message || 'mission accomplie'}` };
    log(a.name, a.color, `rapport : ${e.message || ''}`, 'done');
  } else if (type === 'ERROR') {
    a.errUntil = Date.now() + 4000;
    log(a.name, a.color, `erreur : ${e.message || ''}`, 'err');
  }
  if (replay) { a.x = a.tx; a.y = a.ty; }
}

/* ---------------------------- Rendu ---------------------------- */
let pixelCache = { key: '', px: null };
function mapPixels(cols, rows) {
  // rows lignes de texte = 2*rows pixels ; chaque pixel = une case du plan (recalculé seulement si la taille ou le monde change)
  const key = `${cols}x${rows}:${theme}`;
  if (pixelCache.key === key) return pixelCache.px;
  const th = THEMES[theme];
  const ph = rows * 2;
  const px = [];
  for (let py = 0; py < ph; py++) {
    const line = [];
    for (let cx = 0; cx < cols; cx++) {
      const x = (cx + 0.5) * W / cols, y = (py + 0.5) * H / ph;
      let col = y < 40 ? th.wall : ((Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? th.floorA : th.floorB);
      for (const [fx, fy, fw, fhh, c] of FURNITURE) if (x >= fx && x < fx + fw && y >= fy && y < fy + fhh) col = c;
      line.push(col);
    }
    px.push(line);
  }
  pixelCache = { key, px };
  return px;
}

function renderMap(cols, rows, now) {
  const px = mapPixels(cols, rows);
  const marks = new Map(); // "col,row" -> chaîne colorée d'un caractère
  for (const a of state.agents.values()) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(a.x / W * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(a.y / H * rows) - 1));
    const err = a.errUntil > now && Math.floor(now / 300) % 2;
    const glyph = a.id === MAIN_ID ? '✦' : (a.name[0] || '?').toUpperCase();
    const style = a.id === MAIN_ID ? `${bg('#2a1a12')}${BOLD}${fg('#ffb48f')}` : `${bg(err ? '#ff4d5e' : a.color)}${BOLD}${fg('#120c18')}`;
    marks.set(`${c},${r}`, `${style}${a.done ? glyph.toLowerCase() : glyph}${RESET}`);
  }
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      const m = marks.get(`${c},${r}`);
      s += m || `${fg(px[r * 2][c])}${bg(px[r * 2 + 1][c])}▀`;
    }
    lines.push(s + RESET);
  }
  return lines;
}

function renderPanel(width, height, now) {
  const out = [];
  const subs = [...state.agents.values()].filter(a => a.id !== MAIN_ID);
  const active = subs.filter(a => !a.done).length;
  out.push(`${BOLD}Agents${RESET} ${DIM}${active} au travail · ${subs.length - active} en pause${RESET}`);
  const main = state.agents.get(MAIN_ID);
  out.push(`${fg('#d97757')}✦ Claude${RESET} ${DIM}${THEMES[theme].name === 'Studio dev' ? 'orchestre' : THEMES[theme].name}${main && main.tool ? ' · ' + main.tool : ''}${RESET}`);
  for (const a of subs.slice(-8)) {
    const what = a.errUntil > now ? `${fg('#ff4d5e')}erreur${RESET}` : a.done ? `${DIM}${LABEL[a.station] || 'terminé'}${RESET}` : `${fg('#5ef1ff')}${LABEL[a.station] || ''}${a.tool ? ' · ' + a.tool : ''}${RESET}`;
    out.push(`${bg(a.color)}${fg('#120c18')}${BOLD}${(a.name[0] || '?').toUpperCase()}${RESET} ${short(a.name, 14)} ${DIM}${a.role}${RESET} ${what}`);
  }
  if (!subs.length) out.push(`${DIM}Aucun sous-agent pour le moment.${RESET}`);
  out.push('');
  const files = [...state.files.entries()].filter(([, f]) => f.kind !== '·').slice(-5).reverse();
  out.push(`${BOLD}Fichiers modifiés${RESET} ${DIM}${files.length ? '' : 'aucun'}${RESET}`);
  for (const [path, f] of files) out.push(`${fg(f.kind === '+' ? '#7ee787' : '#ffb86b')}${f.kind === '+' ? '✚' : '✎'}${RESET} ${short(path, Math.max(10, width - 16))} ${fg(f.color)}${short(f.by, 10)}${RESET}`);
  out.push('');
  out.push(`${BOLD}Journal${RESET}`);
  const room = Math.max(1, height - out.length);
  for (const l of state.log.slice(-room)) {
    const c = l.kind === 'err' ? fg('#ff6b6b') : '';
    out.push(`${DIM}${clock(l.t)}${RESET} ${fg(l.color)}${short(l.who, 10)}${RESET} ${c}${l.text}${RESET}`);
  }
  return out.map(s => fit(s, width));
}

function render() {
  if (!dirty) return;
  dirty = false;
  const now = Date.now();
  const cols = process.stdout.columns || 100, rows = process.stdout.rows || 32;
  const header = `${bg('#1e1929')}${BOLD}${fg('#d97757')} ✚ Claude Agent Room ${RESET}${bg('#1e1929')} ${status === 'En direct' ? fg('#7ee787') + '● En direct' : fg('#ffb86b') + '● ' + status}${RESET}${bg('#1e1929')}${DIM}${state.claudeSeen ? ' · Claude Code branché' : ''}  q quitter · d démo · r vider · w monde${RESET}`;
  const lines = [fit(header, cols)];
  const wide = cols >= 110;
  const mapCols = wide ? Math.min(96, Math.floor(cols * 0.58)) : cols;
  const mapRows = Math.max(8, Math.min(Math.round(mapCols * (H / W) / 2), rows - (wide ? 4 : 12)));
  const map = renderMap(mapCols, mapRows, now);
  const bubble = state.lastMsg ? `${fg(state.lastMsg.color)}${state.lastMsg.who}${RESET} : ${state.lastMsg.text}` : `${DIM}En attente de Claude…${RESET}`;
  if (wide) {
    const panel = renderPanel(cols - mapCols - 2, rows - 2, now);
    for (let i = 0; i < rows - 2; i++) lines.push(fit((map[i] || ' '.repeat(mapCols)) + '  ' + (panel[i] || ''), cols));
    lines[lines.length - 1] = fit(` ${bubble}`, cols);
  } else {
    for (const m of map) lines.push(fit(m, cols));
    lines.push(fit(` ${bubble}`, cols));
    for (const p of renderPanel(cols, rows - map.length - 2, now)) lines.push(fit(p, cols));
  }
  process.stdout.write('\x1b[H' + lines.slice(0, rows).join('\n'));
}

// Déplacement doux des agents vers leur place (pas de pathfinding : ligne droite).
function step() {
  let moving = false;
  for (const a of state.agents.values()) {
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    if (d > 0.5) { const s = Math.min(d, 9); a.x += dx / d * s; a.y += dy / d * s; moving = true; }
    if (a.errUntil > Date.now()) moving = true;
  }
  if (moving) dirty = true;
  render();
}

/* ---------------------------- Connexion ---------------------------- */
function start({ port = 3030, host = '127.0.0.1' } = {}) {
  if (!process.stdout.isTTY) {
    console.error('✖ Le mode terminal a besoin d\'un vrai terminal (stdout n\'est pas un TTY).');
    process.exit(1);
  }
  const token = process.env.AGENT_ROOM_TOKEN;
  const base = `http://${host}:${port}`;
  const url = `ws://${host}:${port}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  const headers = token ? { 'content-type': 'application/json', 'x-agent-room-token': token } : { 'content-type': 'application/json' };
  let retry = 0;

  process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J');
  const restore = () => { process.stdout.write(`${RESET}\x1b[?25h\x1b[?1049l`); };
  const quit = () => { restore(); process.exit(0); };
  process.on('exit', restore);
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
  process.stdout.on('resize', () => { process.stdout.write('\x1b[2J'); dirty = true; render(); });

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', buf => {
      const k = buf.toString();
      if (k === 'q' || k === '\u0003') quit();
      else if (k === 'd') fetch(`${base}/api/demo`, { method: 'POST', headers }).catch(() => {});
      else if (k === 'r') fetch(`${base}/api/reset`, { method: 'POST', headers }).catch(() => {});
      else if (k === 'w') { theme = (theme + 1) % THEMES.length; dirty = true; }
    });
  }

  const connect = () => {
    const ws = new WebSocket(url);
    ws.on('open', () => { retry = 0; status = 'En direct'; dirty = true; });
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.kind === 'hello') { state = createState(); for (const e of msg.history || []) handle(e, true); }
      else if (msg.kind === 'event') handle(msg.event);
      dirty = true;
    });
    ws.on('unexpected-response', (req, res) => { status = res.statusCode === 401 ? 'Jeton requis (AGENT_ROOM_TOKEN)' : `Refusé (${res.statusCode})`; dirty = true; });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (status === 'En direct') status = 'Connexion perdue, nouvel essai…';
      else if (!status.startsWith('Jeton') && !status.startsWith('Refusé')) status = `Serveur injoignable sur ${base} (lance la chambre)`;
      dirty = true;
      setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
    });
  };
  connect();
  setInterval(step, 100);
  render();
}

module.exports = { start, handle, renderMap, renderPanel, createState, _state: () => state };
