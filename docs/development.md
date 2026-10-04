# 開発手順

- 種別: 開発手順書

[利用ガイド](../README.ja.md) · [内部動作](architecture.md)

`tsc` には TypeScript 5.0 以上が要ります。`tsc` の設定は `.claude-plugin/types/` から読みます。このフォルダは Claude Code がこのフォルダから mod を読み込んだときに書き出すもので、git には入れていません。clone した後に一度 `claude --plugin-dir .` を起動してください。マーケットプレイスからもインストールしているなら、同じ mod が 2 つ読み込まれないよう、開発の間はそちらを無効にします (`claude plugin disable recap-plus@claude-recap-plus`)。

```bash
claude plugin validate .claude-plugin/plugin.json   # プラグインを検査する。manifest と hooks module を Claude Code と同じ読み方で読む
claude plugin validate .                            # マーケットプレイスと、含まれるプラグインを検査する
claude plugin test .                                # hooks/*.test.ts(x) を Claude Code 自身の mod の実行環境で動かす
claude --plugin-dir .                               # セッションで試す
tsc -p .                                            # 型を検査する
```
