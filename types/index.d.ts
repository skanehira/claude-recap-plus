export type Question = { header: string; question: string }

export type QuestionAnswer = Question & {
  turn: number
  answer: string | null
}

export type TurnEntry = {
  turn: number
  ask: string
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
