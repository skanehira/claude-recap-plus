export type Question = { header: string; question: string }

export type QuestionAnswer = Question & {
  turn: number
  /** null while the question waits; '' when it was dismissed unanswered. */
  answer: string | null
}

export type TurnEntry = {
  turn: number
  /** null for a turn that began with no request (a continuation). */
  ask: string | null
  answer: string | null
  startedAt: number
  endedAt: number | null
}

export type Summary = { text: string; turn: number }

export type Brief = {
  turns: TurnEntry[]
  questions: QuestionAnswer[]
  summary: Summary | null
  isWorking: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'session-brief': { brief: Brief }
  }
}
