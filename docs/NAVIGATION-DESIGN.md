# Navigation and copy revision

User direction: remove slogans, version labels and the Data & Sources section; make a compact, collapsible glass dock inspired by the supplied video; simplify feature discovery; lead Home with news and put market representations below it. Preserve real data and working research tools.

Current audit: the captured hosted terminal at 733×724 has a 208 px fixed sidebar, nine primary links, a sidebar scrollbar and clipped branding. Main width is 488 px and chart width 400 px. This capture does not show a DOM intersection between sidebar and chart, but confirms the sidebar consumes excessive room at this breakpoint. The user's overlap report also requires explicit geometry checks after redesign.

Architecture: four primary destinations. Home contains latest news and market overview; Markets contains prices and market maps; Research contains chart, comparison and signals/learning tabs; Workspace contains contextual jumps to watchlist, alerts and journal. Old feature hashes remain valid except Sources, which resolves to Home. No Source page or diagnostic panel remains.

Dock: default compact icon rail on desktop, expandable labels and an explicit hide/show control. Every visible state reserves its width in the content layout. Do not animate content width. Animate only icon movement, opacity and dock transforms. At ≤900 px use a compact bottom dock, leaving chart width available. Keep keyboard labels, focus rings, active states and reduced-motion support. Expanded navigation never overlays chart content.

Copy: direct titles and one-line explanations. Remove brand slogans, version/PRO badges, decorative eyebrow text and unneeded methodology essays from default views. Retain operational labels, essential risk/data limitations, provider timestamps and required library attribution. Relevant calculation explanations live in collapsed details.

Home: five latest matching publisher headlines, news filters and a link to all headlines. Below, live quote strip, market totals, benchmark history, breadth and leading prices. Use contextual links to advanced chart/maps/comparison tools.

Verification: test route/group resolution and persisted dock modes; inspect each primary/sub-navigation path, hide/expand/reveal, tab/keyboard interactions, refresh behavior, data loading, charts and exports. Compare reference and final dock screenshots together. Verify no dock/content intersection and no page overflow at 320, 390, 733, 901 and desktop widths. Publish the existing owner-private Site after production verification.

Implemented fixes: separate pending requests per data key; preserve news filters and inputs during refresh; update news freshness and workspace watchlist incrementally; sticky tools navigation on the wrapper; reserve the bottom dock viewport area and reset both scroll containers on navigation; keep license notices reachable through a short footer link.
