import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-room',
  component: 'Pane',
  requestId: 'agent-room',
  props: { title: 'Agent Room', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const FILES: Record<string, string> = {
  '/site/style.css': 'body {\n  color: black;\n}\n',
  '/site/old.css': 'a {\n  b: c;\n}\n',
  '/site/m.txt': 'un\ndeux\ntrois\nquatre\nquatre\n',
}

async function setup($: any, on: any, stored?: Record<string, unknown>) {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  mock.store(on, stored)
  on('command.register', () => ({ value: { command: 'agent-room' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  let spawned = 0
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a' + ++spawned }))
  on('fs.exists', (_: any, e: any) => ({ value: e.path in FILES }))
  on('fs.read', (_: any, e: any) => ({ value: FILES[e.path] ?? '' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  await $.session.start({ cwd: '/site', surface: 'desktop', isInteractive: true })
  return clock
}

test('un sous-agent crée et modifie des fichiers, visibles dans le panneau', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn({ prompt: 'Écris le HTML du site', description: 'Coder le HTML', subagentType: 'general-purpose' })
  await clock.advance(3000)
  await $.tool.call({ tool: 'Write', file_path: '/site/index.html', content: '<h1>Le Pain Doré</h1>\n<p>Bienvenue</p>\n', agentId: 'a1' } as any)
  await $.tool.call({ tool: 'Edit', file_path: '/site/style.css', old_string: '  color: black;', new_string: '  color: #6b3e26;\n  font-family: serif;', agentId: 'a1' } as any)
  await clock.advance(1500)

  for (const surface of ['desktop', 'terminal', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface } as any)
    expect(await ui.find({ type: 'Button', text: /index\.html/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /style\.css/ })).toBeDefined()
    const code = await ui.find({ type: 'Code' })
    expect(String(code?.props.source)).toContain('+  font-family: serif;')
    expect(String(code?.props.source)).toContain('@@ -2,1 +2,2 @@')
    if (surface !== 'terminal') {
      const svg = await ui.find({ type: 'Svg' })
      expect(String(svg?.props.source).length).toBeGreaterThan(5000)
      expect(String(svg?.props.source).length).toBeLessThan(131072)
      if (surface === 'desktop') console.log('SVG_WORK<<<' + String(svg?.props.source) + '>>>')
    }
    await ui.unmount()
  }

  // fin de mission puis retraite à la pompe
  await $.turn.complete({ answer: 'HTML et CSS prêts.', durationMs: 1000, isAborted: false, turnId: 't1', agentId: 'a1', reason: 'answer' } as any)
  await clock.advance(9000)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Text', text: /pause|loge|barbecue|récré/i })).toBeDefined()
  await ui.unmount()
  await clock.advance(6200)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  const svg = await ui.find({ type: 'Svg' })
  expect(String(svg?.props.source)).toContain('BANG')
  console.log('SVG_BANG<<<' + String(svg?.props.source) + '>>>')
  await ui.unmount()
  await clock.advance(8000)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).not.toContain('BANG')
  expect(await ui.find({ type: 'Text', text: /pompe/ })).toBeDefined()
  await ui.unmount()
})

test('le monde choisi change la chambre', async ($, on) => {
  await setup($, on)
  for (const world of ['opera', 'garden', 'classroom']) {
    const first = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
    await (first as any).select({ key: 'world', value: world })
    await first.unmount()
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
    const src = String((await ui.find({ type: 'Svg' }))?.props.source)
    expect(src).toContain(world === 'opera' ? "Chef d" : world === 'garden' ? 'Jardinier' : 'Professeur')
    await ui.unmount()
  }
})

test('Claude se lève pour travailler seul, puis revient à son bureau', async ($, on) => {
  const clock = await setup($, on)
  await $.tool.call({ tool: 'Read', file_path: '/site/style.css' } as any)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  let src = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(src).toContain('<animateMotion')
  expect(src).toContain('Claude · Orchestrateur')
  await ui.unmount()
  await clock.advance(8000)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  src = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(src).toContain('<animateMotion') // il revient vers son bureau
  await ui.unmount()
  await clock.advance(10000)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  src = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(src).not.toContain('<animateMotion')
  await ui.unmount()
})

test('la chambre remplit la largeur du panneau, quelle que soit sa taille', async ($, on) => {
  await setup($, on)
  for (const bodyColumns of [40, 60, 160]) {
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns }, surface: 'desktop' } as any)
    const svg = await ui.find({ type: 'Svg' })
    // pas de taille imposée ni de cadre interactif (qui retombait à ~150 px de haut)
    expect(svg?.props.width).toBeUndefined()
    expect(svg?.props.height).toBeUndefined()
    expect(svg?.props.isInteractive).toBeFalsy()
    const src = String(svg?.props.source)
    expect(src).toContain('width="1280" height="832"')
    expect(src).toContain('viewBox="0 0 320 208"')
    await ui.unmount()
  }
})

test('le mode « Chambre seule » masque fichiers et journal, et reste mémorisé', async ($, on) => {
  await setup($, on)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Text', text: /Journal/ })).toBeDefined()
  await ui.press({ key: 'big' })
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Journal/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /Tout afficher/ })).toBeDefined()
  await ui.unmount()
})

test('le mode « Chambre seule » enregistré est repris à la session suivante', async ($, on) => {
  await setup($, on, { prefs: { world: 'studio', ending: 'pompe', big: true } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Text', text: /Journal/ })).toBeUndefined()
  await ui.unmount()
})

test('un long diff est replié, puis dépliable', async ($, on) => {
  await setup($, on)
  const content = Array.from({ length: 40 }, (_, i) => `ligne ${i + 1}`).join('\n')
  await $.tool.call({ tool: 'Write', file_path: '/site/long.txt', content } as any)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  let code = await ui.find({ type: 'Code' })
  expect(String(code?.props.source)).toContain('@@ -1,0 +1,10 @@')
  expect(String(code?.props.source)).not.toContain('ligne 11')
  await ui.press({ key: 'diff-toggle' })
  code = await ui.find({ type: 'Code' })
  expect(String(code?.props.source)).toContain('ligne 40')
  await ui.unmount()
})

test('réécrire un fichier existant avec Write compte et montre les lignes retirées', async ($, on) => {
  await setup($, on)
  await $.tool.call({ tool: 'Write', file_path: '/site/old.css', content: 'x\ny\n' } as any)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Button', text: /old\.css \+2 −3/ })).toBeDefined()
  const src = String((await ui.find({ type: 'Code' }))?.props.source)
  expect(src).toContain('@@ -1,3 +1,2 @@')
  expect(src).toContain('-  b: c;')
  expect(src).toContain('+x')
  await ui.unmount()
})

test('MultiEdit enchaîne ses modifications et Edit replace_all compte chaque occurrence', async ($, on) => {
  await setup($, on)
  await $.tool.call({ tool: 'MultiEdit', file_path: '/site/m.txt', edits: [{ old_string: 'deux', new_string: 'DEUX' }, { old_string: 'DEUX\ntrois', new_string: 'D3' }] } as any)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Button', text: /m\.txt \+2 −3/ })).toBeDefined()
  // la 2e modification porte sur le texte déjà changé : ligne 2, pas 1
  expect(String((await ui.find({ type: 'Code' }))?.props.source)).toContain('@@ -2,2 +2,1 @@\n-DEUX\n-trois\n+D3')
  await ui.unmount()
  await $.tool.call({ tool: 'Edit', file_path: '/site/m.txt', old_string: 'quatre', new_string: '4', replace_all: true } as any)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Button', text: /m\.txt \+4 −5/ })).toBeDefined()
  await ui.unmount()
})

test('un nom de fichier très long est coupé au milieu', async ($, on) => {
  await setup($, on)
  const long = '/site/' + 'nom-de-fichier-vraiment-tres-long-sans-espaces-'.repeat(4) + 'fin.tsx'
  await $.tool.call({ tool: 'Write', file_path: long, content: 'x' } as any)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface } as any)
    const btn = await ui.find({ type: 'Button', text: /fin\.tsx/ })
    const label = String((btn?.props as any).label)
    expect(label).toContain('…')
    expect(label.length).toBeLessThan(80)
    await ui.unmount()
  }
})

test('avec 60 sous-agents au travail, le SVG reste sous 131 072 caractères', async ($, on) => {
  const clock = await setup($, on)
  for (let i = 0; i < 60; i++) await $.agent.spawn({ prompt: 'tâche ' + i, description: 'Agent au nom plutôt long ' + i, subagentType: 'general-purpose' })
  await clock.advance(3000)
  for (let i = 1; i <= 60; i++) await $.tool.call({ tool: 'Bash', command: 'echo ' + 'w'.repeat(200), agentId: 'a' + i } as any)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  const src = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(src.length).toBeLessThan(131072)
  expect(src).toContain('Claude')
  // le texte liste toujours tout le monde
  expect(await ui.find({ type: 'Text', text: /60 sous-agents au travail/ })).toBeDefined()
  await ui.unmount()
})

test('le panneau propose la vue 3D du site, sur le port choisi', async ($, on) => {
  mock.env(on, { AGENT_ROOM_PORT: '3031' })
  await setup($, on)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface } as any)
    const link = await ui.find({ type: 'Link' })
    expect(link?.props.href).toBe('http://localhost:3031')
    expect(String(link?.props.label)).toContain('Vue 3D')
    await ui.unmount()
  }
})
