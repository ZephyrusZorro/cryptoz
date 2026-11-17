# Implementation plan — CRYPTOZ 2.1

Execute inline under the user's standing authorization to implement and publish without further approval.

1. Add meaningful failing tests for palette fallback, malicious/malformed ticker rejection, chronological quote updates, completed-candle signal boundaries and insufficient history. Implement pure theme/live/signal modules. Run node tests.
2. Implement dark glass/day palettes across CSS, charts and visuals. Add original compressed background and correct Worker MIME. Theme/effect controls persist separately from chart layouts; theme changes preserve active inputs and chart state. Verify both themes at desktop/mobile sizes.
3. Integrate one all-market Binance ticker stream after active instrument registry loads. Batch visible DOM patches at most once per second. Reject stale/out-of-order quotes; leave aggregate USD data untouched. Add live ticker strip and connection age. Integrate selected Binance partial20 depth; REST remains fallback.
4. Add learning route, selectable completed-candle signal families, source timestamps and manual/periodic refresh. Test both venues, controls, stale/error states and navigation cleanup.
5. Run regression suite, production build, dependency audit and actual API smoke. Test user flows in browser, inspect desktop/mobile dark/day captures and measured interaction timing. Obtain independent read-only release review and fix material findings.
6. Package source + portable build in outputs, research/test/visual QA report and screenshots. Publish existing private site, verify actual hosted UI, data and exports. Preserve previous v2 release.

Review focus: invalid WS payloads; disconnect freshness; current incomplete candle leakage; theme changes losing research notes/risk inputs; chart contrasts and mobile overflow; restored user backups and named layouts.
