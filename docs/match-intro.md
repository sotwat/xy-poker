# Match introduction

The established INK palette, blue/red seat colors and angular controls remain the reference. Existing result typography governs the new profiles: system UI type for names, counts, percentages and actions. No decorative slogans or added display type. The requested coin is a modeled object with a beveled, reeded platinum edge, blue/red enamel and raised I/II seat marks, matching the profile seat markers.

## Data

- Online introductions fetch each player's saved `rating`, `ai_rating`, `games_played` and `wins` immediately before `game_start`, including rematches. The socket payload exposes only a whitelist of public numbers.
- `RATING` is the online pool. Signed-in AI starts display the human's `AI RATING` from the AI pool.
- `WIN RATE` = saved wins / saved completed matches, rounded to one decimal. These counts include AI, ranked and private matches; draws remain in the denominator. `ALL MATCHES` names the scope. This release does not claim an online-only win rate.
- No games, missing counts, contradictory counts, failed queries and computer records without a real player profile display `N/A`. A genuine zero rating is preserved.
- The viewer is always left, while I/blue and II/red remain tied to the actual server seats. Both clients receive the same winner. No client-generated opponent ratings or win rates.
- Reads have a five-second deadline; unavailable stats do not prevent a deal. A disconnected or changed room cannot start after its pending stats read finishes.

## Motion and source

`assets/coin-toss/coin-toss.blend` is the editable source, authored in Blender 5.2.2 for this requested effect. No generated raster artwork, third-party fonts or external model assets. `build_coin.py` recreates the model; `render_frames.py` renders its 48 orientations. Run the latter in background Blender with `-- /tmp/coin-frames`, then `python3 assets/coin-toss/pack_atlas.py /tmp/coin-frames public/effects/coin-atlas.webp` (Pillow required).

The transparent WebP atlas is approximately 303 KiB at 2048×1536. The browser needs no WebGL runtime. Existing GSAP sequences profile entrance, launch, arc, rotation, landing, bounce, ring and hold in one scoped timeline. Existing Web Audio supplies the flick and landing resonance; artificial midair beeps were removed. The ten-second choice begins after the animation callback. Unmount cancels the timeline and mutes scheduled sound; reduced motion shows the correct final face with a short hold and supports changing that preference mid-animation.

## Verification

- 137 tests pass with test concurrency 1, plus lint, TypeScript and production build. An initial concurrent run under render load hit existing AI time-budget assertions; isolated and sequential reruns passed without AI changes.
- New isolated HTTP database + real Socket.IO server test checks two clients, fresh stats after waiting, public field filtering, surrender settlement and updated rematch counts. Install both root and `server/` dependencies to run the full suite.
- Actual App private-room creation/join in two local browser origins: self/opponent swapping, matching ratings/counts, identical coin outcome, choice countdown and transition to the board; AudioContext running after normal UI interaction. Database isolated locally; no fabricated test profiles published.
- Chromium viewport emulation: 320×568, 390×844, 844×390, 768×1024, 1024×768, 1440×900. Long Latin/Japanese names, zero rating, five-digit counts, both coin faces, fixed choice space, reduced motion and dynamic preference changes checked. Browser extension takeover injects an extra body child; QA fixture sets body display to block so this does not halve its height. Fixture is removed before release.
- These are browser emulations, not physical iOS/Android or Safari checks. Production deployment/version verification is recorded in the project handoff.
