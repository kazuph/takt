# 実装計画: Vertical Slice + Core ハイブリッド構成移行の検証・修正

## 現状分析

### ビルド・テスト状況
- **ビルド (`npm run build`)**: ✅ パス（エラーなし）
- **テスト (`npm test`)**: ✅ 全54ファイル、802テストパス

### レビュー結果サマリ

| 観点 | 結果 | 詳細 |
|------|------|------|
| 依存方向の違反 | ✅ 違反なし | core→infra/features/app なし、features→app なし、infra→features/app なし |
| 旧パスの残留 | ✅ 残留なし | src/claude/, src/codex/, src/mock/, src/prompt/, src/resources/, src/constants.ts, src/context.ts, src/exitCodes.ts への参照なし |
| docs参照パスの整合 | ✅ 問題なし | 5ファイルすべて新構成のパスに更新済み |
| Public API (index.ts) 経由の統一 | ⚠️ 修正必要 | プロダクションコードに4箇所のdeep import違反あり |

## 修正が必要な箇所

### Public API (index.ts) 経由の統一 — deep import 違反（プロダクションコード4箇所）

#### 1. `src/infra/claude/types.ts`
- **現状**: `import type { PermissionResult } from '../../core/workflow/types.js'`
- **問題**: `core/workflow/index.ts` を経由せず直接 `types.js` を参照
- **対応**: `PermissionResult` を `core/workflow/index.ts` からエクスポートし、import パスを `../../core/workflow/index.js` に変更

#### 2. `src/shared/ui/StreamDisplay.ts`
- **現状**: `import type { StreamEvent, StreamCallback } from '../../core/workflow/types.js'`
- **問題**: `core/workflow/index.ts` を経由せず直接 `types.js` を参照（これらの型は既にindex.tsでエクスポート済み）
- **対応**: import パスを `../../core/workflow/index.js` に変更

#### 3. `src/features/config/switchConfig.ts`（2箇所）
- **現状**: `import type { PermissionMode } from '../../infra/config/types.js'` および `export type { PermissionMode } from '../../infra/config/types.js'`
- **問題**: `infra/config/index.ts` を経由せず直接 `types.js` を参照
- **対応**: `PermissionMode` を `infra/config/index.ts` からエクスポートし、import/export パスを `../../infra/config/index.js` に変更

### テストコードの deep import（33箇所）
- テストコードはモジュール内部を直接テストする性質上、deep import は許容範囲
- **今回は修正対象外とする**（機能追加しない制約に基づき、テストの構造変更は行わない）

## 実装手順

### Step 1: core/workflow の Public API 修正
1. `src/core/workflow/index.ts` を確認し、`PermissionResult` をエクスポートに追加
2. `src/infra/claude/types.ts` の import パスを `../../core/workflow/index.js` に変更
3. `src/shared/ui/StreamDisplay.ts` の import パスを `../../core/workflow/index.js` に変更

### Step 2: infra/config の Public API 修正
1. `src/infra/config/index.ts` を確認し、`PermissionMode` をエクスポートに追加
2. `src/features/config/switchConfig.ts` の import/export パスを `../../infra/config/index.js` に変更

### Step 3: 最終確認
1. `npm run build` でビルド確認
2. `npm test` でテスト確認

## 制約の確認
- ✅ 機能追加は行わない（import パスとエクスポートの整理のみ）
- ✅ 変更対象は `src/` のみ（`docs/` は変更不要）
