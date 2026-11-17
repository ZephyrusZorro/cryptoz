# CRYPTOZ left-rail liquid-glass visual QA

Latest brief: LEFT taskbar on every device, fewer grouped controls, brighter light mode, polished dark mode, video-inspired glass/motion, actual financial data, and zoomed-out charts. This supersedes the earlier bottom-dock design.

Reference: inspected original supplied-video frames at 0.4–4.2 seconds. They show a rounded frosted sidebar, fine rim, circular collapse control and highlighted hover rows. The clip does not specify every application form or proprietary material physics. Combined reference-comparison.jpg places the supplied-video frame and both actual rendered themes in one image; it was opened and reviewed.

Checked corrections:

1. Four primary destinations: Home, Markets, Charts, Workspace. Related tools remain in contextual tabs. A compact captioned LEFT rail is used on phones; desktop has expanded labels. Width is reserved, including chart focus. Hide/reveal restores content space. No bottom dock.
2. Home has one ordered news-reading surface, five headlines, clear publisher/time/link metadata, followed by market data. Full news renders 20 at a time; Show more and filtering were exercised. Markets has simpler asset/price/change rows; a legacy 145px price minimum that clipped the change column at 320px was removed.
3. Light mode uses original compressed ice-blue glass artwork, dark text and cobalt controls; dark mode keeps blue/violet. Glass rims, blur and limited pointer sheen sit around legible charts. Motion uses finite transform/opacity easing; small/touch/reduced-motion devices skip pointer sheen.
4. All history opens the chart at the full available range. Recent 100 bars, +/- zoom, visible/total candle counts and date range, focus mode and a grouped Tools menu reduce clutter. Range selection reflects manual panning. Named windows reapply on resize; custom windows persist. Gesture listeners use capture phase so the first wheel event is detected before chart-library range changes.
5. Landscape focus at 640x360 keeps a 198px plot, Exit focus control and Live/Snapshot/Delayed status. Phone indicator modal fits at 320px. Risk calculation and menu navigation were exercised.

Actual layout checks: 320, 390, 733, 901 and 1440px widths; light/dark; 640x360 landscape. No page-width overflow or rail/content overlap was observed. A loaded phone chart showed 500/500 candles after resize. Tests are finite and do not certify every physical device, accessibility criterion, exact proprietary effects or sustained frame rate.

No remaining actionable P0/P1/P2 finding against this scoped brief was identified after the documented fixes.

final result: passed
