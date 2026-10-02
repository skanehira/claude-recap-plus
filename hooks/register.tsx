import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  EMPTY,
  activityOf,
  answerQuestions,
  answersOf,
  askQuestions,
  bandRows,
  completeTurn,
  fallbackSections,
  freeTextOf,
  localeFor,
  paneSections,
  parseSections,
  rebuild,
  recordActivity,
  setSections,
  startOver,
  startTurn,
  summaryRequest,
} from './brief'
import type { Locale } from './brief'

const brief = atom({ plugin: 'session-brief', key: 'brief' } as const, EMPTY)

const PANE_ID = 'session-brief'

// The cells the terminal's ` [-]` mark covers at the band's right edge.
const COLLAPSE_MARK_CELLS = 4

/**
 * Asks Haiku to rewrite the brief after the last turn and keeps it; when the
 * model gives nothing usable (a backend without Haiku, an error, a reply that
 * is not the JSON asked for), the answer's own first line stands in.
 */
const summarize = async ($: EngineInterface, locale: Locale) => {
  const current = await read($, brief)
  const request = summaryRequest(current, locale)
  const turn = current.turns.at(-1)
  if (request === undefined || turn === undefined) return
  const { epoch } = current

  const reply = await $.model.complete({
    model: 'haiku',
    ...request,
    maxTokens: 1000,
    effort: 'low',
    timeoutMs: 30_000,
  })
  const sections =
    (reply.isAnswered ? parseSections(reply.text) : undefined) ?? fallbackSections(current, turn, locale.words)
  if (sections === undefined) return

  // A /clear or /resume while the model answered started another conversation.
  await update($, brief, latest => (latest.epoch === epoch ? setSections(latest, sections, turn.turn) : latest))
}

/**
 * Starts the summary on a timer: it runs outside the dispatch that asked, so
 * no turn is held up by the model call and the call is not cut short when
 * that dispatch ends.
 */
const summarizeLater = ($: EngineInterface, locale: Locale) => {
  $.clock.after(0, () => {
    summarize($, locale).catch((error: unknown) =>
      $.ui.log(`session-brief: summary failed: ${String(error)}`, { to: 'debug' }),
    )
  })
}

export const register: Register = on => {
  // Set by session.start, which fires again on every reload of this module.
  let isInteractive = false
  let locale = localeFor(undefined)
  const pane = () => ({ id: PANE_ID, title: locale.words.paneTitle, focus: true, closeOnEscape: true }) as const

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    if (!isInteractive) return next(e)

    locale = localeFor((await $.settings.read()).language)
    await $.command.register({ name: 'brief', description: locale.words.command, immediate: true })

    // Empty here means the mod meets this conversation for the first time: a
    // resumed session, one that ran before the mod was installed, or a new one
    // with nothing to read back. A reload of this module finds its state kept.
    if ((await read($, brief)).turns.length === 0) {
      const rebuilt = rebuild(await $.session.messages())
      // Right after a compaction there may be no turn to show yet, but what the
      // compaction kept still feeds the first brief of the turns to come.
      if (rebuilt.turns.length > 0 || rebuilt.background !== null) {
        await update($, brief, current => ({ ...rebuilt, epoch: current.epoch }))
      }
      if (rebuilt.turns.length > 0) summarizeLater($, locale)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // A /clear starts a new conversation and an in-process /resume moves to
    // another one; neither raises session.start again, so start over here.
    if (isInteractive && (e.reason === 'clear' || e.reason === 'resume')) {
      await update($, brief, startOver)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (isInteractive) await update($, brief, current => startTurn(current, e.text))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (isInteractive && e.agentId === undefined) {
      await update($, brief, current => completeTurn(current, e.answer))
      summarizeLater($, locale)
    }

    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (!isInteractive) return next(e)

    await update($, brief, current =>
      askQuestions(
        current,
        e.questions.map(one => ({ header: one.header, question: one.question })),
      ),
    )
    const ran = await next(e)
    const answered = ran.deny === undefined && ran.isError !== true ? ran.result : undefined
    await update($, brief, current => answerQuestions(current, answersOf(answered), freeTextOf(answered)))

    return ran
  })

  on('tool.call', async ($, e, next) => {
    const line = isInteractive && e.agentId === undefined ? activityOf(String(e.tool), e) : undefined
    if (line !== undefined) await update($, brief, current => recordActivity(current, line))

    return next(e)
  })

  on('command.run', { command: 'brief' }, async $ => {
    await $.ui.open(pane())

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const current = await read($, brief)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {paneSections(current, locale.words).map(section => (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold wrap="wrap">
              {section.title}
            </Text>
            {section.rows.map(row => (
              <Text wrap="wrap">{row}</Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, brief)
    if (!isInteractive || e.props.hasSurvey || current.turns.length === 0) return next(e)
    // The pane holds the same purpose and status; a band beside a docked pane
    // would only repeat them in a narrow column, many rows tall.
    if ((await $.ui.panes()).some(one => one.id === PANE_ID && one.isShown)) return next(e)

    const [purpose, status] = bandRows(current, locale.words)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="wrap">{purpose}</Text>
          </Box>
          {/* The engine draws its collapse mark over the band's last cells. */}
          <Box flexShrink={0} marginRight={COLLAPSE_MARK_CELLS}>
            <Button
              key="open"
              label={locale.words.details}
              hotkey="b"
              plain
              dimColor
              onPress={() => $.ui.open(pane())}
            />
          </Box>
        </Box>
        <Text wrap="wrap">{status}</Text>
      </Box>
    )
  })
}
