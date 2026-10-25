# Y-column count versus award-size diagnosis (2026-10-24)

Hypothesis before aggregation: the large Y deficit might primarily reflect losing valuable columns rather than too few columns won. This is a bounded, post-hoc accounting check on the already verified matched 10k/12k games, not fresh strength evidence or a training intervention.

| Fixed model | Y columns won (learner/A9) | Y points | No column won, games | At least 3 columns won, games |
| --- | --- | --- | --- | --- |
| 10,000 | 61 / 439 | 175 / 1537 | 50 | 0 |
| 12,000 | 76 / 423 | 213 / 1495 | 43 | 2 |

There are 500 column comparisons per model; one 12k column tied. Learner mean points per won column were 2.869 and 2.803, versus A9's 3.501 and 3.534. Award-size selection is also unfavorable, but the loss is broad across columns.

For descriptive decomposition, set v=(learner points+A9 points)/(learner columns won+A9 columns won). Y deficit = v*(A9 columns won-learner columns won) + residual. The count term is 1294.272/1362 (95.03%) at 10k and 1187.727/1282 (92.65%) at 12k. Each first/last 25-deal group also exceeds 92%. This exact algebra uses observed awarded points; the percentages depend on the chosen decomposition. They are NOT causal attribution, a legal counterfactual or evidence that a count-based reward would improve match wins. Shared-card constraints couple column choices and bonus outcomes.

The narrow hypothesis that only high-value-column prioritization needs adjustment is insufficiently supported. Next bounded intervention should inspect teacher/action disagreement specifically when completing Y columns, preserving match-win targets; compare a frozen-copy candidate on separate diagnostic inputs before touching live training. Existing optimistic values and teacher-trajectory distance remain unresolved. Do not tune on these evaluation seeds or call their halves independent confirmation sets.

Method: selfplay/audit_y_deficit.py, rational arithmetic and alternative residual identity. Independent JavaScript aggregation checked both models, all six groups and arithmetic identities. Source component files were already verified by 200 actual-reducer replays in continuation 63; no new body replays or games were necessary for this read-only aggregation. New A9/A9 control games: 0. All settings/seed limitations remain as in continuation 63 (128 simulations/8 worlds; A9 64 samples/1000ms; seeds 2548683648..2548683697; seat-swapped pairs; shared RNG and runtime cutoff limitations).

Training remains v3; both OS lock holders and advancing events were observed (supervisor 70135, child 72750, 12182 games at 13:34:35 UTC). No checkpoint or training-state write by this diagnostic, no optimizer/RNG/replay reset, no model/policy change, no deployment. Existing backups retained. This investigation used no heavy inference and ran alongside the single existing low-priority trainer.

Skill/tool review: searched RL-debugging and adjacent calibration skills before this diagnosis. A third-party rl-debugger listing pointed to aznatkoiny/ai-toolkit, but the claimed primary GitHub repository returned 404; source/license/compatibility could not be verified, so it was not installed. Other search candidates concerned LLM-agent annotation or GPU deployment rather than this CPU IS-MCTS diagnosis. Existing Python standard-library arithmetic and Node.js suffice without added dependencies, external data transfer or cost. Rechecked the existing OpenSpiel primary algorithm inventory: https://github.com/google-deepmind/open_spiel/blob/master/docs/algorithms.md . No skill update or tool replacement was justified for this bounded accounting task.
