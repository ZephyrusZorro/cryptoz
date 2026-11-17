# CRYPTOZ reliability design QA

Target: preserve the previously published compact left rail, transparent header, dark/light glass surfaces and concise contextual navigation; remove unstable decorative motion and repair interaction failures.

`outputs/reliability-evidence/reference-comparison.jpg` places the prior published Home and the current production build together. The combined image was opened and reviewed. The layout, typography, spacing, headline hierarchy and glass surfaces are retained; the background no longer runs particles or pointer lighting. Current prices/headlines differ because they are real observations from different times.

Corrected P2 findings: hidden rail could not be revealed in chart focus; focus reveal now sits beside Venue without covering the timeframe toolbar. Dialog Escape/focus restoration and inert background now work. Draft loss on navigation/reload was corrected. Page refresh updates the active tool and retry paths. Missing/tiny numeric values no longer masquerade as zero. The new status banner is scoped to relevant requests and does not cover the focused chart.

Actual evidence:02-focus-navigation-fixed.png,03-light-home.png,04-phone-home.png,05-narrow-chart.png,06-landscape-focus.png,07-tablet-maps.png,08-desktop-markets.png,09-production-dark-home.png. Widths320/390/733/901/1440 and640x360 focus were inspected with no page-width overflow at those observations. Glass light/dark and device-selected solid were inspected. Production console contained no errors for the selected flows. Native downloads could not be captured by the in-app recorder, although prepared links and encoding behavior were verified; see reliability verification.

The fresh code reviewer found Home preview retry and stream-freshness regressions; both were fixed and re-reviewed. No remaining actionable P0/P1/P2 finding was identified in this scoped pass. No claim is made about every browser, full accessibility certification or physical-device FPS.

final result: passed
