# claude-session-brief

A [Claude Code](https://claude.com/claude-code) mod that keeps a two-line brief of the session right above the prompt. When you run several sessions side by side, switching to one tells you at a glance what it is working on, where it stands, and what you last decided.

```text
T4 ✓ answered 2m ago · Scope=B: switching is enough                      b: details
Brief: Session panel design approved; implementing the mod and its tests
```

## What it shows

- **Row 1** is the turn number and the state. While a turn runs it reads `▶ working 2m`. After the turn it reads `✓ answered 3m ago`, followed by the last question Claude asked you in that turn and the answer you chose.
- **Row 2** is a one-line summary of what the session is working on and what stage it is at. Haiku writes it after every turn of the main conversation, so it follows the work as it drifts away from the first prompt.
- **`/brief`** opens a pane with every turn (your request and the answer, one line each) and every question Claude asked with your answer. The band's `details` button opens the same pane: press ctrl+x tab to focus the band, then `b`.

Nothing is drawn before the first turn, and the band gives way while Claude Code shows a survey.

## Install

```text
/plugin marketplace add skanehira/claude-session-brief
/plugin install session-brief@claude-session-brief
/reload-plugins
```

Tested with Claude Code 2.1.287. Mods are early access, and their API can change between releases.

## Language

The band, the pane and the summary are in English by default. To switch to Japanese, open `/config`, find the `Language · session-brief` row, and pick `ja`.

## Cost and what is sent

After each turn of the main conversation, the mod makes one Haiku call through your own Claude Code session, on the same account and provider. The call carries only these parts of the session:

| Part | Limit |
| --- | --- |
| The previous summary | 120 characters |
| Your request in that turn | first 800 characters |
| Claude's final answer in that turn | first 1500 characters |
| The questions asked and answered in that turn | all |

Subagent turns and non-interactive runs (`claude -p`) never call it. When Haiku gives no usable reply, for example on a backend without Haiku, the first line of the final answer that is not a heading stands in as the summary.

## Behaviour to know

- **Dialogs hide the band.** In the terminal, the AskUserQuestion dialog and the permission dialog take over the prompt area, and Claude Code does not draw the band while they are up. The dialog itself shows what the session is waiting for.
- **Resume rebuilds it.** A session resumed in a new process (`claude --resume`, `claude --continue`) rebuilds its turns and questions from the transcript and writes one fresh summary. The times of those turns were not kept, so they show without "ago".
- **`/clear` starts over.** So does `/resume` into another session within the same process.
- **Claude Code only.** Codex, OpenCode and other agents have no mod API, so their sessions show nothing.

## Development

```bash
claude plugin validate .   # read the manifest and the hooks module as the engine will
claude plugin test .       # run hooks/*.test.ts(x) against the engine
claude --plugin-dir .      # try it in a session
tsc -p .                   # type-check; needs .claude-plugin/types/, which the engine writes when it loads the mod
```

## 日本語

prompt の上に、このセッションの状況を 2 行で出す Claude Code の mod です。1 行目はターン番号と状態 (作業中と経過時間、または応答済みと経過時間、そのターンの最後の質問と回答) です。2 行目は、main のターンが終わるたびに Haiku が書く 1 行の要約です。`/brief` か帯の `details` ボタン (ctrl+x tab で帯にフォーカスして `b`) で、全ターンの依頼と回答、全ての質問と回答を Pane に出します。

日本語で表示するには、`/config` の `Language · session-brief` の行で `ja` を選びます。

## License

[MIT](LICENSE)
