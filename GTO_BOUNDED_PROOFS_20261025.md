# 診断用終盤証明の作業量上限

### 2026-10-25 継続74：隔離した終盤証明に関数呼出し/ループ回数上限、未完を破棄

全局の固定時計A9へ進む前に、終盤証明の作業量を明示する診断用ハーネスを実装した。TypeScript ASTからendgame/forcedWin/jointForcedWin/sharedCardProofと依存9モジュールの隔離コピーを生成し、関数入口・式arrow・各ループ反復を計数する。原本SHA256と挿入サイト数を保存。単位は関数入口/ループ反復でありCPU命令数や探索ノード数ではない。上限到達時は専用例外で呼出し全体を中止し、部分的な優位/確勝証明を返さずstatus=incomplete/result=nullとする。原本・ライブAI/bridge/rules/学習ソースは変更しない。boundedProofのreturned/nullは確勝なし/適用外も含むため敗北証明とは呼ばない。

既存の最終手/応答境界/独立上界/共有カード証明fixture計6件で、上限20,000,000単位の完了結果が原本と完全一致。必要作業量は21,248〜17,864,254単位（最終手907,451、返信17,864,254、応答境界17,510,275、独立21,248、joint649,193、共有428,507）。正確に必要量の上限では完了し、0/1/半分/必要量−1では毎回その上限でincomplete・部分結果null。反復結果/作業量一致・入力不変・既存証明の合法な次手・不正予算拒否・無関係例外の伝播を確認。CPU/経過はfixture単位の全反復合計で記録し、1判断の時間や速度改善とはしない。既存fixtureの回帰確認であり、新しい選定/確認配札・独立強度試験・新しい本体採点試験ではない。

型検査（scriptsと生成コピー）/追加3TSのESLint成功。生成物は.selfplay配下で追跡せず、生成手順と原本指紋を追跡。生成のASTカウンタが覆う有限サイズのカード評価を含むが、ネイティブ処理の時間やMac休止時間の上限保証ではない。まだA9の証明呼出しへ接続しておらず、A9全判断/全局の上限、固定64標本の合法なfallback、fresh/再利用一致は未検証。次は隔離A9コピーへ接続し、上限で途中証明を採用せず既存の合法候補を使う経路を検証してから、別の事前固定早期/中期局面の本体終局介入へ進む。小さな自己採点診断は繰り返さない。既定時間制A9の対局評価とは区別する。

12,902局/3225世代内2局で正常保存。最初のlock確認は監督終了直前で失敗したがshellが後続試験を実行したため、その結果は正式採用せず、両lock解放を改めて確認しPython check=Trueで再実行した。学習子は最初の試験前に保存停止済みで、重い学習との同時実行はない。今後の複合コマンドもlock失敗時に試験へ進ませない。正式再試験はnice15単独、latest.pt bytehash a0cd2cfedffbb6be1bbfdf1ab5b8b4a2e558b84f8494a4c674257ac57fd7cae7前後一致。重み/AdamW/リプレイ/過去モデル/乱数/進捗/PR8来歴/旧保全すべて維持し監督91443/学習91445でv3無変更再開、12,903局と両OS lock保持確認。全状態移行や学習方式変更をしていないため新たな移行バックアップは作っていない。

再現はnode --import tsx scripts/build_bounded_proofs_20261025.ts、生成後node --import tsx scripts/test_bounded_proofs_20261025.ts（重い検証前に正常保存停止/両lock確認）。結果gto_bounded_proofs_20261025.json、予算実装scripts/diagnostic_work_budget.ts、報告GTO_BOUNDED_PROOFS_20261025.md。新工程のWeb skill調査ではtjboudreaux/cc-thinking-skillsのthinking-bounded-rationality原本を確認したが一般的な調査打切り用で正しさ検査を対象外としており、証明計数には非適合・未導入。既存TypeScript5.9.3 Compiler APIの公式原本を照合し採用、追加依存/課金/連携なし（https://raw.githubusercontent.com/tjboudreaux/cc-thinking-skills/main/skills/thinking-bounded-rationality/SKILL.md 、 https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API ）。

強度評価は引き続き12kの1勝99敗で改善未確認。本番採用/公開なし。14kでは凍結12kも新同配札50×席交換・128探索/8補完・A9既定条件で比較し、本体独立採点・ペア不確実性/A9対A9対照が必要。通常進捗/今回の基盤検証だけでは通知しない。
