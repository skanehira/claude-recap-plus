import type { On, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'session-brief'
const SURFACES = ['terminal', 'desktop'] as const
const START = 1_790_000_000_000

const QUESTIONS = [
  {
    question: 'Q1: 一覧で見たいですか?',
    header: '一覧要件',
    multiSelect: false,
    options: [
      { label: 'A: 一覧したい', description: '全セッションを並べる' },
      { label: 'B: 切り替え先で分かれば良い', description: '詳細だけ見る' },
    ],
  },
]

const bandOn = (surface: (typeof SURFACES)[number]) => ({
  plugin: PLUGIN,
  surface,
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
})

// The engine's own answers beneath the plugin, for the events it passes on.
const standInForEngine = (on: On, transcript: readonly SessionMessage[] = []) => {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [...transcript] }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
}

const bandRows = async ($: Engine, surface: (typeof SURFACES)[number]) => {
  const ui = await $.ui.mount(bandOn(surface))
  const rows = (await ui.findAll({ type: 'Text' })).map(found => found.text)
  await ui.unmount()

  return rows
}

const startInteractive = ($: Engine) =>
  $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

test('AskUserQuestion のダイアログの間も 1 行目は作業中のままにする', async ($, on) => {
  mock.clock(on, { now: START })
  standInForEngine(on)
  const seen: Record<string, string[]> = {}
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    for (const surface of SURFACES) seen[surface] = await bandRows($, surface)

    return {
      result: {
        questions: QUESTIONS,
        answers: { [QUESTIONS[0]!.question]: 'B: 切り替え先で分かれば良い' },
      },
    }
  })

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })
  await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS })

  for (const surface of SURFACES) {
    expect(seen[surface]?.[0], surface).toBe('T1 ▶ 作業中 0s')
  }
})

const ANSWERED = {
  result: {
    questions: QUESTIONS,
    answers: { [QUESTIONS[0]!.question]: 'B: 切り替え先で分かれば良い' },
  },
}

const completeTurn = ($: Engine, answer: string, turnId: string, agentId?: string) =>
  $.turn.complete({
    answer,
    durationMs: 1000,
    isAborted: false,
    turnId,
    reason: 'answer',
    ...(agentId === undefined ? {} : { agentId }),
  })

test('ターンが終わると 1 行目が応答済みと経過時間と直近の質問と回答になる', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)
  on('tool.call', { tool: 'AskUserQuestion' }, () => ANSWERED)
  on('model.complete', () => ({
    value: {
      isAnswered: false,
      reason: 'empty-reply',
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })
  await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS })
  await completeTurn($, '方針を決めました', 't1')
  await clock.set(START + 3 * 60_000)

  for (const surface of SURFACES) {
    expect((await bandRows($, surface))[0], surface).toBe(
      'T1 ✓ 応答済み 3m前 · 一覧要件=B: 切り替え先で分かれば良い',
    )
  }
})

test('ターンの実行中は 1 行目が作業中と経過時間になる', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })
  await clock.set(START + 2 * 60_000 + 5_000)

  for (const surface of SURFACES) {
    expect((await bandRows($, surface))[0], surface).toBe('T1 ▶ 作業中 2m')
  }
})

test('権限確認ダイアログの間も 1 行目は作業中のままにする', async ($, on) => {
  mock.clock(on, { now: START })
  standInForEngine(on)
  on('classic.PermissionRequest', () => ({}))
  const seen: string[] = []
  on('tool.call', { tool: 'Bash' }, async () => {
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } })
    seen.push((await bandRows($, 'terminal'))[0] ?? '')

    return { result: { stdout: '', stderr: '', interrupted: false } }
  })

  await startInteractive($)
  await $.turn.start({ text: '一覧して', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(seen).toEqual(['T1 ▶ 作業中 0s'])
})

const NO_USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

const replyWith = (text: string) => ({ value: { isAnswered: true as const, text, usage: NO_USAGE } })

test('最初の要約ができるまで 2 行目は要約待ちになる', async ($, on) => {
  mock.clock(on, { now: START })
  standInForEngine(on)

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })

  for (const surface of SURFACES) {
    expect((await bandRows($, surface))[1], surface).toBe('目的: (要約待ち)')
  }
})

test('ターンが終わると Haiku に要約させ、2 行目に出す', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)
  const models: string[] = []
  on('model.complete', (_$, e) => {
    models.push(e.model)

    return replyWith('セッション要約パネルの設計を承認待ち')
  })

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })
  await completeTurn($, '計画を書きました', 't1')
  await clock.settle()

  expect(models).toEqual(['haiku'])
  for (const surface of SURFACES) {
    expect((await bandRows($, surface))[1], surface).toBe('目的: セッション要約パネルの設計を承認待ち')
  }
})

test('Haiku が答えないときは最終回答の最初の本文行を要約に使う', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)
  on('model.complete', () => ({
    value: {
      isAnswered: false,
      reason: 'api-error',
      status: 404,
      error: 'invalid_request',
      usage: NO_USAGE,
    },
  }))

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })
  await completeTurn($, '## 結論\n\n**Mods で作る方針に決めた。** 理由は 2 つ。\n- 型がある', 't1')
  await clock.settle()

  expect((await bandRows($, 'terminal'))[1]).toBe('目的: Mods で作る方針に決めた。 理由は 2 つ。')
})

test('subagent のターンでは記録も要約もしない', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)
  let calls = 0
  on('model.complete', () => {
    calls += 1

    return replyWith('メインの要約')
  })

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })
  await completeTurn($, 'メインの回答', 't1')
  await clock.settle()
  await completeTurn($, 'サブエージェントの回答', 't2', 'agent-1')
  await clock.settle()

  expect(calls).toBe(1)
  expect(await bandRows($, 'terminal')).toEqual(['T1 ✓ 応答済み 0s前', '目的: メインの要約'])
})

test('非対話プロセスでは記録も要約もせず、対話で始め直すと T1 から数える', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)
  let calls = 0
  on('model.complete', () => {
    calls += 1

    return replyWith('対話の要約')
  })

  await $.session.start({ cwd: '/work', surface: null, isInteractive: false })
  await $.turn.start({ text: 'headless の依頼', turnId: 'h1' })
  await completeTurn($, 'headless の回答', 'h1')
  await clock.settle()
  const callsWhileHeadless = calls

  await startInteractive($)
  await $.turn.start({ text: '対話の依頼', turnId: 't1' })
  await completeTurn($, '対話の回答', 't1')
  await clock.settle()

  expect([callsWhileHeadless, calls]).toEqual([0, 1])
  expect(await bandRows($, 'terminal')).toEqual(['T1 ✓ 応答済み 0s前', '目的: 対話の要約'])
})

test('/clear で状態を空にし、次のターンを T1 から数える', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)
  on('model.complete', () => replyWith('クリア前の要約'))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

  await startInteractive($)
  await $.turn.start({ text: 'クリア前の依頼', turnId: 't1' })
  await completeTurn($, 'クリア前の回答', 't1')
  await clock.settle()
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  await $.turn.start({ text: 'クリア後の依頼', turnId: 't2' })

  expect(await bandRows($, 'terminal')).toEqual(['T1 ▶ 作業中 0s', '目的: (要約待ち)'])
})

const RESUMED = [
  { role: 'user' as const, text: '最初の依頼', toolUses: [] },
  {
    role: 'assistant' as const,
    text: '質問します',
    toolUses: [
      {
        tool_use_id: 'toolu_1',
        tool: 'AskUserQuestion',
        input: { questions: QUESTIONS },
        result: ANSWERED.result,
      },
    ],
  },
  {
    role: 'user' as const,
    text: '',
    toolUses: [],
    toolResults: [{ tool_use_id: 'toolu_1', text: 'answered', isError: false, result: ANSWERED.result }],
  },
  { role: 'assistant' as const, text: '方針を決めました', toolUses: [] },
  { role: 'user' as const, text: '<system-reminder>注入された行</system-reminder>', toolUses: [] },
  { role: 'user' as const, text: '次の依頼', toolUses: [] },
  { role: 'assistant' as const, text: '実装しました', toolUses: [] },
]

test('resume で始まると transcript から状態を作り直し、要約を 1 回だけ作る', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on, RESUMED)
  const prompts: string[] = []
  on('model.complete', (_$, e) => {
    prompts.push(e.prompt)

    return replyWith('再開したセッションの要約')
  })

  await startInteractive($)
  await clock.settle()

  expect(prompts).toHaveLength(1)
  expect(await bandRows($, 'terminal')).toEqual(['T2 ✓ 応答済み', '目的: 再開したセッションの要約'])
})

test('reload で session.start が再び来ても、記録済みの状態を作り直さない', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on, RESUMED)
  let calls = 0
  on('model.complete', () => {
    calls += 1

    return replyWith('このセッションの要約')
  })

  await startInteractive($)
  await clock.settle()
  await $.turn.start({ text: '三つ目の依頼', turnId: 't3' })
  await startInteractive($)
  await clock.settle()

  expect(calls).toBe(1)
  expect(await bandRows($, 'terminal')).toEqual(['T3 ▶ 作業中 0s', '目的: このセッションの要約'])
})

const PANE_ID = 'session-brief'

const paneOn = (surface: (typeof SURFACES)[number]) => ({
  plugin: PLUGIN,
  surface,
  component: 'Pane' as const,
  requestId: PANE_ID,
  props: {
    title: 'Session brief',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline' as const,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
})

const recordPaneOpens = (on: On) => {
  const opened: unknown[] = []
  on('ui.open', (_$, e) => {
    opened.push(e)

    return { value: { isPlaced: true } }
  })

  return opened
}

const OPENED_PANE = { id: PANE_ID, title: 'Session brief', focus: true, closeOnEscape: true }

test('/brief は Pane を開き、会話には行を残さない', async ($, on) => {
  mock.clock(on, { now: START })
  standInForEngine(on)
  const opened = recordPaneOpens(on)

  await startInteractive($)
  const ran = await $.command.run({
    command: 'brief',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 90 },
  })

  expect(ran).toEqual({})
  expect(opened).toEqual([OPENED_PANE])
})

test('Band の詳細ボタンを押すと Pane を開く', async ($, on) => {
  mock.clock(on, { now: START })
  standInForEngine(on)
  const opened = recordPaneOpens(on)

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })
  const ui = await $.ui.mount(bandOn('terminal'))
  await ui.press({ key: 'open' })
  await ui.unmount()

  expect(opened).toEqual([OPENED_PANE])
})

test('Pane に最新の要約、全ターン、全ての質問と回答を出す', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)
  recordPaneOpens(on)
  on('tool.call', { tool: 'AskUserQuestion' }, () => ANSWERED)
  const replies = ['パネルの方針を決定済み', 'パネルを実装済み']
  on('model.complete', () => replyWith(replies.shift() ?? ''))

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい\n詳細は以下', turnId: 't1' })
  await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS })
  await completeTurn($, '方針を決めました\n理由は以下', 't1')
  await clock.settle()
  await $.turn.start({ text: '実装して', turnId: 't2' })
  await completeTurn($, '実装しました', 't2')
  await clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneOn(surface))
    const rows = (await ui.findAll({ type: 'Text' })).map(found => found.text)
    await ui.unmount()

    expect(rows, surface).toEqual([
      '目的: パネルを実装済み',
      'ターン',
      'T1 依頼: パネルを作りたい',
      '   回答: 方針を決めました',
      'T2 依頼: 実装して',
      '   回答: 実装しました',
      '質問と回答',
      'T1 [一覧要件] Q1: 一覧で見たいですか?',
      '   → B: 切り替え先で分かれば良い',
    ])
  }
})

test('表示中の Band は時間の経過に合わせて経過時間を描き直す', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })
  const ui = await $.ui.mount(bandOn('terminal'))
  const before = (await ui.find({ type: 'Text', text: /^T1/ }))?.text
  await clock.advance(60_000)
  const after = (await ui.find({ type: 'Text', text: /^T1/ }))?.text
  await ui.unmount()

  expect([before, after]).toEqual(['T1 ▶ 作業中 0s', 'T1 ▶ 作業中 1m'])
})

test('依頼文なしで始まるターンや注入された行は、直前のターンの続きとして扱う', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)
  recordPaneOpens(on)
  on('model.complete', () => replyWith('要約'))

  await startInteractive($)
  await $.turn.start({ text: 'パネルを作りたい', turnId: 't1' })
  await completeTurn($, '途中まで', 't1')
  await clock.settle()
  await $.turn.start({ text: '', turnId: 't2' })
  await completeTurn($, '続きを終えました', 't2')
  await clock.settle()
  await $.turn.start({ text: '<task-notification>done</task-notification>', turnId: 't3' })
  await completeTurn($, '通知を確認しました', 't3')
  await clock.settle()

  const ui = await $.ui.mount(paneOn('terminal'))
  const rows = (await ui.findAll({ type: 'Text' })).map(found => found.text)
  await ui.unmount()

  expect(rows).toEqual([
    '目的: 要約',
    'ターン',
    'T1 依頼: パネルを作りたい',
    '   回答: 通知を確認しました',
    '質問と回答',
    '(まだありません)',
  ])
})

test('/ コマンドで始めたターンは、コマンド名と引数を依頼として数える', async ($, on) => {
  mock.clock(on, { now: START })
  standInForEngine(on)
  recordPaneOpens(on)

  await startInteractive($)
  await $.turn.start({
    text: '<command-message>dev-impl</command-message>\n<command-name>/dev-impl</command-name>\n<command-args>3 件実装して</command-args>',
    turnId: 't1',
  })
  await $.turn.start({
    text: '<command-message>brief</command-message>\n<command-name>/brief</command-name>',
    turnId: 't2',
  })

  const ui = await $.ui.mount(paneOn('terminal'))
  const rows = (await ui.findAll({ type: 'Text' })).map(found => found.text)
  await ui.unmount()

  expect(rows.slice(1, 6)).toEqual([
    'ターン',
    'T1 依頼: /dev-impl 3 件実装して',
    '   回答: (作業中)',
    'T2 依頼: /brief',
    '   回答: (作業中)',
  ])
})

test('同じプロセスで別のセッションへ /resume したら状態を空にし、T1 から数え直す', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  standInForEngine(on)
  on('model.complete', () => replyWith('前のセッションの要約'))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

  await startInteractive($)
  await $.turn.start({ text: '前のセッションの依頼', turnId: 't1' })
  await completeTurn($, '前のセッションの回答', 't1')
  await clock.settle()
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: { id: 's1' } })
  await $.turn.start({ text: '別のセッションの依頼', turnId: 't2' })

  expect(await bandRows($, 'terminal')).toEqual(['T1 ▶ 作業中 0s', '目的: (要約待ち)'])
})
