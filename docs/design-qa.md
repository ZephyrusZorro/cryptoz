# CRYPTOZ navigation visual QA

Target: supplied glass-sidebar video (rounded translucent panel, edge collapse control, highlighted active row, floating icons). The user's refinement asks for four simple primary groups, contextual tabs, concise labels and news-first Home. Reference branding and example data are not copied.

Current audit: navigation-evidence/01-before-terminal.jpg was captured from the hosted terminal at 733 px. It shows a long scrolling sidebar, clipped brand and narrow chart. DOM measurements: sidebar 208 px, chart approximately 400 px. That capture did not establish a DOM intersection; final checks explicitly verify dock/content separation.

Combined comparison: navigation-evidence/reference-comparison.jpg places the actual supplied-video region beside the rendered expanded dock and Home. This single image was opened and reviewed. Viewport and product content differ intentionally; no pixel-identity claim is made.

Corrections checked:

1. Four primary groups with related feature tabs; no version/PRO badges, slogans, Sources or diagnostics. Home begins with news, then market data. Duplicate news navigation action removed.
2. Desktop compact/expanded dock reserves its width; hidden mode restores space. At narrow sizes the app scroll viewport ends 14 px above the dock, preventing chart overlap.
3. Sticky tools positioning moved to the wrapper, so tabs stay accessible while scrolling.
4. Programmatic main-container focus no longer draws a large border. Interactive keyboard focus remains visible; hidden dock is inert and Show navigation receives focus.
5. Footer notices remain reachable at narrow sizes.

Evidence: 02-chart-compact.jpg, 03-home-expanded.jpg, 04-home-compact.jpg, 05-home-light.jpg, 06-mobile-home.jpg and responsive-geometry.json. Checked dark/day themes, collapse/expand/hide/reveal, icon transforms and zero-duration reduced motion. Widths 320, 390, 733, 901 and 1440 showed no page overflow or dock/content intersection. Revised chart width at 733 px was approximately 639 px. Filters/refresh and section jumps preserved entered values. Real quote, chart, indicator and book data remained visible.

No remaining actionable P0/P1/P2 difference against the revised brief was found in these finite checks. This does not certify every device, accessibility criterion or sustained frame rate.

final result: passed
