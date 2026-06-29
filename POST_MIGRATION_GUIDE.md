# XY Poker - 新Mac移行後の開発引継ぎ・設定ガイド (Post-Migration AI Guide)

このファイルは、開発環境が新しいMacに移行された直後に、開発を引き継ぐAIアシスタント（Antigravity等）が最初に行うべき設定手順とタスクをまとめた機械可読性の高いガイドです。

---

## 1. プロジェクトの基本情報 (Project Overview)
- **フロントエンド**: React 19 + TypeScript + Vite 7 + Vanilla CSS
  - **ホスティング**: Cloudflare Pages (`https://xy-poker.pages.dev`)
- **バックエンド**: Node.js + Express 5 + Socket.IO 4
  - **ホスティング**: Render (`https://xy-poker.onrender.com`)
- **データベース**: Supabase (PostgreSQL)
  - **URL**: `https://fhtltghsqlwhjjzawhud.supabase.co`

---

## 2. 移行直後に実行すべき手順 (Immediate Action Items)

### [必須] 1. データベース・マイグレーションの実行
協調学習AI機能を利用するため、新しいMacから、またはSupabaseダッシュボードから、以下のSQLファイルの内容を「SQL Editor」で実行してください。
- **適用スクリプト**: [supa_schema_v7_ai.sql](file:///Users/watanabesotaro/xy-poker/supa_schema_v7_ai.sql)
- **実行内容**: `ai_global_parameters` テーブルの作成、初期レコード挿入、RLSポリシーの有効化。

### [必須] 2. 環境変数ファイル (.env) の確認
AirDropでプロジェクトフォルダを丸ごと移行した場合は、Finder上で隠しファイルが表示されているか確認します（`Cmd + Shift + .` で表示切替）。以下の2つのファイルが存在し、正しいキーが設定されているか確認してください。

#### ① ルートディレクトリの `.env`
```env
VITE_SUPABASE_URL=https://fhtltghsqlwhjjzawhud.supabase.co
VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZodGx0Z2hzcWx3aGpqemF3aHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjIxNjYsImV4cCI6MjA5Nzg5ODE2Nn0.noIW3nIi7no33Re6lyYC7g19PVxfZ6rB-Jx2LjInH40
```

#### ② サーバーディレクトリの `server/.env`
```env
SUPABASE_URL=https://fhtltghsqlwhjjzawhud.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZodGx0Z2hzcWx3aGpqemF3aHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjIxNjYsImV4cCI6MjA5Nzg5ODE2Nn0.noIW3nIi7no33Re6lyYC7g19PVxfZ6rB-Jx2LjInH40
```

### [必須] 3. パッケージの再インストール
`node_modules` は移行時に削除されているため、新Mac上で依存関係を最優先で修復してください。
```bash
# フロントエンド（ルート）のインストール
npm install

# バックエンド（サーバー）のインストール
cd server
npm install
cd ..
```

### [必須] 4. 各種開発ツールのログイン認証
1. **Cloudflare のログイン認証** (デプロイ用)
   ```bash
   npx wrangler login
   ```
2. **GitHub のSSH/HTTPS接続テスト** (Render自動デプロイのトリガー用)
   ```bash
   ssh -T git@github.com
   ```

---

## 3. 動作確認 & デプロイ手順 (Verification & Deployment)

### 1. ローカルでの動作検証
フロントエンドとバックエンドを同時に起動させ、http://localhost:5173 でAI対戦やオンライン対戦が正常動作するか確認します。
```bash
npm run dev:all
```

### 2. 本番デプロイの実行（超重要）
このプロジェクトは**独自のデプロイ規約**を持っています。手動で `wrangler deploy` や `git push` を行わず、必ず以下のスクリプトを呼び出してください。
```bash
npm run deploy -- "コミットメッセージ"
```
**※ スクリプトが自動実行すること:**
- バージョン番号を現在時刻（`vMMDDhhmm`）に自動更新して `src/App.tsx` 内を置換。
- 未コミットファイルを自動で `git add` & `git commit`。
- フロントエンドをビルドし、Cloudflare Pages へデプロイ。
- GitHub (`main` ブランチ) へプッシュし、Render の自動ビルドをトリガー。

---

## 4. 厳格に遵守すべき開発ルール (Development Constraints)

開発を引き継ぐAIは、以下のルールを**例外なく遵守**すること。

1.  **バージョン番号の更新**:
    - コードに変更を加える度に、必ず現在時刻（`vMMDDhhmm` 形式）でバージョンを更新すること（デプロイスクリプトが自動で実施）。
2.  **デュアルデプロイの同期**:
    - 更新のたびにフロントエンドとバックエンドの両方にデプロイすること（必ず `npm run deploy` を使用）。
3.  **READMEの更新**:
    - バージョン更新の度に `README.md` の「Recent Changes」に詳細なログを追加し、進捗状況を常に最新に保つこと。
4.  **座標移動のルール**:
    - UIやアニメーションでの縦方向の座標移動には、`margin-top` や `top` を絶対に使用せず、パフォーマンス向上のため必ず `transform: translateY(...)` を使用すること。
