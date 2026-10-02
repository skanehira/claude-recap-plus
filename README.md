<!-- Kind: README (English; the Japanese translation is README.ja.md) -->

# claude-session-brief

[日本語](README.ja.md)

A [Claude Code](https://claude.com/claude-code) mod that keeps a brief of the session right above the prompt. When you run several sessions side by side, switching to one tells you at a glance what it is for and where it stands, without scrolling back through the conversation.

```text
Purpose: Add retry with backoff to the payment webhook handler                  b: details
Status: The tests pass locally. Claude is waiting for your OK to open the pull
request.
```

## What it shows

Haiku rewrites the brief after every turn of the main conversation (the conversation you type into, not a subagent's). It works from the previous brief, your request, Claude's answer, the questions Claude asked with your answers, and what the turn did with its tools. No line is cut off at the edge of the screen; each one wraps. Each part Haiku writes holds up to 500 characters, and a longer one ends in `…`.

- **The band above the prompt** shows the purpose and the status.
- **`/brief`** opens a pane titled "Session brief" with all six parts. So does ctrl+x b once you add the key bindings below, and so does the band's `details` button. While the pane is shown, the band steps aside, since the pane says the same and more.

| Part           | What it says                                                                            |
| -------------- | --------------------------------------------------------------------------------------- |
| Purpose        | What the session is for, naming the concrete target (a pull request, a file, a feature) |
| Status         | Where the work stands now                                                               |
| Done           | What has been done so far, the newest 5 items                                           |
| Decisions      | What has been decided, including your answers to Claude's questions, the newest 5 items |
| Waiting on you | What Claude is waiting for you to answer or do, the newest 5 items                      |
| Next           | What Claude will do next                                                                |

The band changes over a session like this:

| When                                                         | The band                                        |
| ------------------------------------------------------------ | ----------------------------------------------- |
| Before the first turn                                        | Nothing                                         |
| Until the first brief is written                             | `(after the first turn)` in both rows           |
| While a turn runs                                            | The last brief, with `(working)` after `Status` |
| After a turn, until Haiku's reply comes (usually seconds)    | The last brief                                  |
| While a dialog or a survey is up, or while the pane is shown | Nothing                                         |

The brief is saved per session, in the mod's own store (see [Where the briefs are kept](#where-the-briefs-are-kept)). Opening a session shows its saved brief at once, or analyzes the session right then when there is none or it is out of date (see [Opening a session](#opening-a-session)).

## Requirements

- **Claude Code 2.1.287.** This is the version the mod was tested with. Mods are early access, and their API can change between releases.
- **Hooks allowed.** A mod runs as plugin hooks, so it stays off where your settings or your organization's policy turn hooks off.
- **The terminal or the desktop app, for the band.** The mod API draws the band only there. In the VS Code extension and on mobile, only the `/brief` pane is available (not tested there).
- **Claude Code only.** The mod runs on Claude Code's mod API, and nothing else loads it.

## Install

```text
/plugin marketplace add skanehira/claude-session-brief
/plugin install session-brief@claude-session-brief
/reload-plugins
```

To check that it is loaded, type `/br`: `/brief` is offered with the description "Open this session's brief: purpose, status, what was done and decided, what waits on you, what comes next". `claude plugin list` also shows `session-brief@claude-session-brief` with `Status: ✔ enabled`.

To update, refresh the marketplace, update the plugin, and restart Claude Code:

```bash
claude plugin marketplace update claude-session-brief
claude plugin update session-brief@claude-session-brief
```

## Keys

With these bindings, ctrl+x is the prefix for the brief:

| Keys     | What they do                                                      |
| -------- | ----------------------------------------------------------------- |
| ctrl+x b | Open the pane with the whole brief, or close it while it is shown |
| ctrl+x i | Fold the band away; press again to bring it back                  |

Add the two lines to the `Chat` context in `~/.claude/keybindings.json` (`/keybindings` opens the file). If the file already has a `Chat` context, add them to its `bindings` instead of adding a second one. Claude Code notices when the file changes and reloads it, so running sessions pick up the keys without a restart.

```json
{
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "ctrl+x b": "app:cycleDiffBase",
        "ctrl+x i": "abovePrompt:toggle"
      }
    }
  ]
}
```

A mod cannot define a key action of its own, so ctrl+x b borrows one. `app:cycleDiffBase` is the diff panel's action for cycling its comparison base, bound to ctrl+x b inside the diff panel by default, and Claude Code handles it only while the diff panel is open. So while the diff panel is open, ctrl+x b cycles the base as before. While it is closed, the action presses the band's `details` button, which opens the pane. While the pane is shown, the action presses the pane's `close` button instead, which closes it. `abovePrompt:toggle` is Claude Code's own action for folding the band, bound to ctrl+x ctrl+a by default; ctrl+x i only adds a second key for it.

ctrl+x b works only while the band or the pane is shown. Before the first turn, while the band is folded, or while a dialog is up, nothing answers it; pressed while the band is folded, the `b` lands in the prompt. Open the pane with `/brief` then.

The pane also closes with its `close` button (press `b` while the pane has the keyboard) or with Esc. Without the bindings, open the pane with `/brief`, or press ctrl+x tab to focus the band and then `b`. Fold the band with ctrl+x ctrl+a.

## Language

The brief follows the `language` setting in Claude Code's settings (`~/.claude/settings.json` or any other settings file Claude Code reads).

| `language`                                                               | Labels                                                                            | Haiku writes in |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------- |
| Starts with `Japanese`, `日本語` or `ja` (any case; for example `ja-JP`) | Japanese: the headings, the button, the pane, the markers, `/brief`'s description | Japanese        |
| Any other value                                                          | English                                                                           | That language   |
| Not set                                                                  | English                                                                           | English         |

The mod reads the setting when a session starts and when it is reloaded (`/reload-plugins`). A brief written before a change stays in its old language until the next turn rewrites it.

## Cost and what is sent

The mod calls Haiku through your own Claude Code session, on the same account and provider. Each call is capped at 1000 output tokens and 30 seconds. It calls:

- after each turn of the main conversation;
- when a session is opened, or the mod is first loaded or reloaded into one, only when the session has no up-to-date saved brief and has something to analyze.

Non-interactive runs (`claude -p`) never call it. To stop the calls, disable the mod (`/plugin`, or `claude plugin disable session-brief@claude-session-brief`); there is no setting that keeps the band without Haiku.

The call carries only these parts of the session:

| What                                         | When                                                              | Limit                                                          |
| -------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| The previous brief                           | Every call                                                        | Its six parts                                                  |
| Your request in the turn                     | Every call                                                        | First 800 characters                                           |
| Claude's final answer in the turn            | Every call                                                        | First 3000 characters                                          |
| The questions asked in the turn, and answers | Every call                                                        | All of them                                                    |
| What the turn did with its tools (below)     | Every call                                                        | The last 30 lines, 160 characters each                         |
| Your earlier requests                        | Only while there is no brief to carry on                          | The last 20; the first 120 characters of each one's first line |
| The summary a compaction kept                | Only while there is no brief to carry on, for a compacted session | First 2000 characters                                          |

| Tool         | What is sent                                             |
| ------------ | -------------------------------------------------------- |
| Bash         | Its description, or the command's first line without one |
| Edit, Write  | The file's path                                          |
| NotebookEdit | The notebook's path                                      |
| Agent, Task  | Its description                                          |
| Skill        | The skill's name                                         |
| WebFetch     | The URL                                                  |
| WebSearch    | The query                                                |
| MCP tools    | The tool's name only                                     |

Reading and searching files is not sent, nor is any other tool. Subagent turns and the tools subagents call are not sent, and they never trigger a call.

When Haiku gives no usable brief (an API error, an empty reply, the 30 seconds running out, a reply that is not the brief asked for), the mod writes one in its place: the previous brief with its status replaced by the first line of the final answer that is not a heading. Before there is any brief, the purpose is the first line of your request and the other parts are empty. That brief is saved like any other. When the answer has no such line, the brief stays as it was.

## Behaviour to know

### Dialogs hide the band

In the terminal, the AskUserQuestion dialog and the permission dialog take over the prompt area, and Claude Code does not draw the band while they are up (seen in Claude Code 2.1.287). The dialog itself shows what the session is waiting for. Claude Code's surveys take the same place, and the band steps aside for them too.

### Opening a session

When you open a session, by `claude --resume`, `claude --continue` or `/resume` within a running session, the mod reads its conversation back. The same happens when the mod is first loaded into a running session.

- **Up to date.** If the saved brief was written after the session's last turn, that is, the last turn's request and answer are the same as when it was saved, the brief shows at once and no call is made.
- **Not up to date.** Otherwise the mod writes the brief again from the history right then: your earlier requests and, if the session was compacted, the summary the compaction kept. The band says `(after the first turn)` until it is written.

This covers sessions from before you installed the mod. It also covers a session that was just compacted and has no turn since: the brief saved before the compaction is set aside and written again from the compaction's summary, and the band shows once it is written. Turns from before a compaction are gone from the conversation, so only that summary speaks for them.

### Where the briefs are kept

In the mod's own store: a JSON file in `~/.claude/plugins/store/` whose name starts with `session-brief_`. Each way of loading the mod has a file of its own; loaded with `--plugin-dir`, for example, it is `session-brief_inline-<hash>.json`. The file holds one entry per session, under the key `brief:<session id>`: the six parts, a fingerprint of the last turn's request and answer, and when it was saved. The newest 200 sessions are kept; older entries are removed when a session starts.

### `/clear` starts over

The new conversation gets its own brief, saved under its new session id.

## Troubleshooting

The commands below need `rg` and `jq`.

### The band does not show

Check these in order:

1. **The mod is loaded.** Typing `/br` offers `/brief` with the description from [Install](#install). If it does not, check in `/plugin` that session-brief is enabled, then run `/reload-plugins`. If the `/brief` offered says "Toggle brief-only mode", that is a command built into Claude Code that a feature flag turns on, and the mod could not register its own `/brief`; open the pane with the band's `details` button or ctrl+x b instead.
2. **A turn has started.** The band shows from your first request on.
3. **Nothing covers it.** A dialog, a survey, or the brief's own pane hides the band.
4. **The band is not folded.** A folded band reads `▸ plugin panel hidden · <key> or click to show`; press the key it names (ctrl+x ctrl+a, or ctrl+x i with the bindings above) or click it.
5. **The session is interactive, in the terminal or the desktop app.** Non-interactive runs (`claude -p`) never show it, and the VS Code extension and mobile have no band.

### The brief does not update

Start Claude Code with `claude --debug` and look for the mod's lines in the debug log:

```bash
rg 'session-brief:' ~/.claude/debug/latest
```

| Line                                                   | What happened                                                                                                                                                                                                                                                                                                                                              | What to do                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `session-brief: Haiku gave no brief: <why>`            | Haiku's reply held no usable brief. The mod wrote one in its place, or left the brief as it was when the answer had no line for it (see [Cost and what is sent](#cost-and-what-is-sent)). `<why>` is `api-error status=<HTTP status, or null with no response> error=<kind>`, `empty-reply`, `aborted` (cut off, or past 30 seconds) or `unreadable-reply` | A rate limit or an overload passes on its own; the next turn tries again |
| `session-brief: summary failed: <error>`               | Claude Code would not send the call, for example because your settings do not allow Haiku. The brief stays as it was                                                                                                                                                                                                                                       | Allow Haiku, or disable the mod                                          |
| `session-brief: /brief was not registered: <error>`    | `/brief` was refused, for example because the build has a `/brief` of its own                                                                                                                                                                                                                                                                              | Open the pane with the band's `details` button or ctrl+x b               |
| `session-brief: following the session failed: <error>` | After `/clear` or `/resume`, the mod could not learn the new session                                                                                                                                                                                                                                                                                       | Quit and open the session again with `claude --resume`                   |

### The brief is wrong

Each brief is rewritten from the previous one, so a mistake can stay. To have it written again from the conversation:

1. Quit every Claude Code process that has the session open. While one runs, it still holds the brief and saves it again.
2. Remove the session's entry from the store (see [Where the briefs are kept](#where-the-briefs-are-kept)). First list every entry by its key and purpose, and find the session's key by its purpose:

   ```bash
   jq -r 'to_entries[] | "\(.key)\t\(.value.sections.purpose // "")"' ~/.claude/plugins/store/session-brief_*.json
   ```

   A key is `brief:` followed by the session id. The session id is the name of the session's transcript file under `~/.claude/projects/`, without `.jsonl`. Paste the key you found into the `key=` line, and remove that entry from every store file:

   ```bash
   key='<the key you found>'
   for f in ~/.claude/plugins/store/session-brief_*.json; do
     jq --arg key "$key" 'del(.[$key])' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
   done
   ```

   To start over for every session, delete the store files instead.
3. Open the session again with `claude --resume`. The mod reads the conversation back and writes a new brief.

## Uninstall

1. Remove the plugin and its marketplace:

   ```bash
   claude plugin uninstall session-brief@claude-session-brief
   claude plugin marketplace remove claude-session-brief
   ```

2. Remove the two key bindings from `~/.claude/keybindings.json`, if you added them.
3. To remove the saved briefs too, delete the store files:

   ```bash
   rm ~/.claude/plugins/store/session-brief_*.json
   ```

## Development

You need TypeScript 5.0 or later for `tsc`. Its settings come from `.claude-plugin/types/`, which Claude Code writes when it loads the mod from this folder, so run `claude --plugin-dir .` once after cloning (the folder is ignored by git). If the mod is also installed from the marketplace, disable that copy while you work (`claude plugin disable session-brief@claude-session-brief`), so the mod is not loaded twice.

```bash
claude plugin validate .claude-plugin/plugin.json   # the plugin: its manifest and its hooks module, read as Claude Code reads them
claude plugin validate .                            # the marketplace manifest (it does not read the hooks module)
claude plugin test .                                # run hooks/*.test.ts(x) on Claude Code's own mod runtime
claude --plugin-dir .                               # try it in a session
tsc -p .                                            # type-check
```

## License

[MIT](LICENSE)
