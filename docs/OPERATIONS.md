# Deployment and operations

Requires Node.js 22+ for local use and internet for current market data. Use `npm ci`, `npm run check`, then `npm start`; open http://127.0.0.1:5187. The distributed ZIP includes the prebuilt Worker/client and `START-CRYPTOZ.cmd`, so the launcher does not need dependency installation.

`GET /healthz` returns status, service and release version without contacting upstream providers. `HEAD` returns no body. This proves the app handler is running, not that all providers are healthy. Check `npm run verify:live` and actual visible chart/news timestamps separately. During provider restrictions, browser-direct recovery can work where CORS and regional access permit. News still requires the gateway.

Release procedure: run the check and live scripts; inspect actual responsive/UI flows; review defects; build exact source; push that source; save/deploy that exact commit and build archive to the existing Site. Preserve its access audience. Verify returned deployment status, then reload the published app and inspect real data. Store deployment ID, commit and ZIP SHA-256 in the release receipt. Avoid putting temporary credentials, tokens, local research or environment secrets in an archive.

If a release regresses, select the last known good saved version and deploy it to the same Site with the same audience. Do not change the origin or wipe browser storage to roll back code. Export the workspace before importing another workspace; recovery preserves the previous committed workspace. Backups do not contain unfinished journal/risk drafts. Local browser storage may be denied or cleared and has no server replication.

Before opening the product to a larger audience, measure concurrent traffic and cache hit rates, establish provider terms and budgets, add external health/error monitoring and an incident process, test target physical devices/accessibility, and define recovery objectives. This release does not certify those operational commitments.
