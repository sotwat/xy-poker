# XYポーカーの自己対戦学習

OpenSpielの情報集合モンテカルロ木探索（IS-MCTS）とPyTorchを使う、ローカルの学習ツールです。自己対戦の探索分布と最終勝敗から、着手確率・勝敗予測を同じネットワークで学びます。学習した予測を次の探索へ戻します。

有料API、クラウド、アカウント登録は不要です。インストール時だけ無料の公開パッケージを取得します。学習・評価中は外部へ通信せず、このMacのCPUで計算します。現在の対戦画面や本番AIは変更しません。

## 準備

Node.js 20.19以上、[uv](https://docs.astral.sh/uv/getting-started/installation/)が必要です。プロジェクトのルートで実行します。

```sh
npm run selfplay:setup
npm run selfplay:test
```

Python 3.11と専用環境 `.venv-selfplay` を使います。依存バージョンは `requirements.lock` に固定しています。他のPython環境にはインストールしません。

## 学習を始める

```sh
npm run selfplay:train -- --output .selfplay/my-ai --minutes 30
```

既定は1世代8局、1判断128シミュレーション、1世代64回の学習、追加10世代です。30分または世代数の上限で保存して終了します。CPUは2スレッドを使います。`Ctrl+C` でも保存して終了します。

```sh
npm run selfplay:train -- --output .selfplay/my-ai --minutes 30 --resume
```

再開時は学習設定を揃えます。`--iterations` は再開後に追加する世代数です。世代途中で終わった場合は残りの対局から進みます。実行中の対局は破棄し、同じ配札・乱数でやり直します。学習更新中に停止した場合も更新前へ戻して保存します。完了した対局と直前までの世代は失いません。

## 継続監督と停止

30分枠ごとの安全保存と再開を自動で繰り返します。既存の学習PIDがあれば引き継ぎ、空き容量不足や連続3回のエラーで安全停止します。基準モデル（`model-00002.pt`）、最新世代、10世代ごとの節目モデルを保持し、古い中間世代を整理します。

```sh
npm run selfplay:supervise -- --output .selfplay/final-verification --minutes 30
```

累計2,000自己対戦局ごとに、その時点のモデルを固定し現行A9と50配札×2席＝100局の評価を行います（`--a9-every 2000 --a9-pairs 50`）。評価中は学習を一時停止し、完了後に自動再開します。評価も30分ごとに保存・再開するため、中断で完了済み配札を失いません。未完了の席交換組は同じ配札からやり直します。

結果は `a9-milestones/games-00002000/result.json` などへ、勝敗・引分・配札単位の95%区間・学習局数・モデルハッシュとともに保存します。モデル原本も同じフォルダへ保持します。各節目は異なる評価配札を使い、学習配札と分離します。100局は経過確認で、強度向上の保証や本番への自動昇格はありません。評価設定は途中で変更しないでください。

停止方法：

```sh
npm run selfplay:stop -- .selfplay/final-verification
```

または出力先に `stop.flag` を作成します。実行中のセッションが安全に保存されて終了します。

短い動作確認：

```sh
npm run selfplay:train -- --output .selfplay/quick --iterations 1 --games 2 --simulations 8 --steps 8 --eval-pairs 1 --minutes 3
```

この軽量設定は動作確認用です。探索回数が少ないと、合法手を一度ずつ試すだけで予算を使い切り、着手の良し悪しを十分比較できません。強度評価には使わないでください。

## 保存するもの

| ファイル | 内容 |
| --- | --- |
| `latest.pt` | モデル、最適化状態、乱数、学習データ、過去4モデル、世代・対局進捗 |
| `model-00001.pt` など | 世代別の推論用モデル |
| `events.jsonl` | 配札seed、全着手、最終得点、損失、モデルハッシュ、評価結果 |
| `run.lock` | 同じ出力先での二重起動を防ぐOSロック |

モデルは一時ファイルからの置換で保存します。学習データは直近20,000判断に制限します。世代別モデルとログは増え続けるため、長期間の運用では空き容量を確認してください。保存先とPython環境はGitの対象外です。モデルは `weights_only=True` で読み込みます。

ルール・観測表現・ブリッジのハッシュが異なるチェックポイントは読み込みを拒否します。該当コードを変更した場合は別の出力先から学習してください。再現性の確認は、同じ依存バージョン・CPU実行環境が対象です。

## 強さを測る

現行のA9と、学習に使っていない配札を席交換して対戦します。

```sh
npm run selfplay:evaluate -- --checkpoint .selfplay/my-ai/latest.pt --opponent a9 --pairs 20 --minutes 30 --output .selfplay/my-ai/a9-evaluation.json
```

`--pairs 20` は20配札×2席の40局です。A9には本体の既定設定（最大64標本、1判断1,000ms）を使います。比較用の `--opponent a7` はA7・1標本の軽量設定、`--opponent random` は合法手の一様選択です。軽量A7の結果を現行A9への勝率として扱わないでください。

過去モデルとの比較：

```sh
npm run selfplay:evaluate -- --checkpoint .selfplay/my-ai/latest.pt --opponent-checkpoint .selfplay/my-ai/model-00001.pt --pairs 20 --output .selfplay/my-ai/previous-evaluation.json
```

評価は対になる2局を完了するたびに保存します。時間切れ・`Ctrl+C` では完了済みの組だけを集計します。`complete: false` は指定組数に未到達です。既存の評価ファイルは上書きしないので、別の名前を指定してください。評価の再開機能はありません。

報告には勝敗・引分、勝敗効用の平均、配札単位のHoeffding 95%区間を含めます。席交換の2局を独立した2標本とは数えません。少数の対局で勝ち越しても強くなったとは判断しません。学習seedは `0〜2³¹−1`、評価seedは `2³¹〜2³²−1` に分離しています。毎世代の過去モデル比較は同じ固定配札での進捗確認です。最終評価は別の `--seed` で行い、その結果を見て同じ配札に合わせて調整しないでください。本番への自動昇格は行いません。

## 学習したモデルで1手選ぶ

本体の内部形式 `GameState` をJSONファイルに保存して指定します。

```sh
npm run selfplay:act -- --checkpoint .selfplay/my-ai/latest.pt --state .selfplay/state.json
```

JSONで行動ID・本体用の着手・探索分布を返します。対戦画面への接続は行っていません。

## 非公開情報と方式の限界

- 判断入力は自分の手札・盤面、相手の公開札と伏せ位置、公開される枚数・ダイス・進行状態です。相手手札、相手伏せ札の実際の内容、山札順序は入力しません。
- 探索では、見えていない札を52枚から重複なく一様に割り当て直します。ゲーム本体の正解の札を使った探索は行いません。未知札の一様分布は近似で、相手の過去の選択から推定した事後分布ではありません。
- 情報集合のキーは現在の観測です。過去の観測履歴をすべて保持する完全記憶モデルではありません。探索を含む戦略は近似で、ナッシュ均衡への収束や相手からの搾取されにくさを保証しません。
- ゲームの初期配札を隠れた確率事象として標本化します。状態遷移、ボーナスドロー、手番、採点は本体の `gameReducer` で実行します。
- 報酬は勝利+1・引分0・敗北−1です。毎4局のうち1局は保存済みの過去モデルとも対戦し、そのときは更新対象モデル側の判断だけを学習データに加えます。

AlphaGo Zeroの自己対戦・方策/価値学習・探索の循環を、XYの不完全情報へ合わせた研究用の構成です。AlphaGo Zeroそのものの再実装、強度向上、最適戦略到達を保証するものではありません。

## 利用する無料ライブラリ

| ライブラリ | 用途 | ライセンス・公式資料 |
| --- | --- | --- |
| OpenSpiel 2.0.2 | IS-MCTSの既存実装 | [Apache-2.0](https://github.com/google-deepmind/open_spiel/blob/master/LICENSE)、[ISMCTS実装](https://github.com/google-deepmind/open_spiel/blob/master/open_spiel/python/algorithms/ismcts.py) |
| PyTorch 2.14.1 | 方策・価値ネットワーク、最適化、保存 | [BSD形式](https://github.com/pytorch/pytorch/blob/main/LICENSE) |
| NumPy 2.4.6 | 乱数、分布、集計 | [BSD-3-Clause](https://numpy.org/doc/stable/license.html) |

RLCardも比較候補として調べましたが、今回の探索に使うOpenSpielと役割が重なるため追加していません。OpenSpielの標準AlphaZeroは完全情報向けのため、そのままXYへ接続せず、既存のIS-MCTSを利用しています。依存ライブラリ本体のソースはコピーせず、インストールした公開APIを呼び出します。
