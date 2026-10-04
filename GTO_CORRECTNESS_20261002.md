# XYポーカー：得点の正確性と有限方策集団の監査

2026-10-02。基準commit `42dacb48224473af0ec1eaa946a9ef0411b5973f`。元repoの既存作業は終了・cleanと確認してから隔離コピーで検査し、承認された書込み経路で局所修正を適用した。公開・push・デプロイは実施していない。

## 得点修正

- XのA2345ストレートフラッシュを14ハイではなく5ハイへ修正。同役6ハイ以上との比較で相手に+1点が付く。
- Yの上下同ランクの離れペアは、上下のランクをペア、中央をキッカーとする。旧実装は高ペアの順序を逆転し、低ペアのキッカーもペア自身にしていた。
- 全4スートのwheelと全156ペア/キッカーランク組を回帰検証。旧評価と異なるYの手は全7,488/132,600。これは無作為手の割合であり、実対局出現率や勝率の推定ではない。

全X 2,598,960組のカテゴリ分布、全Y 132,600順序付き手のカテゴリ分布が独立の組合せ計算と一致。Yのスート循環置換・上下反転で役/キッカーが不変、全7,488離れペアが正しいキッカーを返す。全てのXキッカーの独立参照検算までは行っていない。

## ソルバーの条件と誤差

対称ゼロ和ソルバーは有限・正方・反対称行列を要求する。非有限値や反対称でない入力を拒否するよう修正した。`pᵀAp=0`は反対称行列の恒等式で、収束根拠ではない。

行が最大化、列が最小化。返す値は `U=max(Ap)`、`L=min(pᵀA)`、`gap=U-L`。この場合 `L=-U`、gapは片側exploitabilityの2倍。既知の非一様RPS、支配方策、自己値0でもgap1となる反例で検算した。

保存済みの12方策行列と修正後の新規12方策行列を、RM+と独立の支持集合列挙/線形連立解法で照合した。これは浮動小数点・許容誤差を用いた有限行列検算で、完全な展開型XYゲームのLPではない。

| 対象 | 独立支持解 | 300,000反復後の独立gap |
| --- | --- | --- |
| 旧保存行列 | opening_efficiency、gap 0 | 約1.5874e-10 |
| 新規シード・修正後行列 | opening_efficiency、gap 0 | 約1.2016e-10 |

行列と保存混合は6桁へ丸められているため、この独立検算は保存された行列に対するもの。標本誤差や全ゲームの最適反応を含まない。

従来の`max(value+1.96*SE)`は、同一標本から混合と最大BRを選ぶ影響を含む同時95%上限ではない。記述的なnormal approximationとして別名で保存し、一様上限を追加した。

凍結したK方策、M=K(K−1)/2ユニークセル、各セルn個の席交換ペア標本 Z∈[-1,1] に対し、両側Hoeffding+unionの半幅は `sqrt(2 log(2M/alpha)/n)`。diag誤差は0、各セル区間は[-1,1]で切り詰め、混合の重みを掛けてBR上下界を計算する。セル間独立は不要だが、各セル内の標本独立/同一期待値、監査前の方策集団固定が仮定。seeded PRNGはこの仮定の数値近似である。途中でよい値を見て停止する用途には固定n上限をそのまま使わない。

新規監査は旧JSONの12方策パラメータを凍結し、現行の修正済み方策実装で再評価した。方策生成経路の古いコード差分まで固定した旧/新評価の純粋な因果比較ではない。

- seed 100210102、3,000 **pairs**/cell = 6,000 games/cell。全66セルで198,000 pairs / 396,000 games。
- 事前固定nで329.136秒。低優先度10、単一CPU、観測RSS約210MB。
- 集団の経験行列ではopening_efficiencyの混合が約1。数値残差は小さい。
- 半幅0.07247314。有限集団相手の片側上限は約0.04380647、gap上限約0.08761295（95%、上記仮定下）。
- 追加4probeは各200pairsの探索的チェックで、未登録の全戦略に対する最適反応上界ではない。

研究の利得は勝敗+1/0/-1。ゲーム内の各人の素点は合計一定ではない。席交換平均のrestricted meta-gameであり、両盤面完成後の採点でRoyal同時成立のp1優先がある実ゲームについて各席別・先後選択まで一律の対称性を保証しない。

混合は対局前に各人1つの方策を選び、対局中固定する。毎手方策を再抽選するbotには証明を移せない。既定runtime A9はA7重み・belief rollout・終盤証明を組み合わせる別方策なので、この12方策行列の証明対象ではない。

## 終盤証明

証明器は自分の既知手札/盤面と相手公開札だけを使う。相手の未知Yを順序全列挙、Xを組合せ全列挙し、独立の最強上限を置く。互換不能な相手最大も許す緩和なので安全側。未知世界ごとに自分の別行動を最適化せず、既に持つ札のみの同じ継続手順で全補完に勝つ場合に限り採用する。保存手順も条件を再確認する。確率モデルやゲーム全体のNash解ではない。timeout中断時はnullを返し部分列挙の最大で認証しない。公開条件変化で保存planが無効になり新certificateも作れなければ近似fallbackへ戻るため、元局面の必勝存在と、状態変更後のruntime継続保証を区別する。保存は各席1件で、module再起動や別対局の同席呼出しによる消失まで永続保証しない。

既存テストで双方席2/3手全completion採点、任意reply/draw、1ms続行、private identities置換不変、Royalp1優先を再検査した。runtimeの真deck/相手private情報置換不変も成功。追加prefix検証で、相手Royal完成後も自plan未完ならplayingが続き、最後に自Royalを完成させ採点でp1勝利を確認。100局・3,000合法prefixで札の保存、全52枚の保存、通常/bonusドロー、手札最大9、最終山札9枚、全5bonusを確認した。

修正後の独立seed100209101、1,000局の軽量序中盤＋A8終盤軌跡で、残2手2,000局面中249証明/1改善/0悪化、残3手2,000局面中113証明/0改善/0悪化。644.346秒。1件はA8の敗北が証明付きの勝利に変わった。本番軌跡や本番勝率の推定ではない。ゼロ観測差に幅0の通常区間を付けない。

## 同期・確率入力

52枚入力の重複は既存の無効入力fallbackへ回し、正しい52枚を生成する。同期状態でカードID/ランク/スートの不整合、デッキ/両手札/両盤面の重複、両者のダイス不一致、疎配列を拒否する。validatorは完全な合法履歴の証明器ではなく、重力配置や過去のボーナス履歴等を全再構成しない。

## 再現

```sh
npm run check
node --import tsx scripts/audit_evaluators.ts
node --import tsx scripts/audit_matrix_equilibrium.ts
node --import tsx scripts/solve_gto.ts --frozen-population=gto_solution.json --deals=3000 --probe-deals=200 --seed=100210102 --output=/tmp/xy-gto-frozen-corrected.json
node --import tsx scripts/audit_matrix_equilibrium.ts --input=/tmp/xy-gto-frozen-corrected.json --output=/tmp/xy-matrix-corrected-audit.json
node --import tsx scripts/analyze_forced_wins.ts --games=1000 --seed=100209101 --output=/tmp/xy-forced-wins-corrected.json
```

Mac資源競合がある場合は自分の監査プロセスだけを低優先度にし、複数の重い検証を同時実行しない。

作業束・詳細JSON・ログは `/Users/aaa/Documents/Codex/2026-10-02/task-3` に保存。公開originは変更しておらず、非公開バックアップは親担当へ依頼した。旧GTO JSONを上書きしていない。新しい生成CLIは凍結入力と出力の同一パスを拒否し、今後の監査にソース/方策/混合のhashと非丸め数値certificateを保存する。既存の今回3,000pairsの初回結果はこのmetadata追加前に生成されており、そのJSONと独立保存行列検算を区別して残す。旧資料のEV/勝率は旧採点に依存しうるため、再計算が必要。

最終チェック: 元repoは第3単位時点で全95テスト成功・skip0、lint・型検査・build成功。prefix/metadata追加は検証コピーで確認し、元repo適用後にも同じチェックを実行する。

## 同時完成盤面による局所証明（第5単位）

従来の各Y列・X行の独立最悪値の和は安全だが、同じカードを複数箇所に要求する緩和になる。独立証明が成立しない場合、相手の隠しカードと空欄を合わせて3以下、自分の空欄2〜3かつ必要な保持カードがある範囲で、全てのラベル付き重複なし完成盤面を列挙する。同じ固定配置プランが全完成盤面で勝つ場合だけ証明する。実際の相手手札・非公開カード値・デッキ順は参照しない。実現不能な完成を含む上位集合なので保守的であり、全ゲームのGTO解ではない。

選定fixtureは21枚から3箇所への7,980通り。独立したSet列挙と実際のCALCULATE_SCORE reducerで全結果を照合した。各列の独立最小値は[6,-5,-5,4,2]、X最小値は-4、緩和合計-2に対し、同時最小得点差は+1。両席のテストでも同じ固定配置の保証が成立する。Royal先行規則・双方完成後の採点・Y同点0も別テストで確認。

最大列挙は13,800通り（25P3）に制限。キャッシュは一呼出内のみで、世界数をexpectedと照合し、world列挙・プラン検証が時間切れなら部分結果を返さない。nullは未証明であり、必勝プラン不存在を意味しない。継続証明に採点ルールversionと観測カード整合性の検査を追加した。新しい公開情報は元の世界集合の制約内なら継続できるが、状態が不整合なら破棄する。

固定5fixture、各予算10反復のMac測定（機械保証ではない）:
- 1ms予算: 0/10証明、中央値1.148ms、最大1.408ms。
- 5ms予算: 0/10証明、中央値5.004ms、最大5.524ms。
- 10ms予算: 0/10証明、中央値10.004ms、最大10.005ms。
- 25ms予算: 10/10証明、中央値13.370ms、最大16.811ms。
- 50ms予算: 10/10証明、中央値11.829ms、最大13.892ms。
- 100ms予算: 10/10証明、中央値12.173ms、最大12.736ms。

時間制限は協調的なのでOS/GCで超過し得る。選定盤面ではA8も勝ち、A9の追加は証明と短時間継続を与える。勝率改善の推定には使わない。既存1,000試合調査はこの追加前の結果で、母集団頻度を主張しない。

再現:
```sh
node --import tsx scripts/audit_joint_fixture.ts --output=/tmp/xy-joint-audit.json
node --import tsx scripts/benchmark_certificates.ts --output=/tmp/xy-certificate-timing.json
node --import tsx --test src/logic/jointForcedWin.test.ts
```

### Runtime deadline audit

AI default timeBudgetMs=1000, clamped to [1,2000]. Shared deadline is start+max(0,budget-4). MC search, final-move proof, response proof, then A9 calls findForcedWinPlan with this same deadline. Independent proof runs first; joint gets only remaining time, with no reserved 25ms.

Joint checks time before each completed world and cache lookup/generation, before each completed own plan, before each world margin, and before return. A single world (up to 5Y+1X evaluations) and short recursion are not interrupted. Existing independent proof checks every64 hand evaluations and before return. Cap bounds work, not scheduling time. Partial proof returns null.

10 repeats per row. p95 uses nearest-rank (equals max), median uses sorted index5. Overrun=max(0,max-budget). All times ms.

|fixture|budget|certified|median|p95|max|overrun|
|---|---:|---:|---:|---:|---:|---:|
|independent-three-move|1|10/10|0.607|0.795|0.795|0.000|
|independent-three-move|5|10/10|0.468|0.573|0.573|0.000|
|independent-three-move|10|10/10|0.501|0.657|0.657|0.000|
|independent-three-move|25|10/10|0.410|0.660|0.660|0.000|
|independent-three-move|50|10/10|0.514|0.654|0.654|0.000|
|independent-three-move|100|10/10|0.455|0.683|0.683|0.000|
|independent-holdout|1|10/10|0.468|0.581|0.581|0.000|
|independent-holdout|5|10/10|0.507|0.725|0.725|0.000|
|independent-holdout|10|10/10|0.517|0.766|0.766|0.000|
|independent-holdout|25|10/10|0.483|1.000|1.000|0.000|
|independent-holdout|50|10/10|0.447|0.496|0.496|0.000|
|independent-holdout|100|10/10|0.486|0.857|0.857|0.000|
|joint-three-unknown|1|0/10|1.148|1.408|1.408|0.408|
|joint-three-unknown|5|0/10|5.004|5.524|5.524|0.524|
|joint-three-unknown|10|0/10|10.004|10.005|10.005|0.005|
|joint-three-unknown|25|10/10|13.370|16.811|16.811|0.000|
|joint-three-unknown|50|10/10|11.829|13.892|13.892|0.000|
|joint-three-unknown|100|10/10|12.173|12.736|12.736|0.000|
|four-unknown-cap|1|0/10|1.156|2.175|2.175|1.175|
|four-unknown-cap|5|0/10|1.194|1.594|1.594|0.000|
|four-unknown-cap|10|0/10|1.072|1.377|1.377|0.000|
|four-unknown-cap|25|0/10|1.052|1.493|1.493|0.000|
|four-unknown-cap|50|0/10|0.995|1.336|1.336|0.000|
|four-unknown-cap|100|0/10|0.983|1.226|1.226|0.000|
|final-move-out-of-scope|1|0/10|0.026|0.033|0.033|0.000|
|final-move-out-of-scope|5|0/10|0.024|0.040|0.040|0.000|
|final-move-out-of-scope|10|0/10|0.025|0.088|0.088|0.000|
|final-move-out-of-scope|25|0/10|0.025|0.031|0.031|0.000|
|final-move-out-of-scope|50|0/10|0.025|0.089|0.089|0.000|
|final-move-out-of-scope|100|0/10|0.024|0.059|0.059|0.000|

Unit5 original repo:103/103 tests pass, skip0, lint/type/build pass.

## 実A9接続・固定holdout（第6単位）

監査用ai/forcedWinコピーに時計記録だけを挿入し、探索順・予算配分を維持。5固定late fixture×100/1000ms×3反復の実getBestMove経路で全30手が合法かつreducer更新成立。joint-three fixtureは既定64samples/1000msで3/3追加認証を採用。開始残819.90/821.95/821.53ms、終了残805.63/809.04/810.02ms。100msでは0/3採用（2件は期限到達でjoint未開始、1件は約1msで途中終了）。適用範囲外へのjoint関数呼出を列挙完了とは数えない。

私有hidden↔deck交換と私有手札/deck逆順の5fixture比較は、時間切れの混入を避けた1sample/2000msで選択手一致。これは既定64sample制限時の全実行における一致や一般採用率を推定しない。traceコピーは監査専用で元repoに導入しない。

旧1,000局保存は集計と改善例1件だけで、全late statesは未保存。実行前manifestを固定して、新seed100210301・50局・A7早期/A8最後3手で全own残2/3局面を抽出。最大200件を全て保存し、結果による選別なし。26.785秒、単一nodeをnice10へ下げ、RSS約281MiB。

200局面の相手hidden+emptyは3:30、4:69、5:72、6:29。eligible30件に独立25ms認証4件、独立null26件にjoint25ms追加認証1件。game37 actor1 own残2 unknown3（10.544ms）は無期限独立もnull、別Set列挙全6,840完成と実採点reducerで最小差+1を検算（独立緩和は-4）。未証明25件は敗北・不正・必勝プラン不存在を意味しない。有限固定軌跡の局所認証カバー範囲で、全ゲームGTOや勝率向上の証明ではない。

凍結母集団監査CLIのhashは開始時に読み込んだ同一bytesから保存し、長い計算中の入力ファイル変更によるhashずれを防ぐ。空入力/出力指定と同一実体のsymlink/hardlink出力を計算前に拒否。alias拒否後も入力hashが変わらないことを確認。

## Xキッカー参照監査・完了checkpoint

全6,175合法ランクmultiset（同ランク最大4枚）を別のrank-multiplicity/固定straight表による参照tupleと比較。mixed-suit代表ごとに5循環順序×2スートrotation、distinct-rank全1,287にflush代表を追加し、計63,037評価がtype/rankValue/kickers/scoreすべて一致。別の全2,598,960手カテゴリー総数監査を補う。代表検査単独で全スート割当や全120順序を列挙したとは主張しない。新たな採点不一致はない。

```sh
node --import tsx scripts/audit_x_kickers.ts --output=/tmp/xy-x-kicker-audit.json
```

完了範囲: wheel SFとsplit Y pair採点修正、同期カード整合性、restricted matrixのduality gapと条件付き同時Hoeffding誤差、凍結母集団/metadata/入力保全、局所joint completion証明とcontinuation保護、実A9接続・固定holdout・独立採点oracle。元repo最新全検査103/103、skip0、lint/type/build成功。

未証明: 全ゲームのNash/GTO、任意の新方策へのglobal best response上限、一般対局勝率改善。固定12方策の座席平均meta-gameに限る95%上界は約0.0438065（gap約0.0876129）で、有限サンプル・固定母集団・各cell内独立同分布を仮定。seed付きPRNGは再現手段であり、この確率モデル仮定そのものを証明しない。局所joint証明は保持カード固定planの全相手完成に対する保証で、探索nullは不存在証明でない。

GitHub:公開originへのpush、外部デプロイなし。コードは元repoローカル未commit差分と複数patch/local backupに保存。非公開GitHubバックアップは親担当が調整中で、本担当は保存完了を確認していない。これ以上の追加計算・機能拡大は具体的課題が生じるまで停止する。
