# CRYPTOZ navigation revision implementation plan

Execute inline under the user's standing request to implement and publish without permission prompts.

1. `src/navigation.js`, `tests/navigation.test.mjs`: write failing tests for four groups, all retained feature paths, unsupported/inherited route rejection, removed Sources route and bounded dock modes. Implement pure route/group/secondary-tab definitions and storage handling.
2. `src/app.js`, `src/navigation.css`: replace the nine-item sidebar with compact/expanded/hidden dock states, four primary links and contextual secondary tabs. Reserve dock space; use bottom navigation at ≤900 px. Remove Sources renderer, all links to it and the performance diagnostic UI. Verify geometry and feature reachability.
3. `src/app.js`: replace promotional copy and version/PRO badges with direct labels. Put news first on Home with reusable publisher/search filters; keep markets and related tool links below. Preserve asynchronous chart/state cleanup and user inputs during background updates.
4. `src/comparison.js`, `src/learning.js`: concise functional labels and explanations; collapse longer calculation notes. Preserve actual data, formula calculations, indicator choices, drawings, notes and exports.
5. Run regression tests, build and real API smoke. Browser-test all four groups and contextual tabs, both themes, dock modes, keyboard access and five responsive sizes. Capture and compare the supplied reference with final render. Obtain fresh read-only review, resolve material findings, package and publish exact source/build.

Review focus: navigation obscures chart; dock state breaks breakpoints; hidden feature paths become unreachable; news update resets filters; section jumps destroy unsaved forms; removed Sources links remain; active group/tab becomes incorrect.
