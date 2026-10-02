import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  EMPTY,
  answerQuestions,
  askQuestions,
  answersOf,
  completeTurn,
  fallbackSummary,
  paneRows,
  purposeLine,
  rebuild,
  setSummary,
  startOver,
  startTurn,
  statusLine,
  summaryFromReply,
  summaryRequest,
  wordsFor,
} from './brief'
import type { Words } from './brief'

const brief = atom({ plugin: 'session-brief', key: 'brief' } as const, EMPTY)

const PANE_ID = 'session-brief'

// How often the band's elapsed times are drawn again while nothing else moves.
const REDRAW_MS = 15_000

// The cells the terminal's ` [-]` mark covers at the band's right edge.
const COLLAPSE_MARK_CELLS = 4

/**
 * Asks Haiku for the one-line summary after the last turn and keeps it; the
 * answer's own first line stands in when the model gives nothing usable (a
 * backend without Haiku, an error, a timeout).
 */
const summarize = async ($: EngineInterface, words: Words) => {
  const current = await read($, brief)
  const request = summaryRequest(current, words)
  const turn = current.turns.at(-1)
  if (request === undefined || turn === undefined) return
  const { epoch } = current

  const reply = await $.model.complete({
    model: 'haiku',
    ...request,
    maxTokens: 200,
    effort: 'low',
    timeoutMs: 20_000,
  })
  const text =
    (reply.isAnswered ? summaryFromReply(reply.text) : undefined) ??
    fallbackSummary(turn.answer ?? '')
  if (text === undefined) return

  // A /clear or /resume while the model answered started another conversation.
  await update($, brief, latest => (latest.epoch === epoch ? setSummary(latest, text, turn.turn) : latest))
}

/**
 * Starts the summary on a timer: it runs outside the dispatch that asked, so
 * no turn is held up by the model call and the call is not cut short when
 * that dispatch ends.
 */
const summarizeLater = ($: EngineInterface, words: Words) => {
  $.clock.after(0, () => {
    summarize($, words).catch((error: unknown) =>
      $.ui.log(`session-brief: summary failed: ${String(error)}`, { to: 'debug' }),
    )
  })
}

export const register: Register = (on, options) => {
  const words = wordsFor(options.language)
  const pane = { id: PANE_ID, title: words.paneTitle, focus: true, closeOnEscape: true } as const

  // Set by session.start, which fires again on every reload of this module.
  let isInteractive = false

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    if (!isInteractive) return next(e)

    // Dropped with the module on a reload; session.start then starts another.
    $.clock.every(REDRAW_MS, () => $.ui.invalidate('ui.render'))
    await $.command.register({
      name: 'brief',
      description: words.command,
      immediate: true,
    })

    // Empty here means a fresh process: a resumed session, or a new one with
    // nothing to read back. A reload of this module finds its state kept.
    if ((await read($, brief)).turns.length === 0) {
      const rebuilt = rebuild(await $.session.messages())
      if (rebuilt.turns.length > 0) {
        await update($, brief, current => ({ ...rebuilt, epoch: current.epoch }))
        summarizeLater($, words)
      }
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
    if (isInteractive) {
      const now = await $.clock.now()
      await update($, brief, current => startTurn(current, e.text, now))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (isInteractive && e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, brief, current => completeTurn(current, e.answer, now))
      summarizeLater($, words)
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
    await update($, brief, current =>
      answerQuestions(current, answersOf(answered), answered?.response),
    )

    return ran
  })

  on('command.run', { command: 'brief' }, async $ => {
    await $.ui.open(pane)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const current = await read($, brief)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {paneRows(current, words).map(section => (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>{section.title}</Text>
            {section.rows.map(row => (
              <Text wrap="truncate-end">{row}</Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, brief)
    if (!isInteractive || e.props.hasSurvey || current.turns.length === 0) return next(e)

    const now = await $.clock.now()
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">{statusLine(current, now, words)}</Text>
          </Box>
          {/* The engine draws its collapse mark over the band's last cells. */}
          <Box flexShrink={0} marginRight={COLLAPSE_MARK_CELLS}>
            <Button key="open" label={words.details} hotkey="b" plain dimColor onPress={() => $.ui.open(pane)} />
          </Box>
        </Box>
        <Text wrap="truncate-end" dimColor>
          {purposeLine(current, words)}
        </Text>
      </Box>
    )
  })
}
