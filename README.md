# XY Poker

XYポーカーは、3×5のボードでプレイする戦略的カードゲームです。縦（Y軸）と横（X軸）の役を駆使して相手と得点を競います。

## 🎮 プレイ方法

**公開URL:** https://xy-poker.vercel.app/

### ゲームモード
- **ローカル対戦（vs AI）**: コンピュータと対戦
- **オンライン対戦**: 友達とリアルタイムで対戦

## 🏗️ アーキテクチャ

### フロントエンド
- **フレームワーク**: React 19 + TypeScript + Vite
- **デプロイ先**: Vercel (https://xy-poker.vercel.app/)
- **主要技術**: 
  - React Hooks (useReducer, useState, useEffect)
  - Socket.IO Client (オンライン対戦用)

### バックエンド（オンライン対戦サーバー）
- **サーバー**: Node.js + Express + Socket.IO
- **デプロイ先**: Render (https://xy-poker.onrender.com)
- **ファイル**: `server/index.js`

### プロジェクト構成
```
xy-poker/
├── src/
│   ├── components/      # React コンポーネント
│   │   ├── Board.tsx/css
│   │   ├── Card.tsx/css
│   │   ├── Dice.tsx/css
│   │   ├── GameInfo.tsx/css
│   │   ├── GameResult.tsx/css
│   │   ├── Hand.tsx/css
│   │   ├── Lobby.tsx/css
│   │   └── SharedBoard.tsx/css
│   ├── logic/           # ゲームロジック
│   │   ├── game.ts      # ゲームステート管理（Reducer）
│   │   ├── deck.ts      # カード生成・シャッフル
│   │   ├── evaluation.ts # 役判定（Y軸・X軸）
│   │   ├── scoring.ts   # スコア計算
│   │   ├── ai.ts        # AI思考エンジン
│   │   ├── online.ts    # Socket.IO接続設定
│   │   └── types.ts     # 型定義
│   ├── App.tsx          # メインアプリケーション
│   └── main.tsx         # エントリーポイント
├── server/
│   └── index.js         # Socket.IOサーバー（オンライン対戦）
└── start-services.sh    # ローカル開発用サーバー起動スクリプト
```

## 🚀 開発環境セットアップ

### 必要条件
- Node.js 18+
- npm

### インストール
```bash
npm install
```

### ローカル開発
#### フロントエンドのみ（ローカル対戦）
```bash
npm run dev
# http://localhost:5173 でアクセス
```

#### オンライン対戦も含む（フルスタック）
```bash
# ターミナル1: フロントエンド
npm run dev

# ターミナル2: Socket.IOサーバー
node server/index.js
```

または、tmuxを使った一括起動：
```bash
./start-services.sh
```

## 🌐 デプロイ情報

### フロントエンド (Vercel)
- **URL**: https://xy-poker.vercel.app/
- **自動デプロイ**: `main`ブランチへのpush時に自動デプロイ
- **環境変数**: 不要（ビルド時に`import.meta.env.PROD`で判定）

### バックエンド (Render)
- **URL**: https://xy-poker.onrender.com
- **デプロイ方法**: Render ダッシュボードから手動デプロイ、またはGitHub連携
- **起動コマンド**: `node server/index.js`
- **ポート**: 3001（環境変数`PORT`で上書き可能）

### 接続設定
フロントエンドは`src/logic/online.ts`で環境を判定：
- **開発環境**: `http://localhost:3001`
- **本番環境**: `https://xy-poker.onrender.com`

## 🎯 ゲームルール

### 基本ルール
1. 各プレイヤーは3×5のボードにカードを配置
2. 初期手札4枚、カード配置後に1枚ドロー
3. 各列の上部にダイス（1-6）が配置され、これが得点の重みになる
4. 15枚配置完了後、得点計算

### 役（Y軸：縦列3枚）
- ストレートフラッシュ
- スリーカード
- フラッシュ
- ストレート
- ワンペア
- ハイカード

### 役（X軸：横列5枚・最下段のみ）
- ロイヤルフラッシュ（即勝利）
- ストレートフラッシュ
- フォーカード
- フルハウス
- フラッシュ
- ストレート
- スリーカード
- ツーペア
- ワンペア
- ハイカード

### 特殊ルール
- **裏向き配置**: 各プレイヤー最大3枚まで裏向きで配置可能（ジョーカーは不可）
- **列ボーナス**: 相手より先に列を完成させると、ボーナスカード1枚獲得
- **同じ列に3枚すべて裏向き**: 不可

## 🛠️ 技術スタック

- **言語**: TypeScript
- **フロントエンド**: React 19, Vite
- **バックエンド**: Node.js, Express
- **リアルタイム通信**: Socket.IO
- **デプロイ**: Vercel (フロント), Render (バックエンド)
- **リンター**: ESLint

## 📝 最近の更新履歴

### 2025-12-05
- ✅ オンライン対戦の安定性向上
  - ホストのみがゲーム開始可能に変更
  - ゲスト側に待機メッセージ追加
  - ゲーム状態の同期処理改善
- ✅ 本番環境での接続修正（VercelからRenderサーバーへの接続）

## 🤝 コントリビューション

プルリクエストを歓迎します。大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## 📄 ライセンス

MIT
