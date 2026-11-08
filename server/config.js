/*
 * Réglages persistants : ~/.claude/agent-room/config.json
 *   mode           "fun" (fusil à pompe, blagues) ou "pro" (sobre)       — AGENT_ROOM_MODE
 *   history        true : journal des événements sur disque              — AGENT_ROOM_HISTORY=0 pour couper
 *   retentionDays  jours de journal conservés (1 à 365)                  — AGENT_ROOM_RETENTION_DAYS
 * Les variables d'environnement l'emportent sur le fichier.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.claude', 'agent-room');
const FILE = path.join(DIR, 'config.json');
const DEFAULTS = { mode: 'fun', history: true, retentionDays: 14 };

function loadConfig(env = process.env) {
  let file = {};
  try { file = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { file = {}; }
  const cfg = { ...DEFAULTS, ...(file && typeof file === 'object' ? file : {}) };
  if (env.AGENT_ROOM_MODE) cfg.mode = env.AGENT_ROOM_MODE;
  if (env.AGENT_ROOM_HISTORY !== undefined) cfg.history = env.AGENT_ROOM_HISTORY !== '0';
  if (env.AGENT_ROOM_RETENTION_DAYS) cfg.retentionDays = Number(env.AGENT_ROOM_RETENTION_DAYS);
  cfg.mode = cfg.mode === 'pro' ? 'pro' : 'fun';
  cfg.history = cfg.history !== false;
  cfg.retentionDays = Math.min(365, Math.max(1, Math.round(Number(cfg.retentionDays) || DEFAULTS.retentionDays)));
  return cfg;
}

function saveConfig(patch) {
  let current = {};
  try { current = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { current = {}; }
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ ...current, ...patch }, null, 2));
  fs.renameSync(tmp, FILE);
}

module.exports = { loadConfig, saveConfig, DIR, FILE };
