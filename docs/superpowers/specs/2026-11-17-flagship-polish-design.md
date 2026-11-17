# CRYPTOZ compact research workspace

User direction: merge the older professional header/typography with current compact LEFT rail. Rail must not enlarge. Keep clear sections and polished glass, unified news without publisher sections, credible attributed sources, faster navigation and Fetch.ai discoverability. User delegated implementation choices and opted out of approval questions.

Approaches considered: full-width old sidebar (conflicts with fixed compact size); current stacked news-first layout (causes long scrolling); chosen compact dashboard with persistent 72px rail, integrated transparent header, contextual tabs and balanced news/chart panels. Existing vanilla Vite/LWC/ECharts architecture is retained. Existing original glass wallpapers and Lucide icons are reused.

Home: market overview title/kicker, compact destination cards linking News/Charts/Market maps/Signals, four real statistic tiles, and a split of common news (three headlines) and BTC chart. Deep tables belong to Markets. News is one chronological feed; topic tabs replace publisher tabs while publisher attribution remains on every article. Add The Block public feed if live verification permits it; failures remain isolated.

Search: punctuation/whitespace normalization, token matching, verified Fetch.ai/FET/Artificial Superintelligence Alliance aliases, and on-demand broader provider catalog search. Separate supported exchange pairs from catalog identities. Add allowlisted validated asset-search/asset quote endpoints with bounded cache, cancellation/stale-response guards and browser-direct recovery. Never promise universal price/history availability, synthesize prices or silently substitute tokens.

Motion: fixed rail with restrained active/hover sheen, finite page/menu transitions, bounded ambient particles rendered below content. Pause when hidden and for reduced motion; lower density/FPS on small screens; appearance setting can disable ambient animation. Charts keep solid legible backgrounds.

Verification: tests for aliases, query bounds, ranking, remote validation and stale search response handling; live Fetch.ai quote/pairs; local and hosted UI, both themes, fixed rail width at320/390/733/1280/1440, Home depth, topic filters and chart controls. Finite test scope, no zero-bug or all-device claim.
