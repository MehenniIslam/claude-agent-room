/*
 * Protections du serveur local.
 *
 * La chambre affiche des données sensibles (prompts, commandes, chemins de
 * fichiers). Sans garde-fou, n'importe quel site ouvert dans ton navigateur
 * pourrait les lire via ws://localhost:3030 ou y injecter des événements.
 *
 *   - Hôte autorisé : l'en-tête Host doit désigner la machine (anti DNS rebinding).
 *   - Même origine : une requête de navigateur (en-tête Origin) doit venir de la
 *     page de la chambre elle-même, pour HTTP comme pour le WebSocket.
 *   - Jeton : facultatif en local (AGENT_ROOM_TOKEN), obligatoire et généré
 *     automatiquement dès que le serveur écoute sur le réseau.
 *   - Limite de débit par adresse, en-têtes de sécurité (CSP stricte, anti iframe…).
 */
const crypto = require('crypto');
const os = require('os');

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLoopback(host) {
  const h = String(host || '').toLowerCase();
  return LOOPBACK_NAMES.has(h) || /^127\.\d+\.\d+\.\d+$/.test(h) || h.endsWith('.localhost');
}

/** "exemple.com:3030" → "exemple.com", "[::1]:3030" → "[::1]". */
function hostnameOf(hostHeader) {
  const h = String(hostHeader || '').trim().toLowerCase();
  if (!h) return '';
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  return h.split(':')[0];
}

function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) out.push(a.family === 'IPv6' || a.family === 6 ? `[${a.address.split('%')[0]}]` : a.address);
  }
  return out;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createGuard({ host = '127.0.0.1', token = '', allowedHosts = [] } = {}) {
  const exposed = !isLoopback(host);
  const allowAny = allowedHosts.includes('*');
  const allowed = new Set(['localhost', '127.0.0.1', '[::1]']);
  for (const h of allowedHosts) if (h && h !== '*') allowed.add(hostnameOf(h));
  if (exposed) {
    if (host === '0.0.0.0' || host === '::') localAddresses().forEach(a => allowed.add(a));
    else allowed.add(hostnameOf(host));
    allowed.add(os.hostname().toLowerCase());
  }
  const generated = exposed && !token;
  const secret = token || (generated ? crypto.randomBytes(18).toString('base64url') : '');

  function hostAllowed(hostHeader) {
    const name = hostnameOf(hostHeader);
    if (!name) return false;
    return allowAny || allowed.has(name) || name.endsWith('.localhost');
  }

  /** Pas d'Origin = client hors navigateur (hook, curl, script) : accepté. */
  function originAllowed(origin, hostHeader) {
    if (!origin) return true;
    try {
      const u = new URL(origin);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.host.toLowerCase() === String(hostHeader || '').toLowerCase();
    } catch {
      return false;
    }
  }

  function tokenFrom(req) {
    const header = req.headers['x-agent-room-token'];
    if (header) return String(header);
    const auth = String(req.headers.authorization || '');
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    try { return new URL(req.url, 'http://x').searchParams.get('token') || ''; } catch { return ''; }
  }

  function tokenOk(req) {
    if (!secret) return true;
    const t = tokenFrom(req);
    return Boolean(t) && safeEqual(t, secret);
  }

  /** Vérifie une requête ; retourne null si tout va bien, sinon { status, error }. */
  function check(req, { needToken = true } = {}) {
    if (!hostAllowed(req.headers.host)) return { status: 403, error: 'Hôte non autorisé' };
    if (!originAllowed(req.headers.origin, req.headers.host)) return { status: 403, error: 'Origine non autorisée' };
    if (needToken && !tokenOk(req)) return { status: 401, error: 'Jeton manquant ou invalide (AGENT_ROOM_TOKEN)' };
    return null;
  }

  return { check, hostAllowed, originAllowed, tokenOk, token: secret, generated, exposed };
}

/** Seau à jetons par clé (adresse IP ou connexion). */
function createRateLimiter({ capacity = 1500, refillPerSec = 150 } = {}) {
  const buckets = new Map();
  setInterval(() => {
    const t = Date.now();
    for (const [k, b] of buckets) if (t - b.at > 60_000) buckets.delete(k);
  }, 60_000).unref();
  return function take(key, cost = 1) {
    const t = Date.now();
    const b = buckets.get(key) || { tokens: capacity, at: t };
    b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 1000) * refillPerSec);
    b.at = t;
    buckets.set(key, b);
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  };
}

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self' ws://${req.headers.host} wss://${req.headers.host}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
}

module.exports = { createGuard, createRateLimiter, securityHeaders, isLoopback, hostnameOf };
