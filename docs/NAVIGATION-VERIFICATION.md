# Navigation verification

Scope: the four-group navigation, concise copy, news-first Home and retained research tools. All checks are finite and do not establish that every possible condition is bug-free.

## Automated and build checks

- 59 automated tests passed. New tests cover route grouping, removed/invalid routes, dock preferences, concurrent independent loads, request coalescing and stale refresh recovery.
- All twelve real-provider smoke checks returned HTTP 200.
- Production build passed; initial app JS is approximately 42 KB gzip, chart library 64 KB gzip and styles 16 KB gzip. ECharts remains lazy-loaded. No dependency was added for navigation.
- Dependency audit reported zero known vulnerabilities at verification time.
- Read-only code review led to corrections for the sticky tools wrapper, bottom-dock space and accessible third-party notices.

## Browser workflows

1. Home: five latest matching headlines, publisher and search filters, refresh retains the input and page, market section available below and via a section jump.
2. Research: Chart, Compare and Signals & guides share contextual tabs. Actual comparison history and completed-candle signal readings loaded. Chart, book, saved studies and drawing tools retained.
3. Markets: Prices and Market maps share contextual tabs. Actual price rows and visualization canvas loaded.
4. Workspace: Watchlist, Alerts and Journal & notes use in-page section jumps; a temporary unsaved journal draft survived a jump and was cleared after checking.
5. Dock: compact icons, expanded labels, hide/reveal; hidden dock is inert and focus moves to Show navigation. Changing dock mode retains forms and resizes chart content.
6. Responsive layout: tested 320, 390, 733, 901 and 1440 px. At narrow widths, the content viewport ends above the bottom dock; desktop content starts beyond the rail. No tested page-width overflow or dock/content intersection. The tools bar remains sticky during scrolling.
7. Copy and discovery: four primary links, no version/PRO badges, no Sources route/link or diagnostic section. Old Sources URLs resolve to Home. Useful labels, timestamps, short operational explanations and legal notices remain.

At the reported 733 px width, the original chart was about 400 px wide. The revised chart measured about 639 px in the reserved bottom-dock layout. Geometry receipts and screenshots are in the accompanying navigation evidence.

## Bugs corrected in this revision

- Fixed sidebar consuming chart space at intermediate widths; dock space is now reserved in every mode.
- Bottom dock previously could overlay scrolled chart content; its viewport area is now separate from the scrollable app.
- Independent data requests could be blocked by a homepage load; keyed pending requests now run independently and coalesce duplicates.
- News publisher selection could replace Home with a news-only view; filters now update cards in place.
- News freshness labels and Workspace prices now update when asynchronous responses arrive, without replacing unsaved forms.
- Sticky tools were constrained by their short wrapper; sticky positioning now belongs to the wrapper.
- Hidden navigation no longer remains keyboard-focusable; show/hide preserves focus access.
- Removed the large container focus outline while keeping keyboard focus indicators on interactive controls.

## Limits

Live exchange prices, provider snapshots and historical indicators retain their distinct timestamps and meanings. Public APIs can fail or delay updates. Motion uses finite transforms and opacity, follows reduced-motion preferences, and does not establish universal frame-rate performance. Browser-local workspaces remain unencrypted and need backups. License notices are linked in the footer instead of a Data & Sources page.
