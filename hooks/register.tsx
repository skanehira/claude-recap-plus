import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelCompleteResult, Register } from 'claude-code'

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
  storedBriefOf,
  summaryRequest,
  turnKeyOf,
} from './brief'
import type { Locale } from './brief'

const brief = atom({ plugin: 'session-brief', key: 'brief' } as const, EMPTY)

const PANE_ID = 'session-brief'

// The cells the terminal's ` [-]` mark covers at the band's right edge, and
// its ` ✕` mark at the top right of a pane.
const COLLAPSE_MARK_CELLS = 4
const CLOSE_MARK_CELLS = 3

// The share of the terminal the pane asks for when docked beside the
// transcript: the engine's own share is about three quarters, a little wide
// for six short parts. A width the person dragged the dock to still wins.
const PANE_SHARE = 0.66
const PANE_MIN_COLUMNS = 40

// Both buttons answer this action, so its chord (ctrl+x b in the README's
// key bindings) opens the pane from the band and closes it from the pane: a
// pane's button wins over the band's. The engine handles the action itself
// only inside the diff panel.
const TOGGLE_ACTION = 'app:cycleDiffBase'

// How many sessions' briefs the store keeps, the newest; one is a few KB.
const STORED_SESSIONS = 200
const storeKey = (sessionId: string): string => `brief:${sessionId}`

// How long a /clear or an in-process /resume is watched for the session it starts.
const SESSION_POLL_MS = 500
const SESSION_POLL_TRIES = 20

/** Why a reply holds no brief, for the debug log: the engine's reason, or a reply that is not the JSON asked for. */
const whyNoBrief = (reply: ModelCompleteResult): string => {
  if (reply.isAnswered) return 'unreadable-reply'

  return reply.reason === 'api-error' ? `api-error status=${reply.status} error=${reply.error}` : reply.reason
}

/**
 * Asks Haiku to rewrite the brief after the last turn and keeps it; when the
 * model gives nothing usable (a backend without Haiku, an error, a reply that
 * is not the JSON asked for), the answer's own first line stands in.
 */
const summarize = async ($: EngineInterface, locale: Locale) => {
  const current = await read($, brief)
  const request = summaryRequest(current, locale)
  const turn = current.turns.at(-1)
  const turnNumber = turn?.turn ?? 0
  const { epoch, sessionId } = current

  const reply = await $.model.complete({
    model: 'haiku',
    ...request,
    maxTokens: 1000,
    effort: 'low',
    timeoutMs: 30_000,
  })
  const written = reply.isAnswered ? parseSections(reply.text) : undefined
  if (written === undefined) $.ui.log(`session-brief: Haiku gave no brief: ${whyNoBrief(reply)}`, { to: 'debug' })
  const sections = written ?? fallbackSections(current, turn, locale.words)
  if (sections === undefined) return

  // A /clear or /resume while the model answered started another conversation,
  // and a later turn's brief may have landed first.
  let isApplied = false
  await update($, brief, latest => {
    isApplied = latest.epoch === epoch && turnNumber >= latest.sectionsTurn

    return isApplied ? setSections(latest, sections, turnNumber) : latest
  })
  if (isApplied && sessionId !== null) {
    await $.store.set(storeKey(sessionId), { sections, turnKey: turnKeyOf(current), savedAt: await $.clock.now() })
  }
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

/**
 * Opens the conversation the session now holds: reads it back, and shows the
 * brief the store kept for it when nothing has happened since; otherwise
 * analyzes it now, when there is anything to analyze.
 */
const openSession = async ($: EngineInterface, locale: Locale) => {
  const sessionId = await $.session.id()
  const rebuilt = rebuild(await $.session.messages())
  const stored = storedBriefOf(await $.store.get(storeKey(sessionId)))
  const isUpToDate = stored !== undefined && stored.turnKey === turnKeyOf(rebuilt)

  await update($, brief, current => ({
    ...rebuilt,
    sessionId,
    epoch: current.epoch,
    ...(isUpToDate ? { sections: stored.sections, sectionsTurn: rebuilt.turns.at(-1)?.turn ?? 0 } : {}),
  }))
  if (!isUpToDate && (rebuilt.turns.length > 0 || rebuilt.background !== null)) summarizeLater($, locale)
}

/**
 * After a /clear or an in-process /resume no session.start comes, and the
 * session that follows is not there yet when the old one ends: watch for the
 * id to change, then open that session. When a turn has already begun in it,
 * keep that turn and only learn the id, so its brief is saved under it.
 */
const followNextSession = ($: EngineInterface, endedId: string, locale: Locale) => {
  let tries = 0
  const timer = $.clock.every(SESSION_POLL_MS, () => {
    tries += 1
    $.session
      .id()
      .then(async sessionId => {
        if (sessionId === endedId) {
          if (tries >= SESSION_POLL_TRIES) timer.cancel()

          return
        }
        timer.cancel()
        const current = await read($, brief)
        if (current.sessionId !== null) return
        if (current.turns.length === 0) await openSession($, locale)
        else await update($, brief, latest => (latest.sessionId === null ? { ...latest, sessionId } : latest))
      })
      .catch((error: unknown) => $.ui.log(`session-brief: following the session failed: ${String(error)}`, { to: 'debug' }))
  })
}

/** Keeps the newest briefs in the store; the oldest go first. */
const pruneStore = async ($: EngineInterface) => {
  const keys = (await $.store.keys()).filter(key => key.startsWith('brief:'))
  if (keys.length <= STORED_SESSIONS) return

  const saved = await Promise.all(
    keys.map(async key => ({ key, savedAt: storedBriefOf(await $.store.get(key))?.savedAt ?? 0 })),
  )
  const oldest = saved.sort((a, b) => a.savedAt - b.savedAt).slice(0, keys.length - STORED_SESSIONS)
  await Promise.all(oldest.map(one => $.store.delete(one.key)))
}

export const register: Register = on => {
  // Set by session.start, which fires again on every reload of this module.
  let isInteractive = false
  let locale = localeFor(undefined)
  const pane = (terminalColumns: number) =>
    ({
      id: PANE_ID,
      title: locale.words.title,
      focus: true,
      closeOnEscape: true,
      columns: Math.max(PANE_MIN_COLUMNS, Math.round(terminalColumns * PANE_SHARE)),
    }) as const

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    if (!isInteractive) return next(e)

    locale = localeFor((await $.settings.read()).language)
    // A Claude Code build may hold a built-in /brief of its own, behind a flag,
    // and a built-in's name is refused; the brief must still open without it.
    try {
      await $.command.register({ name: 'brief', description: locale.words.command, immediate: true })
    } catch (error: unknown) {
      $.ui.log(`session-brief: /brief was not registered: ${String(error)}`, { to: 'debug' })
    }

    // No session id yet means the mod meets this conversation for the first
    // time: a resumed session, one that ran before the mod was installed, or a
    // new one. A reload of this module finds its state kept, and analyzes it
    // only when no brief was written yet.
    const current = await read($, brief)
    if (current.sessionId === null) await openSession($, locale)
    else if (current.sections === null && (current.turns.length > 0 || current.background !== null)) {
      summarizeLater($, locale)
    }
    await pruneStore($)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // A /clear starts a new conversation and an in-process /resume moves to
    // another one; neither raises session.start again, so start over here.
    if (isInteractive && (e.reason === 'clear' || e.reason === 'resume')) {
      await update($, brief, startOver)
      followNextSession($, e.sessionId, locale)
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

  on('command.run', { command: 'brief' }, async ($, e) => {
    await $.ui.open(pane(e.presentation.columns))

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const current = await read($, brief)
    const { Box, Text } = $.ui.resolve(e)

    const { Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {/* The engine draws the pane's close mark over its top right cells. */}
        <Box justifyContent="flex-end" marginRight={CLOSE_MARK_CELLS}>
          <Button
            key="close"
            label={locale.words.close}
            hotkey="b"
            action={TOGGLE_ACTION}
            plain
            dimColor
            onPress={() => $.ui.close({ id: PANE_ID })}
          />
        </Box>
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
    const isEmpty = current.turns.length === 0 && current.sections === null
    if (!isInteractive || e.props.hasSurvey || isEmpty) return next(e)
    // The pane holds the same purpose and status; a band beside a docked pane
    // would only repeat them in a narrow column, many rows tall.
    if ((await $.ui.panes()).some(one => one.id === PANE_ID && one.isShown)) return next(e)

    const [purpose, status] = bandRows(current, locale.words)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {/* A titled rule opens the band, so it reads apart from the spinner
            above it; the prompt's own rule closes it below. */}
        <Box>
          <Box flexShrink={0}>
            <Text dimColor wrap="truncate-end">{`── ${locale.words.title} `}</Text>
          </Box>
          {/* A rule as wide as the band, of which this box keeps the one row
              that fits beside the title and the button. */}
          <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden">
            <Text dimColor wrap="wrap">
              {'─'.repeat(e.props.bodyColumns)}
            </Text>
          </Box>
          {/* The engine draws its collapse mark over the band's last cells. */}
          <Box flexShrink={0} marginLeft={1} marginRight={COLLAPSE_MARK_CELLS}>
            <Button
              key="open"
              label={locale.words.details}
              hotkey="b"
              action={TOGGLE_ACTION}
              plain
              dimColor
              onPress={() => $.ui.open(pane(e.props.bodyColumns))}
            />
          </Box>
        </Box>
        <Text wrap="wrap">{purpose}</Text>
        <Text wrap="wrap">{status}</Text>
      </Box>
    )
  })
}
