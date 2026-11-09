/*
 * Traduit les payloads bruts des Hooks Claude Code (stdin JSON) en
 * événements du protocole claude-agent-room.
 *
 * Claude Code n'indique pas toujours quel sous-agent appelle un outil.
 * Règle d'attribution, dans l'ordre :
 *   1. payload.agent_id connu (versions récentes de Claude Code)
 *   2. sinon le dernier sous-agent encore actif (pile des Task/Agent en cours)
 *   3. sinon l'orchestrateur "claude-main"
 * Avec plusieurs sous-agents en parallèle, l'étape 2 est une approximation.
 */

const MAIN_ID = 'claude-main';
const SPAWN_TOOLS = new Set(['Task', 'Agent', 'dispatch_subagent']);
const MAX_TRACKED = 300; // sous-agents mémorisés au plus (les actifs ne sont jamais oubliés)

function short(text, max = 140) {
  if (text == null) return '';
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function inferRole(text) {
  const t = String(text || '').toLowerCase();
  if (/(test|qa|verif|vérif|spec)/.test(t)) return 'Tester';
  if (/(review|relect|audit)/.test(t)) return 'Reviewer';
  if (/(debug|bug|fix|corrig)/.test(t)) return 'Debugger';
  if (/(plan|archi|design|concep)/.test(t)) return 'Architect';
  if (/(explor|search|research|recherch|find|cherch|read|lis|analy)/.test(t)) return 'Researcher';
  return 'Coder';
}

const STOP_WORDS = new Set(['le', 'la', 'les', 'l', 'du', 'de', 'des', 'd', 'un', 'une', 'et', 'en', 'au', 'aux', 'pour', 'the', 'a', 'an', 'of', 'to', 'for', 'and']);

function prettyName(input) {
  const base = input.subagent_type && !['general-purpose', 'fork', 'teammate'].includes(input.subagent_type)
    ? input.subagent_type
    : (input.description || 'Agent');
  const words = String(base).replace(/[^\p{L}\p{N} _-]/gu, ' ').trim().split(/[\s_-]+/)
    .filter(w => w && !STOP_WORDS.has(w.toLowerCase())).slice(0, 2);
  const name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-') || 'Agent';
  return short(name, 18);
}

// `message` reste en français (compatibilité de l'API) ; `msg` = clé de traduction + valeurs,
// pour que chaque écran affiche le texte dans sa langue (voir public/i18n.js, clés « msg.* »).
function describeTool(tool, input = {}) {
  const file = input.file_path || input.notebook_path || input.path || '';
  switch (tool) {
    case 'Read': return { file, message: `Je lis ${file || 'un fichier'}`, msg: { k: 'read', a: { file } } };
    case 'Write': return { file, message: `J'écris ${file || 'un fichier'}`, msg: { k: 'write', a: { file } } };
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': return { file, message: `Je modifie ${file || 'un fichier'}`, msg: { k: 'edit', a: { file } } };
    case 'Grep': {
      const pattern = short(input.pattern, 40);
      return input.path
        ? { file, message: `grep "${pattern}" dans ${input.path}`, msg: { k: 'grepIn', a: { pattern, path: input.path } } }
        : { file, message: `grep "${pattern}"`, msg: { k: 'grep', a: { pattern } } };
    }
    case 'Glob': return { file, message: `Je cherche ${short(input.pattern, 50)}`, msg: { k: 'glob', a: { pattern: short(input.pattern, 50) } } };
    case 'Bash': return { file: '', message: `$ ${short(input.command, 90)}` };
    case 'WebSearch': return { file: '', message: `Recherche web : ${short(input.query, 70)}`, msg: { k: 'webSearch', a: { query: short(input.query, 70) } } };
    case 'WebFetch': return { file: '', message: `Je consulte ${short(input.url, 70)}`, msg: { k: 'webFetch', a: { url: short(input.url, 70) } } };
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate': return { file: '', message: 'Je mets à jour la liste de tâches', msg: { k: 'todo' } };
    default: return { file, message: `Outil ${tool}`, msg: { k: 'tool', a: { tool } } };
  }
}

const TODO_STATUS = new Set(['pending', 'in_progress', 'completed']);
const lines = t => (t ? String(t).replace(/\n$/, '').split('\n') : []);

/** Diff lisible d'une modification de fichier : lignes retirées (-) puis ajoutées (+). */
function makeDiff(tool, input) {
  const edits = tool === 'MultiEdit' ? (Array.isArray(input.edits) ? input.edits : [])
    : tool === 'Edit' ? [input]
    : tool === 'Write' ? [{ old_string: '', new_string: input.content }] : [];
  let added = 0, removed = 0;
  const parts = edits.slice(0, 20).map(e => {
    const o = lines(e.old_string), n = lines(e.new_string);
    removed += o.length; added += n.length;
    return [...o.map(l => `-${l}`), ...n.map(l => `+${l}`)].join('\n');
  });
  const diff = parts.join('\n@@\n');
  return diff ? { diff: diff.length > 6000 ? diff.slice(0, diff.lastIndexOf('\n', 6000)) + '\n…' : diff, added, removed } : {};
}

/** Champs en plus pour certains outils : liste de tâches (TodoWrite, TaskCreate/Update) et diffs. */
function toolExtras(tool, input) {
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    return { todos: input.todos.slice(0, 50).map(t => ({ content: short(t.content || t.activeForm, 160), status: TODO_STATUS.has(t.status) ? t.status : 'pending' })) };
  }
  if (tool === 'TaskCreate') return { task: { op: 'add', subject: short(input.subject || input.description, 160) } };
  if (tool === 'TaskUpdate') return { task: { op: 'update', id: short(input.taskId, 20), status: TODO_STATUS.has(input.status) ? input.status : undefined, subject: input.subject ? short(input.subject, 160) : undefined } };
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'Write') return makeDiff(tool, input);
  return {};
}

function extractText(resp) {
  if (resp == null) return '';
  if (typeof resp === 'string') return resp;
  if (Array.isArray(resp)) return resp.map(extractText).join(' ');
  if (Array.isArray(resp.content)) return resp.content.map(c => (c && c.text) || '').join(' ');
  if (typeof resp.content === 'string') return resp.content;
  if (resp.result) return extractText(resp.result);
  if (resp.text) return resp.text;
  if (resp.stdout || resp.stderr) return (resp.stdout || '') + ' ' + (resp.stderr || '');
  return '';
}

/**
 * Réponse de l'outil Agent quand le sous-agent part en arrière-plan : ce n'est pas son rapport.
 * Renvoie { agentRef } (l'agent_id annoncé, s'il y est) ou null.
 */
function asyncLaunch(resp) {
  if (resp && typeof resp === 'object' && (resp.status === 'async_launched' || resp.isAsync === true)) {
    return { agentRef: resp.agentId || resp.agent_id || null };
  }
  const text = extractText(resp);
  if (!/async agent launched|agent is working in the background|running in the background/i.test(text)) return null;
  const m = /agentId:\s*([\w-]+)/.exec(text);
  return { agentRef: m ? m[1] : null };
}

function isFailure(resp) {
  if (!resp || typeof resp !== 'object') return false;
  return Boolean(resp.is_error || resp.isError || resp.error || resp.interrupted ||
    (typeof resp.exitCode === 'number' && resp.exitCode !== 0) ||
    (typeof resp.exit_code === 'number' && resp.exit_code !== 0));
}

class HookNormalizer {
  constructor() {
    this.reset();
  }

  reset() {
    this.counter = 0;
    this.subs = new Map();        // id -> { id, name, toolUseId, agentRef, done }
    this.byToolUse = new Map();   // tool_use_id -> sub id
    this.byAgentRef = new Map();  // agent_id Claude Code -> sub id
    this.stack = [];              // sous-agents actifs, ordre de création
    this.callers = new Map();     // tool_use_id -> qui a commencé l'appel
  }

  isRawHook(body) {
    return body && typeof body === 'object' && typeof body.hook_event_name === 'string';
  }

  activeSub(agentRef) {
    if (agentRef && this.byAgentRef.has(agentRef)) return this.byAgentRef.get(agentRef);
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const s = this.subs.get(this.stack[i]);
      // Un sous-agent dont on connaît l'agent_id signe ses appels : un appel sans agent_id n'est pas le sien.
      if (s && !s.done && !s.agentRef) return s.id;
    }
    return MAIN_ID;
  }

  finish(subId) {
    const s = this.subs.get(subId);
    if (s) s.done = true;
    this.stack = this.stack.filter(id => id !== subId);
    this.prune();
  }

  /** Longues sessions : on oublie les plus vieux sous-agents terminés pour que la mémoire reste bornée. */
  prune(max = MAX_TRACKED) {
    if (this.subs.size <= max) return;
    for (const [id, s] of this.subs) {
      if (this.subs.size <= max) break;
      if (!s.done) continue;
      this.subs.delete(id);
      if (s.toolUseId) this.byToolUse.delete(s.toolUseId);
      if (s.agentRef) this.byAgentRef.delete(s.agentRef);
    }
  }

  /** Retourne une liste (éventuellement vide) d'événements normalisés. */
  convert(p) {
    const ev = p.hook_event_name;
    const tool = p.tool_name;
    const input = p.tool_input || {};
    const base = { source: 'claude-code', sessionId: p.session_id };

    if (ev === 'UserPromptSubmit') {
      return [{ ...base, type: 'AGENT_MESSAGE', agentId: MAIN_ID, message: `Nouvelle demande : ${short(p.prompt, 160)}`, msg: { k: 'newRequest', a: { text: short(p.prompt, 160) } } }];
    }

    // Fin d'un tour, ou Claude bloqué sur une permission / une question : la page prévient (son, notification).
    if (ev === 'Stop') {
      return [{ ...base, type: 'NOTIFY', kind: 'done', agentId: MAIN_ID, message: "J'ai terminé, à toi de jouer !", msg: { k: 'turnDone' } }];
    }
    if (ev === 'Notification') {
      return [{ ...base, type: 'NOTIFY', kind: 'waiting', agentId: MAIN_ID, message: short(p.message || "J'attends ta réponse.", 200), ...(p.message ? {} : { msg: { k: 'waiting' } }) }];
    }

    if (ev === 'PreToolUse' && SPAWN_TOOLS.has(tool)) {
      this.counter += 1;
      const id = `sub-${p.tool_use_id ? String(p.tool_use_id).slice(-6) : this.counter}`;
      const name = prettyName(input);
      const sub = { id, name, toolUseId: p.tool_use_id, agentRef: null, done: false };
      this.subs.set(id, sub);
      if (p.tool_use_id) this.byToolUse.set(p.tool_use_id, id);
      this.stack.push(id);
      // Sous-agents jamais clos (Claude interrompu…) : on ne les garde pas indéfiniment comme "actifs".
      while (this.stack.length > 100) this.finish(this.stack[0]);
      const roleHint = `${input.subagent_type || ''} ${input.description || ''} ${input.prompt || ''}`;
      return [{
        ...base,
        type: 'SUBAGENT_SPAWN',
        agentId: id,
        parentId: (p.agent_id && this.byAgentRef.get(p.agent_id)) || MAIN_ID,
        role: inferRole(roleHint),
        name,
        tool,
        message: short(input.description || input.prompt, 120),
        prompt: short(input.prompt, 2000)
      }];
    }

    if ((ev === 'PostToolUse' || ev === 'PostToolUseFailure') && SPAWN_TOOLS.has(tool)) {
      const id = (p.tool_use_id && this.byToolUse.get(p.tool_use_id)) || this.stack[0];
      if (!id || !this.subs.has(id) || this.subs.get(id).done) return [];
      const launched = asyncLaunch(p.tool_response);
      if (launched && ev === 'PostToolUse') {
        // Sous-agent lancé en arrière-plan : il travaille encore, son rapport viendra avec SubagentStop.
        const sub = this.subs.get(id);
        if (launched.agentRef && !sub.agentRef) {
          sub.agentRef = launched.agentRef;
          this.byAgentRef.set(launched.agentRef, id);
        }
        return [];
      }
      this.finish(id);
      const failed = ev === 'PostToolUseFailure' || isFailure(p.tool_response);
      const out = [];
      if (failed) { const why = short(extractText(p.tool_response) || p.error, 140); out.push({ ...base, type: 'ERROR', agentId: id, message: why || 'Échec du sous-agent', ...(why ? {} : { msg: { k: 'subagentFailed' } }) }); }
      { const report = short(extractText(p.tool_response), 180); out.push({ ...base, type: 'SUBAGENT_COMPLETE', agentId: id, targetAgentId: MAIN_ID, message: report || 'Mission terminée.', ...(report ? {} : { msg: { k: 'missionDone' } }) }); }
      return out;
    }

    if (ev === 'SubagentStart') {
      // Associe l'identifiant interne de Claude Code au dernier spawn non lié.
      const pending = [...this.stack].reverse().map(id => this.subs.get(id)).find(s => s && !s.agentRef);
      if (pending && p.agent_id) {
        pending.agentRef = p.agent_id;
        this.byAgentRef.set(p.agent_id, pending.id);
      }
      return [];
    }

    if (ev === 'SubagentStop') {
      const id = (p.agent_id && this.byAgentRef.get(p.agent_id)) || null;
      // Sans agent_id fiable, on laisse PostToolUse(Task) clore la mission.
      if (!id || this.subs.get(id).done) return [];
      this.finish(id);
      return [{ ...base, type: 'SUBAGENT_COMPLETE', agentId: id, targetAgentId: MAIN_ID, message: short(p.last_assistant_message || 'Mission terminée.', 180), ...(p.last_assistant_message ? {} : { msg: { k: 'missionDone' } }) }];
    }

    if (ev === 'PreToolUse' && tool === 'SubagentHandback') {
      // Un sous-agent en arrière-plan remet son rapport par cet outil : c'est sa fin de mission.
      const id = p.agent_id && this.byAgentRef.get(p.agent_id);
      if (!id || !this.subs.has(id) || this.subs.get(id).done) return [];
      this.finish(id);
      return [{ ...base, type: 'SUBAGENT_COMPLETE', agentId: id, targetAgentId: MAIN_ID, message: short(input.message || 'Mission terminée.', 180), ...(input.message ? {} : { msg: { k: 'missionDone' } }) }];
    }

    if (ev === 'PreToolUse' && tool) {
      const agentId = p.main_loop === true ? MAIN_ID : this.activeSub(p.agent_id);
      if (p.tool_use_id) {
        this.callers.set(p.tool_use_id, agentId);
        if (this.callers.size > 2000) this.callers.delete(this.callers.keys().next().value);
      }
      const d = describeTool(tool, input);
      return [{ ...base, type: 'TOOL_START', agentId, tool, file: d.file, message: d.message, ...(d.msg ? { msg: d.msg } : {}), ...toolExtras(tool, input) }];
    }

    if ((ev === 'PostToolUse' || ev === 'PostToolUseFailure') && tool) {
      // La fin d'un appel revient à celui qui l'a commencé, même si un sous-agent est né entre-temps.
      const started = p.tool_use_id && this.callers.get(p.tool_use_id);
      if (p.tool_use_id) this.callers.delete(p.tool_use_id);
      const agentId = started && (started === MAIN_ID || this.subs.has(started)) ? started : this.activeSub(p.agent_id);
      // Un sous-agent qui a déjà remis son rapport (SubagentHandback) ne doit pas « revenir » au travail.
      if (tool === 'SubagentHandback' || (agentId !== MAIN_ID && this.subs.get(agentId)?.done)) return [];
      const failed = ev === 'PostToolUseFailure' || isFailure(p.tool_response);
      const why = failed ? short(extractText(p.tool_response) || p.error, 120) : '';
      const out = [{ ...base, type: 'TOOL_END', agentId, tool, success: !failed, message: failed ? why || 'Échec' : '', ...(failed && !why ? { msg: { k: 'failure' } } : {}) }];
      if (failed) out.push({ ...base, type: 'ERROR', agentId, tool, message: `${tool} a échoué : ${short(why, 100)}`, msg: { k: 'failed', a: { tool, why: short(why, 100) } } });
      return out;
    }

    return [];
  }
}

module.exports = { HookNormalizer, MAIN_ID, inferRole, short, makeDiff, toolExtras, asyncLaunch };
