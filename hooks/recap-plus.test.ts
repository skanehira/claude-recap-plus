import { describe, expect, test } from 'claude-code/testing'

import { activityOf, fallbackSummary, localeFor, parseSections, storedRecapPlusOf } from './recap-plus'

describe('fallbackSummary は最終回答の最初の本文行を現状の代わりにする', () => {
  const cases: [string, string, string | undefined][] = [
    ['見出しを飛ばし強調を外す', '## 結論\n\n**方針を決めた。** 理由は 2 つ。', '方針を決めた。 理由は 2 つ。'],
    ['コードフェンスの行を飛ばす', '```ts\nconst x = 1\n```', 'const x = 1'],
    ['箇条書きの記号を外す', '- 一つ目の項目\n- 二つ目', '一つ目の項目'],
    ['番号つきの記号を外す', '1. 最初の手順', '最初の手順'],
    ['本文が無ければ無い', '# 見出しだけ\n\n', undefined],
  ]
  for (const [name, answer, expected] of cases) {
    test(name, () => {
      expect(fallbackSummary(answer)).toBe(expected)
    })
  }
})

describe('parseSections は Haiku の返答から概要を取り出す', () => {
  const recapPlus = { purpose: 'p', status: 's', done: ['d'], decisions: [], pending: [], next: 'n' }
  const cases: [string, string, unknown][] = [
    ['JSON だけの返答', JSON.stringify(recapPlus), recapPlus],
    ['前後に文があっても JSON の部分を読む', `Here it is:\n${JSON.stringify(recapPlus)}\nDone.`, recapPlus],
    ['目的が無ければ使えない', JSON.stringify({ ...recapPlus, purpose: '' }), undefined],
    ['現状が無ければ使えない', JSON.stringify({ ...recapPlus, status: 3 }), undefined],
    ['リストでない値は空にし、文字列でない項目を落とす', JSON.stringify({ ...recapPlus, done: 'x', pending: ['a', 1] }), { ...recapPlus, done: [], pending: ['a'] }],
    ['壊れた JSON は使えない', '{"purpose": "p", ', undefined],
  ]
  for (const [name, reply, expected] of cases) {
    test(name, () => {
      expect(parseSections(reply)).toEqual(expected)
    })
  }
})

describe('activityOf は作業の進み具合を表すツール呼び出しだけを 1 行にする', () => {
  const cases: [string, string, Record<string, unknown>, string | undefined][] = [
    ['Bash は説明文を使う', 'Bash', { command: 'git push', description: 'Push the commits' }, 'Bash: Push the commits'],
    ['Bash に説明文が無ければコマンドの 1 行目', 'Bash', { command: 'make\nmake test' }, 'Bash: make'],
    ['Write はパス', 'Write', { file_path: '/a.ts', content: 'x' }, 'Write: /a.ts'],
    ['Agent は説明文', 'Agent', { description: 'Review the diff', prompt: '...' }, 'Agent: Review the diff'],
    ['MCP ツールは名前', 'mcp__github__create_issue', { title: 't' }, 'mcp__github__create_issue'],
    ['読むだけのツールは数えない', 'Read', { file_path: '/a.ts' }, undefined],
  ]
  for (const [name, tool, input, expected] of cases) {
    test(name, () => {
      expect(activityOf(tool, input)).toBe(expected)
    })
  }
})

describe('localeFor は Claude Code の language 設定から見出しの言語と Haiku の言語を決める', () => {
  const cases: [string, unknown, string, string][] = [
    ['未設定は英語', undefined, 'Purpose', 'English'],
    ['Japanese は日本語の見出し', 'Japanese', '目的', 'Japanese'],
    ['日本語 も日本語の見出し', '日本語', '目的', '日本語'],
    ['ja も日本語の見出し', 'ja', '目的', 'ja'],
    ['ほかの言語は英語の見出しで、Haiku はその言語で書く', 'French', 'Purpose', 'French'],
  ]
  for (const [name, setting, purpose, language] of cases) {
    test(name, () => {
      const locale = localeFor(setting)
      expect([locale.words.purpose, locale.language]).toEqual([purpose, language])
    })
  }
})

describe('storedRecapPlusOf は保存した概要の使用量の累計を読み、記録を始める前のものは 0 から数える', () => {
  const sections = { purpose: 'p', status: 's', done: [], decisions: [], pending: [], next: '' }
  const ZERO = { calls: 0, inputTokens: 0, outputTokens: 0 }
  const kept = { calls: 3, inputTokens: 4_200, outputTokens: 1_300 }
  const cases: [string, unknown, unknown][] = [
    ['累計があればそのまま読む', kept, kept],
    ['累計の無い古い保存は 0 にする', undefined, ZERO],
    ['回数が数でない累計は 0 にする', { ...kept, calls: '3' }, ZERO],
    ['入力トークンが数でない累計は 0 にする', { ...kept, inputTokens: null }, ZERO],
    ['出力トークンの無い累計は 0 にする', { calls: 3, inputTokens: 4_200 }, ZERO],
    ['負の値を持つ累計は 0 にする', { ...kept, outputTokens: -1 }, ZERO],
  ]
  for (const [name, usage, expected] of cases) {
    test(name, () => {
      const stored = { sections, turnKey: 'v1:x', savedAt: 1, ...(usage === undefined ? {} : { usage }) }
      expect(storedRecapPlusOf(stored)).toEqual({ sections, turnKey: 'v1:x', savedAt: 1, usage: expected })
    })
  }
})
