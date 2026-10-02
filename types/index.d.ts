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
  /** What the turn did with its tools, one line each (`Bash: Push the commits`). */
  activity: string[]
}

/** The brief Haiku keeps of the session, rewritten after every turn. */
export type Sections = {
  purpose: string
  status: string
  done: string[]
  decisions: string[]
  pending: string[]
  next: string
}

export type Brief = {
  turns: TurnEntry[]
  questions: QuestionAnswer[]
  sections: Sections | null
  /** The turn the sections were written after; an older reply never replaces them. */
  sectionsTurn: number
  /** What a compaction kept of the turns before it, read back on a resume. */
  background: string | null
  isWorking: boolean
  /** Counts the conversations this process has held; a /clear or /resume moves it on. */
  epoch: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-brief': { brief: Brief }
  }
}
