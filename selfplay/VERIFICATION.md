# 検証記録（2026-10-21）

実機：Apple M1 Pro、32GBメモリ。Python 3.11.16、OpenSpiel 2.0.2、PyTorch 2.14.1、CPU 2スレッド。

## 確認できた動作

- `npm run selfplay:setup`：専用環境への固定依存導入と再実行に成功。
- `npm run selfplay:test`：11件成功。全合法手の本体受理、伏せ制約、52枚保存、非公開札を変えても同じ入力・探索結果になること、学習更新、連続実行と保存再開の一致、期限停止、更新途中の巻き戻し、二重起動防止、評価の配札単位集計、SIGINT後の保存を確認。
- `npm run check`：lint・116テスト（115成功、既存のフォントテスト1件skip）・TypeScript・Viteビルド成功。追加ブリッジのlintとnode用型検査、Python構文検査も成功。
- `selfplay:act`：保存モデルから着手を出力し、その着手を本体のゲーム処理が受理。
- 記録した全18局・558判断を初期配札seedと行動IDから本体へ再適用し、終局・最終得点・勝敗が一致。

## 学習と比較の条件

```sh
npm run selfplay:train -- --output .selfplay/final-verification --iterations 2 --games 4 --simulations 128 --steps 32 --eval-pairs 2 --minutes 5
npm run selfplay:evaluate -- --checkpoint .selfplay/final-verification/latest.pt --opponent a9 --pairs 1 --simulations 128 --minutes 3 --output .selfplay/final-verification/a9.json
```

学習は8局・2世代完了。過去モデル側の判断を除き、233判断を保存した。各世代でモデルハッシュが変化し、方策・価値の損失は有限値だった。2世代目のモデルハッシュ：

```text
dde6c1edf47cf9a3c2ca75678946665e5ee799dc5551bc44c31d9fbe29bd65e6
```

各世代の過去モデル評価は固定2配札×2席で計8局。別配札seed `2257744669` のA9比較は2局とも敗北。勝敗効用平均−1、配札単位のHoeffding 95%区間は `[-1, 1]`。サンプルが少なく、現行AIとの強度差を推定する結果ではない。8局の学習で現行AIより強くなったとは判断しない。

試験は学習・評価・棋譜保存の動作確認が目的。本番AIの変更、自動昇格、デプロイは行っていない。チェックポイントと合成棋譜のログは作業場所の `.selfplay/final-verification/` にあり、依存フォルダと同様にGit対象外。再現手順・ソース・この検証条件をリポジトリで管理する。
