---
name: takt-workflow-generator
description: 自然言語の要求からTAKTワークフローYAMLを生成し、検証手順まで提示する。
allowed-tools: Read, Write, Grep, Glob
---

# TAKT Workflow Generator

## 目的
- 自然言語の要求をTAKTのworkflow YAMLに落とし込む
- 生成後の検証（読み込み/実行）手順を必ず付ける

## 入力（例）
- 「Opusで実装してCodexでレビュー、Geminiで長文確認したい」
- 「plan→implement→review→superviseの4段階」

## 出力ルール
- `resources/global/ja/workflows/<name>.yaml` を作成
- description は日本語で明確に
- provider/model を step 毎に指定
- report 設定を含める

## 手順
1) 既存workflowのパターンを `resources/global/ja/workflows` から抽出
2) 仕様を YAML に落とし込み
3) ワークフロー名・説明・ステップ順を明記
4) 追加したら必ず検証手順を提示

## 検証手順（必須）
```
# ワークフロー名が一覧に出ること
ls resources/global/ja/workflows

# 実行確認（dry-runは無いので通常実行）
takt "テストタスク" -w <workflow>
```

