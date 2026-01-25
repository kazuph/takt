# TAKT

**T**ask **A**gent **K**oordination **T**ool - Claude Code向けのマルチエージェントオーケストレーションシステム（Codex対応予定）

> **Note**: このプロジェクトは個人のペースで開発されています。詳細は[免責事項](#免責事項)をご覧ください。

## 必要条件

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) がインストール・設定済みであること

## インストール

```bash
npm install -g takt
```

## クイックスタート

```bash
# タスクを実行（ワークフロー選択プロンプトが表示されます）
takt "ログイン機能を追加して"

# ワークフローを切り替え
takt /switch

# 保留中のタスクをすべて実行
takt /run-tasks
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `takt "タスク"` | ワークフロー選択後にタスクを実行 |
| `takt -r "タスク"` | 前回のセッションを再開してタスクを実行 |
| `takt /run-tasks` | 保留中のタスクをすべて実行 |
| `takt /switch` | ワークフローを対話的に切り替え |
| `takt /clear` | エージェントの会話セッションをクリア |
| `takt /help` | ヘルプを表示 |

## 実践的な使い方ガイド

### `-r` でセッションを再開する

TAKTの実行中にエージェントから追加の情報を求められた場合（例：「詳細を教えてください」）、`-r`フラグを使って会話を継続できます：

```bash
# 最初の実行 - エージェントが確認を求めることがある
takt "ログインのバグを直して"

# 同じセッションを再開して要求された情報を提供
takt -r "パスワードに特殊文字が含まれているとバグが発生します"
```

`-r`フラグはエージェントの会話履歴を保持し、自然なやり取りを可能にします。

### MAGIシステムで遊ぶ

MAGIはエヴァンゲリオンにインスパイアされた審議システムです。3つのAIペルソナがあなたの質問を異なる視点から分析し、投票します：

```bash
# プロンプトが表示されたら'magi'ワークフローを選択
takt "RESTからGraphQLに移行すべきか？"
```

3つのMAGIペルソナ：
- **MELCHIOR-1**（科学者）：論理的、データ駆動の分析
- **BALTHASAR-2**（母性）：チームと人間中心の視点
- **CASPER-3**（現実主義者）：実用的で現実的な考慮

各ペルソナは APPROVE、REJECT、または CONDITIONAL で投票します。最終決定は多数決で行われます。

### `/run-tasks` でバッチ処理

`/run-tasks`コマンドは`.takt/tasks/`ディレクトリ内のすべてのタスクファイルを実行します：

```bash
# 思いつくままにタスクファイルを作成
echo "認証モジュールのユニットテストを追加" > .takt/tasks/001-add-tests.md
echo "データベースレイヤーをリファクタリング" > .takt/tasks/002-refactor-db.md
echo "APIドキュメントを更新" > .takt/tasks/003-update-docs.md

# すべての保留タスクを実行
takt /run-tasks
```

**動作の仕組み：**
- タスクはアルファベット順に実行されます（`001-`、`002-`のようなプレフィックスで順序を制御）
- 各タスクファイルには実行すべき内容の説明を含めます
- 完了したタスクは実行レポートとともに`.takt/completed/`に移動されます
- 実行中に追加された新しいタスクも動的に取得されます

**タスクファイルの形式：**

```markdown
# .takt/tasks/add-login-feature.md

アプリケーションにログイン機能を追加する。

要件：
- ユーザー名とパスワードフィールド
- フォームバリデーション
- 失敗時のエラーハンドリング
```

これは以下のような場合に最適です：
- アイデアをファイルとしてキャプチャするブレインストーミングセッション
- 大きな機能を小さなタスクに分割する場合
- タスクファイルを生成する自動化パイプライン

### カスタムワークフローの追加

`~/.takt/workflows/`にYAMLファイルを追加して独自のワークフローを作成できます：

```yaml
# ~/.takt/workflows/my-workflow.yaml
name: my-workflow
description: カスタムワークフロー

max_iterations: 5

steps:
  - name: analyze
    agent: ~/.takt/agents/my-agents/analyzer.md
    instruction_template: |
      このリクエストを分析してください: {task}
    transitions:
      - condition: done
        next_step: implement

  - name: implement
    agent: ~/.takt/agents/default/coder.md
    instruction_template: |
      分析に基づいて実装してください: {previous_response}
    pass_previous_response: true
    transitions:
      - condition: done
        next_step: COMPLETE
```

### エージェントをパスで指定する

ワークフロー定義ではファイルパスを使ってエージェントを指定します：

```yaml
# ビルトインエージェントを使用
agent: ~/.takt/agents/default/coder.md
agent: ~/.takt/agents/magi/melchior.md

# プロジェクトローカルのエージェントを使用
agent: ./.takt/agents/my-reviewer.md

# 絶対パスを使用
agent: /path/to/custom/agent.md
```

カスタムエージェントプロンプトをMarkdownファイルとして作成：

```markdown
# ~/.takt/agents/my-agents/reviewer.md

あなたはセキュリティに特化したコードレビュアーです。

## 役割
- セキュリティ脆弱性をチェック
- 入力バリデーションを検証
- 認証ロジックをレビュー

## 出力形式
- [REVIEWER:APPROVE] コードが安全な場合
- [REVIEWER:REJECT] 問題が見つかった場合（問題点をリストアップ）
```

### ワークフロー変数

`instruction_template`で使用可能な変数：

| 変数 | 説明 |
|------|------|
| `{task}` | 元のユーザーリクエスト |
| `{iteration}` | 現在のイテレーション番号 |
| `{max_iterations}` | 最大イテレーション数 |
| `{previous_response}` | 前のステップの出力（`pass_previous_response: true`が必要） |
| `{user_inputs}` | ワークフロー中の追加ユーザー入力 |
| `{git_diff}` | 現在のgit diff（コミットされていない変更） |

## ワークフロー

TAKTはYAMLベースのワークフロー定義を使用します。以下に配置してください：
- `~/.takt/workflows/*.yaml`

### ワークフローの例

```yaml
name: default
max_iterations: 10

steps:
  - name: implement
    agent: coder
    instruction_template: |
      {task}
    transitions:
      - condition: done
        next_step: review
      - condition: blocked
        next_step: ABORT

  - name: review
    agent: architect
    transitions:
      - condition: approved
        next_step: COMPLETE
      - condition: rejected
        next_step: implement
```

## ビルトインエージェント

- **coder** - 機能を実装しバグを修正
- **architect** - コードをレビューしフィードバックを提供
- **supervisor** - 最終検証と承認

## カスタムエージェント

`.takt/agents.yaml`でカスタムエージェントを定義：

```yaml
agents:
  - name: my-reviewer
    prompt_file: .takt/prompts/reviewer.md
    allowed_tools: [Read, Glob, Grep]
    status_patterns:
      approved: "\\[APPROVE\\]"
      rejected: "\\[REJECT\\]"
```

## プロジェクト構造

```
~/.takt/
├── config.yaml          # グローバル設定
├── workflows/           # ワークフロー定義
└── agents/              # エージェントプロンプトファイル
```

## API使用例

```typescript
import { WorkflowEngine, loadWorkflow } from 'takt';  // npm install takt

const config = loadWorkflow('default');
if (!config) {
  throw new Error('Workflow not found');
}
const engine = new WorkflowEngine(config, process.cwd(), 'My task');

engine.on('step:complete', (step, response) => {
  console.log(`${step.name}: ${response.status}`);
});

await engine.run();
```

## 免責事項

このプロジェクトは個人プロジェクトであり、私自身のペースで開発されています。

- **レスポンス時間**: イシューにすぐに対応できない場合があります
- **開発スタイル**: このプロジェクトは主に「バイブコーディング」（AI支援開発）で開発されています - **自己責任でお使いください**
- **プルリクエスト**:
  - 小さく焦点を絞ったPR（バグ修正、タイポ、ドキュメント）は歓迎します
  - 大きなPR、特にAI生成の一括変更はレビューが困難です

詳細は[CONTRIBUTING.md](../CONTRIBUTING.md)をご覧ください。

## Docker サポート

他の環境でのテスト用にDocker環境が提供されています：

```bash
# Dockerイメージをビルド
docker compose build

# コンテナでテストを実行
docker compose run --rm test

# コンテナでlintを実行
docker compose run --rm lint

# ビルドのみ（テストをスキップ）
docker compose run --rm build
```

これにより、クリーンなNode.js 20環境でプロジェクトが正しく動作することが保証されます。

## ドキュメント

- [Workflow Guide](./workflows.md) - ワークフローの作成とカスタマイズ
- [Agent Guide](./agents.md) - カスタムエージェントの設定
- [Changelog](../CHANGELOG.md) - バージョン履歴
- [Security Policy](../SECURITY.md) - 脆弱性報告

## ライセンス

MIT - 詳細は[LICENSE](../LICENSE)をご覧ください。
