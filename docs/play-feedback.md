# Play interaction polish

Reference lock, 2026-10-24: the existing XY Poker table is the visual source. Preserve INK, angular cards/dice, filled suits, Vectura for the identity/cards and native UI text for small controls. The previously inspected NIKKE / Blue Archive results inform the distinction between a brief accent and the readable resting state (see result-typography.md). No new visual direction or new artwork.

Play inspection: card selection/placement had no distinct audio response; the current seat was only indicated by the top timer. Small-height landscape explicitly forced a 330px board plus the header and hand into a scrolling column. Improve feedback and arrangement without changing rules, AI, reward calculations or timing.

Use game-ui-ux for responsive containers, safe areas and focus; game-feel for brief, event-driven arrival and turn emphasis; audio-design for restrained relative levels and cancellation. Reuse GSAP and the project's Kenney CC0 Interface Sounds (tick/reveal), with original license under public/audio/results. Keep the large showdown presentation. No new runtime dependency, image generation or custom asset.

Motion must not delay a legal move. Reduced motion shows the same final cards immediately, including a preference change mid-animation. Replay has no live-play sounds or arrival motion. Responsive checks include portrait, landscape and tablet. Verification results are recorded after testing.

## Verified release v10240244

- BrowserOS Chromium guest AI match: normal card-selection/column clicks and face-down placement; rules opened/closed; full board, showdown, result, expanded hand breakdown and Play Again. Some turns used the normal timeout fallback during inspection; this is UI QA, not a strategy benchmark.
- Observed audio source starts for selection/placement/turn feedback (placement rate 0.72), and live arrival transforms clearing after settlement. Reduced-motion placement left no inline transform/opacity residue. Actual speaker/headphone listening was not performed.
- Measured viewports: 320×568, 390×844, 667×375, 844×390, 768×1024, 1024×768 and 1440×900. No page overflow; screenshot inspection covered portrait play/results and landscape play. Landscape uses a third hand column after four cards so bonus draws retain room. Physical iOS/Android/Safari and online two-client play are not verified in this change.
- Sequential Node tests: 137 passed. TypeScript, ESLint and production build passed. Existing replay uses the default animatePlacements=false; no live audio hook is mounted by the record viewer.
