/*
 * Journal des événements sur disque : ~/.claude/agent-room/history/AAAA-MM-JJ.jsonl
 *
 *   - un fichier par jour, 50 Mo maximum (au-delà, les événements du jour ne sont plus écrits) ;
 *   - les fichiers plus vieux que `retentionDays` sont supprimés au démarrage puis chaque jour ;
 *   - au démarrage, les derniers événements du jour reviennent dans la chambre ;
 *   - export JSON ou CSV pour l'audit (les secrets sont déjà masqués à l'entrée).
 * Écritures groupées toutes les secondes : aucun accès disque par événement.
 */
const fs = require('fs');
const path = require('path');
const { DIR } = require('./config');

const MAX_DAY_BYTES = 50 * 1024 * 1024;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CSV_FIELDS = ['timestamp', 'type', 'agentId', 'name', 'role', 'tool', 'file', 'message', 'kind', 'sessionId', 'source'];

const dayOf = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function createHistory({ dir = path.join(DIR, 'history'), retentionDays = 14, enabled = true } = {}) {
  let queue = [];
  let ok = enabled;
  if (ok) { try { fs.mkdirSync(dir, { recursive: true }); } catch { ok = false; } }
  const fileFor = day => path.join(dir, `${day}.jsonl`);

  function cleanup() {
    if (!ok) return 0;
    const limit = Date.now() - retentionDays * 86400000;
    let removed = 0;
    for (const n of safeList()) {
      const day = n.slice(0, 10);
      if (new Date(`${day}T23:59:59`).getTime() < limit) { try { fs.unlinkSync(path.join(dir, n)); removed++; } catch { /* ignore */ } }
    }
    return removed;
  }
  function safeList() {
    try { return fs.readdirSync(dir).filter(n => DAY_RE.test(n.slice(0, 10)) && n.endsWith('.jsonl')).sort(); } catch { return []; }
  }

  function flush() {
    if (!ok || !queue.length) return;
    const batch = queue; queue = [];
    const byDay = new Map();
    for (const e of batch) {
      const day = dayOf(e.timestamp || Date.now());
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(JSON.stringify(e));
    }
    for (const [day, lines] of byDay) {
      const f = fileFor(day);
      let size = 0;
      try { size = fs.statSync(f).size; } catch { size = 0; }
      if (size > MAX_DAY_BYTES) continue;
      try { fs.appendFileSync(f, lines.join('\n') + '\n'); } catch { /* disque plein, lecture seule… : on continue sans planter */ }
    }
  }
  const timer = setInterval(flush, 1000);
  timer.unref();
  const daily = setInterval(cleanup, 6 * 3600 * 1000);
  daily.unref();

  function append(event) {
    if (!ok || event.type === 'RESET') return;
    queue.push(event);
    if (queue.length > 5000) flush();
  }

  /** Derniers événements d'un jour (lecture de la fin du fichier seulement). */
  function tail(day, max) {
    const f = fileFor(day);
    let size;
    try { size = fs.statSync(f).size; } catch { return []; }
    const len = Math.min(size, 2 * 1024 * 1024);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(f, 'r');
    try { fs.readSync(fd, buf, 0, len, size - len); } finally { fs.closeSync(fd); }
    const out = [];
    const linesArr = buf.toString('utf8').split('\n');
    if (len < size) linesArr.shift(); // première ligne probablement coupée
    for (const l of linesArr) { if (!l) continue; try { out.push(JSON.parse(l)); } catch { /* ligne abîmée */ } }
    return out.slice(-max);
  }

  function days() {
    return safeList().map(n => {
      let size = 0;
      try { size = fs.statSync(path.join(dir, n)).size; } catch { size = 0; }
      return { day: n.slice(0, 10), bytes: size };
    });
  }

  /** Export d'un jour en JSON (tableau) ou CSV, lu ligne à ligne. Résout false si le jour n'existe pas. */
  async function exportDay(day, format, res) {
    if (!DAY_RE.test(day)) return false;
    flush();
    const f = fileFor(day);
    if (!fs.existsSync(f)) return false;
    const csvCell = v => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // pas de formule exécutée à l'ouverture dans un tableur
      return `"${s.replace(/"/g, '""')}"`;
    };
    res.setHeader('Content-Disposition', `attachment; filename="agent-room-${day}.${format}"`);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
    const rl = require('readline').createInterface({ input: fs.createReadStream(f, 'utf8'), crlfDelay: Infinity });
    let first = true;
    res.write(format === 'csv' ? '﻿' + CSV_FIELDS.join(',') + '\n' : '[\n');
    for await (const l of rl) {
      if (!l) continue;
      let e; try { e = JSON.parse(l); } catch { continue; }
      const chunk = format === 'csv'
        ? CSV_FIELDS.map(k => csvCell(k === 'timestamp' ? new Date(e.timestamp).toISOString() : e[k])).join(',') + '\n'
        : (first ? '' : ',\n') + l;
      first = false;
      if (!res.write(chunk)) await new Promise(r => res.once('drain', r));
    }
    if (format !== 'csv') res.write('\n]\n');
    res.end();
    return true;
  }

  function close() { flush(); clearInterval(timer); clearInterval(daily); }

  cleanup();
  return { append, flush, tail, days, exportDay, cleanup, close, enabled: () => ok, today: () => dayOf(Date.now()) };
}

module.exports = { createHistory, dayOf, CSV_FIELDS };
