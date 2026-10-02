import { describe, expect, test } from 'claude-code/testing'

import { fallbackSummary, formatElapsed, summaryFromReply } from './brief'

describe('fallbackSummary は最終回答の最初の本文行を要約の代わりにする', () => {
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

describe('summaryFromReply は Haiku の返答を 1 行の要約にする', () => {
  const cases: [string, string, string | undefined][] = [
    ['最初の空でない行だけを使う', '\n  一行目  \n二行目', '一行目'],
    ['括弧の引用符を外す', '「パネルを実装済み」', 'パネルを実装済み'],
    ['ASCII の引用符を外す', '"Panel is done"', 'Panel is done'],
    ['空白だけなら使えない', ' \n \n', undefined],
  ]
  for (const [name, reply, expected] of cases) {
    test(name, () => {
      expect(summaryFromReply(reply)).toBe(expected)
    })
  }
})

describe('formatElapsed は経過時間を秒・分・時間で短く書く', () => {
  const cases: [string, number, string][] = [
    ['1 分未満は秒', 59_999, '59s'],
    ['1 時間未満は分', 60 * 60_000 - 1, '59m'],
    ['1 時間以上は時間と 2 桁の分', 2 * 60 * 60_000 + 5 * 60_000, '2h05m'],
    ['負の値は 0 秒', -5_000, '0s'],
  ]
  for (const [name, ms, expected] of cases) {
    test(name, () => {
      expect(formatElapsed(ms)).toBe(expected)
    })
  }
})
