# Teacher agreement around Y-column completion (2026-10-24)

Hypothesis: a specific failure to imitate teacher choices when finishing a Y column could explain the broad column deficit identified in continuation 64. This diagnostic compares the frozen 10k and 12k networks on exactly the same saved training inputs, without running search or updating either model.

Frozen replay: copied an atomically saved latest.pt at 12,400 games into .selfplay/diagnostic-y-teacher-20261024/replay.pt. SHA256 bbef5e04f8bfd59ae0be58bd2866b5f328d3b1400cc98373e849a33fea34e1e8. All 20,000 samples remain intact. Select teacher one-hot targets only, exclude turn selection, and require at least one legal column with two cards and one legal column with fewer cards. Thus finishing versus deferring is a real available distinction. 5,571 samples qualify; 8,572 search samples, 368 turn choices and 5,489 without mixed completion options are excluded. These are correlated, previously trained replay states, NOT an independent validation set or new deals.

| Source / teacher choice | n | 10k exact agreement | 12k exact agreement | 12k column agreement | 12k value MSE | Constant-zero MSE |
| --- | --- | --- | --- | --- | --- | --- |
| Learner advice / complete | 438 | 5.71% | 15.53% | 35.84% | 1.4853 | 1.0000 |
| Learner advice / defer | 943 | 5.20% | 14.53% | 37.01% | 1.4530 | 1.0000 |
| A9/A9 / complete | 1096 | 5.84% | 15.97% | 35.04% | 1.0251 | 0.9626 |
| A9/A9 / defer | 1719 | 4.13% | 14.37% | 34.15% | 1.0979 | 0.9581 |
| Opponent A9 / complete | 511 | 5.68% | 17.81% | 40.31% | 1.3227 | 1.0000 |
| Opponent A9 / defer | 864 | 4.63% | 14.81% | 33.80% | 1.3346 | 1.0000 |

The narrower completion-specific imitation failure is not supported here: agreement improves in every group, and completion agreement is not lower than defer agreement. This does not prove good play. An alternative legal move can be equivalent or better, and A9 labels are not GTO. Exact-action and column agreement are only imitation diagnostics. Search behavior was not evaluated.

Value MSE remains worse than a constant-zero prediction in every teacher group, including the approximately outcome-balanced A9/A9 groups. This makes value calibration a more concrete next intervention target than simply oversampling completion actions. It is not causal proof of the low A9 match win rate: labels are trajectory outcomes, source/outcome conditioning matters, correlated states share outcomes, and no controlled action/search ablation was run. Next bounded experiment: on a frozen model copy, compare search with original versus source-independent calibrated/neutral values on pre-fixed diagnostic states, leaving priors, worlds and RNG settings fixed; keep separate selection and confirmation deals, then use fresh matched full games for any strength decision. Do not deploy or change live learning solely from these replay metrics.

Verification: completion classifier tested on synthetic 0/1/2/3-card boundaries and all 31 pre-action positions of one already saved 12k game replayed through the actual reducer. Independent scalar indexing and legal-column reconstruction matched all six group counts and the 20,000-sample partition. Python compilation passed. Model hashes match continuation 63 (10k ff6904e7..., 12k 21520a5e...). Policy/value metrics are saved in gto_y_teacher_20261024.json; reproducible script selfplay/audit_y_teacher.py.

Inference used one CPU thread at nice15 and completed in seconds, without new searches or new games; the existing trainer remains the only heavy process. Live replay, model weights, AdamW, RNG, progress, old models and backups were not modified by the diagnostic. No training-code or production change, no deploy, no fresh A9/A9 control. Skill/tool review from continuation 64 applies to this same frozen-replay workflow; existing PyTorch/NumPy and reducer bridge suffice without installation, fees or new accounts.
