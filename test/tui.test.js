const test = require('node:test');
const assert = require('node:assert/strict');
const tui = require('../tui/index.js');
const demo = require('../public/demo-scenario.js');

const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');

test('mode terminal : la démo place les agents à leur poste', () => {
  tui.handle({ type: 'RESET' }, true);
  for (const { at, ...e } of demo.steps) tui.handle(e, true);
  const st = tui._state();
  const qa = [...st.agents.values()].find(a => a.name === 'QA');
  assert.ok(qa && qa.done, 'QA a rendu son rapport');
  assert.equal(qa.station, 'lounge');
  assert.ok([...st.files.keys()].includes('src/server/oauth.ts'));
});

test('mode terminal : une image a les bonnes dimensions', () => {
  const map = tui.renderMap(60, 18, Date.now());
  assert.equal(map.length, 18);
  for (const l of map) assert.equal([...strip(l)].length, 60);
  const panel = tui.renderPanel(50, 20, Date.now());
  for (const l of panel) assert.equal([...strip(l)].length, 50);
});

test('mode terminal : mémoire bornée sur une longue session', () => {
  tui.handle({ type: 'RESET' }, true);
  for (let i = 0; i < 500; i++) {
    tui.handle({ type: 'SUBAGENT_SPAWN', agentId: `a${i}`, name: `Agent${i}`, role: 'Coder' }, true);
    tui.handle({ type: 'TOOL_START', agentId: `a${i}`, tool: 'Edit', file: `src/f${i}.ts` }, true);
    tui.handle({ type: 'SUBAGENT_COMPLETE', agentId: `a${i}`, message: 'ok' }, true);
  }
  const st = tui._state();
  assert.ok(st.agents.size <= 41);
  assert.ok(st.log.length <= 200);
  assert.ok(st.files.size <= 100);
});

test('mondes : 4 thèmes complets, chargeables hors navigateur', () => {
  require('../public/worlds.js');
  const worlds = globalThis.ROOM_WORLDS;
  assert.deepEqual(Object.keys(worlds), ['studio', 'opera', 'garden', 'classroom']);
  for (const w of Object.values(worlds)) {
    assert.ok(w.name && w.icon && w.claudeTitle, w.id);
    for (const k of ['floorA', 'floorB', 'wallBack', 'wallLeft', 'wood', 'sofa', 'board']) assert.match(w.pal[k], /^#[0-9a-f]{6}$/i, `${w.id}.${k}`);
    assert.ok(Array.isArray(w.pal.items) && w.pal.items.length > 0);
  }
});
