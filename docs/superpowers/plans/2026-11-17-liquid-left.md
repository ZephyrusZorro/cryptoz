# Liquid glass and left rail implementation plan

Execute inline under the user's continuing implementation and publication authorization.

1. Add failing tests for chart logical ranges, zoom bounds, preset validation and bounded filtered news windows. Implement `src/chart-window.js` and `src/news-window.js`.
2. Replace `src/navigation.css` bottom-dock rules with one coherent left-rail layout at all widths. Update `src/navigation.js` group labels and `app.js` hidden-dock access for all breakpoints. Preserve contextual tabs and scroll behavior.
3. Add `src/liquid.css` shared material tokens, bright theme asset and `src/glass-effects.js` bounded pointer sheen. Keep opaque chart canvases and reduced-motion/transparency fallbacks.
4. Update `src/chart.js`, `preferences.js` and terminal controls: default all history, All/Recent presets, +/- zoom, window label and Focus mode; consolidate secondary actions into Tools. Verify actual 500/350-bar windows rather than claiming unlimited history.
5. Update Home/news to organized reading rows with bounded rendering. Simplify market columns without removing price/quote/freshness information. Ensure metadata and real-data behavior remain intact.
6. Run all tests/build/API smoke and independent read-only review. Browser-check all navigation paths, both themes, rail geometry and phone/landscape forms. Compare extracted video frames and final screens in one image, fix material issues, then package and publish exact source/build.
