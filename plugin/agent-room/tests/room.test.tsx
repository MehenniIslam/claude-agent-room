import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-room',
  component: 'Pane',
  requestId: 'agent-room',
  props: { title: 'Agent Room', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const FILES: Record<string, string> = { '/site/style.css': 'body {\n  color: black;\n}\n' }

async function setup($: any, on: any) {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'agent-room' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
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
