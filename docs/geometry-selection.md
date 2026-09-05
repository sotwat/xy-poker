# Angular geometry comparison

The user asked for a more angular overall design, including card outlines, dice, and home menu icons, with the current version retained for comparison. The selected Vectura lettering and solid SVG suits are the reference. Colors, layout, menu labels, play controls, and the existing showdown effects remain the basis of both versions.

The user selected the angular version for deployment. The ordinary URL now uses angular geometry in development and production; `?geometry=original` explicitly selects the baseline. `/docs/geometry-review.html` compares both using the same home viewport and actual shared components, with PC and phone viewport controls and full-size links.

The angular version uses square card faces and backs, square dice bodies, separate square pips, and hard-edged shadows. Pip size is reduced to retain a visible gap between all three rows on a six. Home icons use new straight SVG paths for card skins, an open rulebook, an account silhouette, contact, language selection, and support. The profile icon uses the same account design. Background contours, the playing surface, card slots, status markers, and form/control corners follow the angular direction. The diamond match buttons already match it.

The comparison is isolated with `uiGeometry` and per-component geometry props; the original styles remain intact. The game rules, card selection handlers, dice values, and skins are unchanged. Angular geometry is the default; only development accepts the original-geometry override.

Verified in the browser: the comparison at 320px and 884px, home previews at PC and phone sizes, and the actual angular home at 320 × 740 and 1280 × 800 with no document overflow. The six dice pips remain separate. In an AI match at 320px, card selection and placement succeeded and the board showed the placed card. Viewport switching, text alternatives, and full-size links were checked. Lint, TypeScript, and the production build passed; no new dependencies were added.

The final selected release also uses square dialog/form and skin-preview edges. English store actions use two lines for the draw count and price so they fit at 320px. Final validation completed an AI match and inspected the English result dialog at 320 × 740.
