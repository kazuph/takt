# Vertical Slice + Core ハイブリッド構成 移行計画（構造移動と import 整理）

## 目的
- `docs/vertical-slice-migration-map.md` に従い、機能追加なしで構造移動と import 整理を行うための作業計画を定義する。
- 既存の `src/` 構成と依存関係を把握し、移行対象・参照元・Public API の整理ポイントを明確化する。

## 前提
- 変更対象は `src/` と `docs/` の参照更新のみ。
- 実装は行わず、移行の具体手順と注意点を記載する。

---

## 現状の `src/` 構成（トップレベル）
- `src/app/cli/*`
- `src/features/*`
- `src/core/*`
- `src/infra/*`
- `src/shared/*`
- その他: `src/agents/*`, `src/index.ts`

## 現状の依存関係（観測ベース）
- `app` -> `features`, `infra`, `shared`
- `features` -> `core`, `infra`, `shared`（`shared/prompt`, `shared/constants`, `shared/context`, `shared/exitCodes`）
- `infra` -> `core/models`, `shared`
- `core` -> `shared`, `agents`
- `agents` -> `infra`, `shared`, `core/models`, `infra/claude`

### 依存ルールとの差分（注意点）
- `core` が `shared` と `agents` に依存している（`core` は外側に依存しない想定）。
- `agents` が `infra` に依存しているため、`core -> agents -> infra` の依存経路が発生している。

---

## 移動対象の分類と移動先（確定）

### core
| 現在のパス | 移動先 | 備考 |
|---|---|---|
| `src/core/models/*` | `src/core/models/*` | 既に配置済み |
| `src/core/workflow/*` | `src/core/workflow/*` | 既に配置済み |

### infra
| 現在のパス | 移動先 | 備考 |
|---|---|---|
| `src/infra/providers/*` | `src/infra/providers/*` | 既に配置済み |
| `src/infra/github/*` | `src/infra/github/*` | 既に配置済み |
| `src/infra/config/*` | `src/infra/config/*` | 既に配置済み |
| `src/infra/task/*` | `src/infra/task/*` | 既に配置済み |
| `src/infra/fs/session.ts` | `src/infra/fs/session.ts` | 既に配置済み |
| `src/infra/claude/*` | `src/infra/claude/*` | 外部API連携のため infra に集約 |
| `src/infra/codex/*` | `src/infra/codex/*` | 外部API連携のため infra に集約 |
| `src/infra/mock/*` | `src/infra/mock/*` | Provider 用 mock のため infra に集約 |
| `src/infra/resources/*` | `src/infra/resources/*` | FS 依存を含むため infra に集約 |

### features
| 現在のパス | 移動先 | 備考 |
|---|---|---|
| `src/features/tasks/*` | `src/features/tasks/*` | 既に配置済み |
| `src/features/pipeline/*` | `src/features/pipeline/*` | 既に配置済み |
| `src/features/config/*` | `src/features/config/*` | 既に配置済み |
| `src/features/interactive/*` | `src/features/interactive/*` | 既に配置済み |

### app
| 現在のパス | 移動先 | 備考 |
|---|---|---|
| `src/app/cli/*` | `src/app/cli/*` | 既に配置済み |

### shared
| 現在のパス | 移動先 | 備考 |
|---|---|---|
| `src/shared/utils/*` | `src/shared/utils/*` | 既に配置済み |
| `src/shared/ui/*` | `src/shared/ui/*` | 既に配置済み |
| `src/shared/prompt/*` | `src/shared/prompt/*` | 共有UIユーティリティとして集約 |
| `src/shared/constants.ts` | `src/shared/constants.ts` | 共有定数として集約 |
| `src/shared/context.ts` | `src/shared/context.ts` | 共有コンテキストとして集約 |
| `src/shared/exitCodes.ts` | `src/shared/exitCodes.ts` | 共有エラーコードとして集約 |

---

## 移行対象と参照元の洗い出し（現状）

### core/models の参照元
- `src/infra/claude/client.ts`
- `src/infra/codex/client.ts`
- `src/agents/runner.ts`
- `src/agents/types.ts`
- `src/infra/config/global/globalConfig.ts`
- `src/infra/config/global/initialization.ts`
- `src/infra/config/loaders/agentLoader.ts`
- `src/infra/config/loaders/workflowParser.ts`
- `src/infra/config/loaders/workflowResolver.ts`
- `src/infra/config/paths.ts`
- `src/infra/providers/*`
- `src/features/interactive/interactive.ts`
- `src/features/tasks/execute/*`
- `src/features/pipeline/execute.ts`
- `src/shared/utils/debug.ts`
- `src/shared/constants.ts`
- `src/infra/resources/index.ts`
- `src/__tests__/*`

### core/workflow の参照元
- `src/features/tasks/execute/workflowExecution.ts`
- `src/__tests__/engine-*.test.ts`
- `src/__tests__/instructionBuilder.test.ts`
- `src/__tests__/it-*.test.ts`
- `src/__tests__/parallel-logger.test.ts`
- `src/__tests__/transitions.test.ts`

### infra/config の参照元
- `src/app/cli/*`
- `src/agents/runner.ts`
- `src/features/interactive/interactive.ts`
- `src/features/config/*`
- `src/features/tasks/execute/*`
- `src/features/tasks/add/index.ts`
- `src/features/tasks/list/taskActions.ts`
- `src/__tests__/*`

### infra/task の参照元
- `src/features/tasks/*`
- `src/features/pipeline/execute.ts`
- `src/__tests__/*`

### infra/github の参照元
- `src/app/cli/routing.ts`
- `src/features/pipeline/execute.ts`
- `src/features/tasks/execute/selectAndExecute.ts`
- `src/features/tasks/add/index.ts`
- `src/__tests__/github-*.test.ts`

### infra/providers の参照元
- `src/agents/runner.ts`
- `src/features/interactive/interactive.ts`
- `src/features/tasks/add/index.ts`
- `src/features/tasks/execute/types.ts`
- `src/__tests__/addTask.test.ts`
- `src/__tests__/interactive.test.ts`
- `src/__tests__/summarize.test.ts`

### infra/fs の参照元
- `src/features/tasks/execute/workflowExecution.ts`
- `src/__tests__/session.test.ts`
- `src/__tests__/utils.test.ts`

### shared/utils の参照元
- `src/app/cli/*`
- `src/infra/*`
- `src/features/*`
- `src/agents/runner.ts`
- `src/infra/claude/*`
- `src/infra/codex/*`
- `src/core/workflow/*`
- `src/__tests__/*`

### shared/ui の参照元
- `src/app/cli/*`
- `src/infra/task/display.ts`
- `src/features/*`
- `src/__tests__/*`

### shared/prompt の参照元
- `src/features/*`
- `src/infra/config/global/initialization.ts`
- `src/__tests__/*`

### shared/constants・shared/context・shared/exitCodes の参照元
- `src/features/*`
- `src/infra/config/global/*`
- `src/core/models/schemas.ts`
- `src/core/workflow/engine/*`
- `src/app/cli/routing.ts`
- `src/__tests__/*`

---

## Public API（index.ts）整理ポイント

### 既存 Public API
- `src/core/models/index.ts`
- `src/core/workflow/index.ts`
- `src/features/tasks/index.ts`
- `src/features/pipeline/index.ts`
- `src/features/config/index.ts`
- `src/features/interactive/index.ts`
- `src/infra/config/index.ts`
- `src/infra/task/index.ts`
- `src/infra/providers/index.ts`
- `src/shared/utils/index.ts`
- `src/shared/ui/index.ts`
- `src/index.ts`

### 新設/拡張が必要な Public API
- `src/infra/github/index.ts`（`issue.ts`, `pr.ts`, `types.ts` の集約）
- `src/infra/fs/index.ts`（`session.ts` の集約）
- `src/infra/resources/index.ts`（resources API の集約）
- `src/infra/config/index.ts` の拡張（`globalConfig`, `projectConfig`, `workflowLoader` などの再エクスポート）
- `src/shared/prompt/index.ts`（共通プロンプトの入口）
- `src/shared/constants.ts`, `src/shared/context.ts`, `src/shared/exitCodes.ts` の Public API 反映
- `src/infra/claude/index.ts`, `src/infra/codex/index.ts`, `src/infra/mock/index.ts`（移動後の入口）

### 深い import 禁止の置換方針
- `core/*` と `features/*` は Public API（`index.ts`）からのみ import。
- `features` から `infra` の deep import を廃止し、`infra/*/index.ts` 経由に置換。
- `app/cli` から `infra` への direct import は必要最小限に限定し、可能なら `features` Public API に集約。

---

## 影響範囲一覧

### CLI エントリ
- `src/app/cli/index.ts`
- `src/app/cli/program.ts`
- `src/app/cli/commands.ts`
- `src/app/cli/routing.ts`
- `src/app/cli/helpers.ts`
- `bin/takt`

### features 呼び出し
- `src/features/tasks/*`
- `src/features/pipeline/*`
- `src/features/config/*`
- `src/features/interactive/*`

### docs 参照更新対象
- `docs/data-flow.md`
- `docs/data-flow-diagrams.md`
- `docs/agents.md`
- `docs/workflows.md`
- `docs/README.ja.md`

### テスト
- `src/__tests__/*`

---

## 実施手順（推奨順序）

### 1. core
- `core/workflow` と `core/models` の Public API を点検し、外部参照を `index.ts` 経由に統一。
- `core` 内での `shared` 依存を整理する（ログ/エラー/レポート生成の配置を明確化）。
- `agents` 依存の扱いを決定し、依存方向を破らない構成に合わせて移動計画を確定する。

### 2. infra
- `infra/github` と `infra/fs` の `index.ts` を新設し、deep import を解消する前提の API を定義。
- `infra/config/index.ts` の再エクスポート対象を拡張し、`globalConfig`・`projectConfig`・`workflowLoader` 等を Public API 化。
- `claude/codex/mock/resources` を `infra` 配下に移動し、参照を更新する。

### 3. features
- `features` から `infra` への deep import を Public API 経由に置換。
- `prompt` の移動に合わせ、`features` 内の import を `shared/prompt` に変更。
- `constants/context/exitCodes` の移動に合わせて参照を更新。

### 4. app
- `app/cli` から `features` Public API のみを使用する形に整理。
- `app/cli` から `infra` へ直接参照している箇所は、必要に応じて `features` 経由に寄せる。

### 5. Public API
- `src/index.ts` の再エクスポート対象を新パスに合わせて更新。
- 新設した `index.ts` のエクスポート整合を確認する。

### 6. docs
- `docs/data-flow.md` など、`src/` 参照を新パスに合わせて更新。
- 参照パスが `index.ts` の Public API 方針に沿っているか点検。

---

## 判断ポイント
- `src/models/workflow.ts` が追加される場合、
  - **廃止**するか、
  - **`core/models/index.ts` へ統合**するかを決める。

---

## 再開指示（2026-02-02 時点の差分観測ベース）

### 現在のブランチ
- `refactoring`

### 進捗（差分ベースの整理）
#### core
- `src/core/models/*` と `src/core/workflow/*` が広範囲に変更されている。

#### infra
- 既存: `src/infra/config/*`, `src/infra/providers/*`, `src/infra/task/*`, `src/infra/github/*`, `src/infra/fs/session.ts` が更新されている。
- 追加: `src/infra/claude/*`, `src/infra/codex/*`, `src/infra/mock/*`, `src/infra/resources/*` が新規追加されている。
- 追加: `src/infra/github/index.ts`, `src/infra/fs/index.ts` が新規追加されている。

#### features
- `src/features/*` が広範囲に変更されている。

#### app
- `src/app/cli/*` が変更されている。

#### shared
- `src/shared/utils/index.ts` と `src/shared/ui/StreamDisplay.ts` が更新されている。
- `src/shared/prompt/*`, `src/shared/constants.ts`, `src/shared/context.ts`, `src/shared/exitCodes.ts` が新規追加されている。

#### 削除された旧パス
- `src/claude/*`, `src/codex/*`, `src/mock/*`, `src/prompt/*`, `src/resources/index.ts`
- `src/constants.ts`, `src/context.ts`, `src/exitCodes.ts`

#### tests
- `src/__tests__/*` が広範囲に更新されている。

#### resources
- `resources/global/{en,ja}/*` に更新があるため、移行作業とは独立して取り扱う。

#### docs
- `docs/vertical-slice-migration-plan.md` が未追跡ファイルとして存在する。

---

## 未完了セクション（要確認事項）
以下は差分観測のみでは断定できないため、再開時に確認する。

### core
- `core` から外部層（`shared` / `agents`）への依存が残っていないか確認する。
- `core/models` と `core/workflow` の Public API が `index.ts` 経由に統一されているか点検する。

### infra
- `infra/github/index.ts`, `infra/fs/index.ts`, `infra/resources/index.ts` の再エクスポート範囲を確定する。
- `infra/config/index.ts` の再エクスポート対象（`globalConfig`, `projectConfig`, `workflowLoader` 等）が揃っているか確認する。
- `infra/claude`, `infra/codex`, `infra/mock` の Public API が `index.ts` に統一されているか確認する。

### features
- `features` から `infra` への deep import が残っていないか確認する。
- `shared/prompt`, `shared/constants`, `shared/context`, `shared/exitCodes` への参照統一が完了しているか確認する。

### app
- `app/cli` が `features` Public API 経由に統一されているか確認する。
- `app/cli` から `infra` への direct import が残っていないか確認する。

### Public API
- `src/index.ts` の再エクスポートが新パスに揃っているか確認する。
- `infra`/`shared`/`features` の `index.ts` 追加分を反映できているか点検する。

### docs
- `docs/*` の参照パスを新構成（Public API）へ更新する。

---

## 判断ポイント（再掲）
- `src/models/workflow.ts` は直近コミットで削除されているため、
  - 廃止のまま進めるか、
  - `core/models/index.ts` へ統合して復活させるかを確定する。

---

## 参照更新の対象一覧（docs）
- `docs/data-flow.md`
- `docs/data-flow-diagrams.md`
- `docs/agents.md`
- `docs/workflows.md`
- `docs/README.ja.md`

---

## 付記
- ここに記載した移動は、既存の機能追加なしで行うこと。
- 実装時は `core -> infra -> features -> app -> Public API -> docs` の順序を厳守する。
