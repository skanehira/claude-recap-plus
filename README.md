# claude-session-brief

A [Claude Code](https://claude.com/claude-code) mod that keeps a brief of the session right above the prompt. When you run several sessions side by side, switching to one tells you at a glance what it is for and where it stands, without scrolling back through the conversation.

```text
Purpose: Add retry with backoff to the payment webhook handler                  b: details
Status: The tests pass locally. Claude is waiting for your OK to open the pull
request.
```

## What it shows

Haiku rewrites the brief after every turn of the main conversation. It works from the previous brief, your request, Claude's answer, the questions Claude asked with your answers, and what the turn did with its tools. Every line is shown in full and wraps; nothing is cut off with an ellipsis.

- **The band above the prompt** shows the purpose and the status. While a turn runs, the status keeps the last brief and is marked `(working)`.
- **`/brief`** opens a pane with all six parts of the brief. The band's `details` button opens the same pane: press ctrl+x tab to focus the band, then `b`. While the pane is shown, the band steps aside, since the pane says the same and more.

| Part | What it says |
| --- | --- |
| Purpose | What the session is for, naming the concrete target (a pull request, a file, a feature) |
| Status | Where the work stands now |
| Done | What has been done so far, up to 5 items |
| Decisions | What has been decided, including your answers to Claude's questions, up to 5 items |
| Waiting on you | What Claude is waiting for you to answer or do |
| Next | What Claude will do next |

Nothing is drawn before the first turn. Until the first brief is written, the band says `(after the first turn)`.

## Install

```text
/plugin marketplace add skanehira/claude-session-brief
/plugin install session-brief@claude-session-brief
/reload-plugins
```

Tested with Claude Code 2.1.287. Mods are early access, and their API can change between releases.

## Language

The brief follows Claude Code's own `language` setting. With `"language": "Japanese"`, the headings are Japanese and Haiku writes the brief in Japanese. With another language, the headings stay English and Haiku writes in that language. With no setting, everything is English.

## Cost and what is sent

After each turn of the main conversation, the mod makes one Haiku call through your own Claude Code session, on the same account and provider. The call carries only these parts of the session:

| Part | Limit |
| --- | --- |
| The previous brief | its six parts |
| Your request in that turn | first 800 characters |
| Claude's final answer in that turn | first 3000 characters |
| The questions asked and answered in that turn | all |
| What the turn did: shell commands by their description, edited and written files, subagents, skills, web fetches and searches, MCP tools | up to 30 lines |
| Before there is a brief to carry on: your earlier requests | the last 20, 120 characters each |
| Before there is a brief to carry on, in a session that was compacted: the summary the compaction kept | first 2000 characters |

Reading and searching files is not sent. Subagent turns and the tools subagents call are not sent, and they never trigger a call. Non-interactive runs (`claude -p`) never call it. When Haiku gives no usable reply, for example on a backend without Haiku, the first line of the final answer that is not a heading becomes the status.

## Behaviour to know

- **Dialogs hide the band.** In the terminal, the AskUserQuestion dialog and the permission dialog take over the prompt area, and Claude Code does not draw the band while they are up. The dialog itself shows what the session is waiting for.
- **Sessions from before the mod get a brief too.** When the mod loads into a session that already has a conversation, for example one you resume with `claude --resume` or `claude --continue` after installing the mod, it reads the conversation back and writes the first brief from that history: your earlier requests and, if the session was compacted, the summary the compaction kept. Turns from before a compaction are gone from the conversation, so only that summary speaks for them.
- **`/clear` starts over.** So does `/resume` into another session within the same process.
- **Claude Code only.** Codex, OpenCode and other agents have no mod API, so their sessions show nothing.

## Development

```bash
claude plugin validate .claude-plugin/plugin.json   # the plugin: its manifest and its hooks module, read as the engine will
claude plugin validate .                            # the marketplace manifest (it does not read the hooks module)
claude plugin test .                                # run hooks/*.test.ts(x) against the engine
claude --plugin-dir .                               # try it in a session
tsc -p .                                            # type-check; needs .claude-plugin/types/, which the engine writes when it loads the mod
```

## 日本語

prompt の上に、このセッションの概要を出す Claude Code の mod です。main のターンが終わるたびに、Haiku が概要を書き直します。帯には目的と現状を、省略せずに折り返して出します。`/brief` か帯の「詳細」ボタン (ctrl+x tab で帯にフォーカスして `b`) では、6 項目すべてを Pane に出します。6 項目は、目的、現状、やったこと、決定事項、確認待ち、次にやることです。

表示の言語は、Claude Code の `language` 設定に従います。`"language": "Japanese"` なら、見出しも概要も日本語になります。

## License

[MIT](LICENSE)
