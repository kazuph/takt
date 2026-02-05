---
name: takt-usage
description: TAKT CLI の使い方と運用フロー（実行/再開/PR作成/ログ確認）を案内する。
allowed-tools: Bash
---

# TAKT CLI Usage Guide

## 目的
- takt の基本コマンドと運用の流れを短時間で理解できるようにする
- 失敗時のリカバリ（ログ確認・PR再作成）まで案内する

## 使い方（要約）

### 1) タスク実行
```
# 直接実行
takt "タスク内容"

# インタラクティブ
takt
```

### 2) ログ監視
```
# 最新ログの tail
takt log

# 特定セッション
takt log --session <id>
```

### 3) PR再作成
```
# 最新のtaktブランチでPR作成
takt pr

# ブランチ指定
takt pr --branch <branch>
```

### 4) ブランチ管理
```
# 一覧
takt list

# マージ＋削除
takt list -> Merge & cleanup
```

## 注意点
- worktree を使う場合、.takt は project root に集約される
- PR作成は LLM 生成→gh pr create の流れ
- PRが作れない場合は `takt pr` で再実行可能

## よくあるトラブル
- PR作成失敗: ブランチ未push / 差分なし
- レポート欠落: report phase 未実行 → ログ確認

