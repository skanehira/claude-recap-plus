# claude-recap-plus

[日本語](README.ja.md)

A [Claude Code](https://claude.com/claude-code) mod that shows a session summary right above the prompt. When you switch between sessions, you can see what each is for and where the work stands without scrolling through the conversation.

![369763f2](./images/README/369763f2.png)

## Requirements

- Claude Code 2.1.287 is the tested version. Mods are early access, and their API can change between releases.
- Hooks must be enabled in your settings and your organization's policy.

## Install

Run these commands in Claude Code:

```text
/plugin marketplace add skanehira/claude-recap-plus
/plugin install recap-plus@claude-recap-plus
/reload-plugins
```

Type `/recap` and check that `/recap-plus` appears. You can also check that `recap-plus@claude-recap-plus` is enabled with `claude plugin list`.

If you installed the plugin under its former name, disable that copy in `/plugin` before installing this one. Saved summaries and usage totals are not migrated; the new plugin rebuilds summaries from the conversation and starts usage totals from zero. Existing files are left in place.

## Usage

Start a conversation as usual. The band shows the session's purpose and status, and updates after each turn of the main conversation. During a turn, it keeps the previous summary and marks the status with `(working)`. The first summary appears after the first turn finishes.

Open the full summary with `/recap-plus` or the band's `details` button:

| Part           | What it shows                                                               |
| -------------- | --------------------------------------------------------------------------- |
| Purpose        | What the session is for, including the target file, feature or pull request |
| Status         | Where the work stands now                                                   |
| Done           | The latest 5 completed items                                                |
| Decisions      | The latest 5 decisions, including answers to Claude's questions             |
| Waiting on you | The latest 5 things Claude is waiting for you to answer or do               |
| Next           | What Claude will do next                                                    |

Text wraps to the available width. Close the pane with Esc or its `close` button; press `b` when the pane has focus. The band is hidden while the pane, a dialog or a survey is shown.

Summaries are saved per session. Resuming a session shows its saved summary, or generates one if it is missing or out of date. `/clear` starts a new summary.

### Keyboard shortcuts

Without custom bindings, use `/recap-plus` to open the pane, or ctrl+x tab to focus the band and then `b`. Use ctrl+x ctrl+a to fold or restore the band.

For shorter access, add these bindings to the `Chat` context in `~/.claude/keybindings.json`. `/keybindings` opens that file. If a `Chat` context already exists, add the two entries to its `bindings`. Changes apply without restarting Claude Code.

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

| Keys     | Action                                              |
| -------- | --------------------------------------------------- |
| ctrl+x b | Open the summary pane, or close it when it is shown |
| ctrl+x i | Fold or restore the band                            |

ctrl+x b works only while the band or summary pane is visible. If the band is folded or a dialog is open, use `/recap-plus` once the dialog closes. In the diff panel, ctrl+x b retains its usual action of cycling the comparison base.

### Language

The summary follows Claude Code's `language` setting, for example in `~/.claude/settings.json`:

```json
{
  "language": "Japanese"
}
```

Japanese settings such as `Japanese`, `日本語`, `ja` and `ja-JP` give Japanese labels and summaries. Other languages give English labels and summaries in the configured language. With no setting, both are English.

After changing the setting, run `/reload-plugins` or restart the session. Existing summary text changes language after the next turn.

## Cost and data

The mod uses Haiku through the same account and provider as your Claude Code session. It calls Haiku after each main conversation turn, and when opening a session that needs a new summary. These calls use tokens and follow your session's billing arrangements.

Summary requests include the previous summary, your request, Claude's final answer, questions and answers, and selected tool activity such as command descriptions, file paths, URLs and search queries. When rebuilding a summary, they can also include earlier requests and the compaction summary. File-read and file-search tool activity is excluded; text quoted in a request or answer can still be included.

Non-interactive runs (`claude -p`) do not generate summaries. To stop Haiku calls, disable the plugin in `/plugin` or run:

```bash
claude plugin disable recap-plus@claude-recap-plus
```

There is no mode that keeps the band without Haiku calls. See [request details](docs/architecture.md#コストと送る内容) and [usage totals](docs/troubleshooting.md#使用量の確認) for more information.

## Update

Refresh the marketplace, update the plugin, and restart Claude Code:

```bash
claude plugin marketplace update claude-recap-plus
claude plugin update recap-plus@claude-recap-plus
```

## Troubleshooting

- If the band does not appear, check that the plugin is enabled in `/plugin`, run `/reload-plugins`, and start a turn. Restore a folded band with ctrl+x ctrl+a or ctrl+x i if configured.
- Dialogs, surveys and the summary pane hide the band. The band is available in interactive terminal and desktop sessions; it is not available in the VS Code extension, mobile or `claude -p` runs.
- If `/recap-plus` is unavailable, try the band's `details` button or ctrl+x b if configured.
- If a summary is stale, allow the next turn to finish. For persistent failures or incorrect summaries, see [debugging and resetting summaries](docs/troubleshooting.md).

## Uninstall

```bash
claude plugin uninstall recap-plus@claude-recap-plus
claude plugin marketplace remove claude-recap-plus
```

Remove the two custom bindings from `~/.claude/keybindings.json` if you added them. To also delete all saved summaries and usage totals:

```bash
rm ~/.claude/plugins/store/recap-plus_*.json
```

## Documentation

The documents below are in Japanese.

- [Internal behavior](docs/architecture.md): summary generation, session lifecycle, storage and keyboard integration.
- [Development](docs/development.md): local setup and validation commands.
- [Detailed troubleshooting](docs/troubleshooting.md): debug logs, usage totals and resetting saved summaries.

## License

[MIT](LICENSE)
