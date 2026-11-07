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

function describeTool(tool, input = {}) {
  const file = input.file_path || input.notebook_path || input.path || '';
  switch (tool) {
    case 'Read': return { file, message: `Je lis ${file || 'un fichier'}` };
    case 'Write': return { file, message: `J'écris ${file || 'un fichier'}` };
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': return { file, message: `Je modifie ${file || 'un fichier'}` };
    case 'Grep': return { file, message: `grep "${short(input.pattern, 40)}"${input.path ? ' dans ' + input.path : ''}` };
    case 'Glob': return { file, message: `Je cherche ${short(input.pattern, 50)}` };
    case 'Bash': return { file: '', message: `$ ${short(input.command, 90)}` };
    case 'WebSearch': return { file: '', message: `Recherche web : ${short(input.query, 70)}` };
    case 'WebFetch': return { file: '', message: `Je consulte ${short(input.url, 70)}` };
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate': return { file: '', message: 'Je mets à jour la liste de tâches' };
    default: return { file, message: `Outil ${tool}` };
  }
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
  }

  isRawHook(body) {
    return body && typeof body === 'object' && typeof body.hook_event_name === 'string';
  }

  activeSub(agentRef) {
    if (agentRef && this.byAgentRef.has(agentRef)) return this.byAgentRef.get(agentRef);
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const s = this.subs.get(this.stack[i]);
      if (s && !s.done) return s.id;
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
      return [{ ...base, type: 'AGENT_MESSAGE', agentId: MAIN_ID, message: `Nouvelle demande : ${short(p.prompt, 160)}` }];
    }

    if (ev === 'Stop') {
      return [{ ...base, type: 'AGENT_MESSAGE', agentId: MAIN_ID, message: "J'ai terminé ce tour, j'attends la suite." }];
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
      this.finish(id);
      const failed = ev === 'PostToolUseFailure' || isFailure(p.tool_response);
      const out = [];
      if (failed) out.push({ ...base, type: 'ERROR', agentId: id, message: short(extractText(p.tool_response) || p.error || 'Échec du sous-agent', 140) });
      out.push({ ...base, type: 'SUBAGENT_COMPLETE', agentId: id, targetAgentId: MAIN_ID, message: short(extractText(p.tool_response) || 'Mission terminée.', 180) });
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
      return [{ ...base, type: 'SUBAGENT_COMPLETE', agentId: id, targetAgentId: MAIN_ID, message: short(p.last_assistant_message || 'Mission terminée.', 180) }];
    }

    if (ev === 'PreToolUse' && tool) {
      const agentId = this.activeSub(p.agent_id);
      const d = describeTool(tool, input);
      return [{ ...base, type: 'TOOL_START', agentId, tool, file: d.file, message: d.message }];
    }

    if ((ev === 'PostToolUse' || ev === 'PostToolUseFailure') && tool) {
      const agentId = this.activeSub(p.agent_id);
      const failed = ev === 'PostToolUseFailure' || isFailure(p.tool_response);
      const out = [{ ...base, type: 'TOOL_END', agentId, tool, success: !failed, message: failed ? short(extractText(p.tool_response) || p.error || 'Échec', 120) : '' }];
      if (failed) out.push({ ...base, type: 'ERROR', agentId, tool, message: `${tool} a échoué : ${short(extractText(p.tool_response) || p.error, 100)}` });
      return out;
    }

    return [];
  }
}

module.exports = { HookNormalizer, MAIN_ID, inferRole, short };
