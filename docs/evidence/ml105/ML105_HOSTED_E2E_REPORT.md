# ML-105 Hosted and Local E2E Report

## Hosted evidence

The ML-105 branch did not receive a new Vercel Preview deployment: the Vercel API returned `Resource is limited` / `api-deployments-free-per-day` (more than 100 deployments). No manual deploy retry was made, and no hosted ML-105 result is claimed.

The accepted UI prerequisite did pass on the exact PR #6 Preview head before merge. Deployment `dpl_DSekFirxTKpWisB4Dm1kuLExyEiH`, alias `sportsagentslab-mef-git-wor-e419e0-julitocrztuga-2084s-projects.vercel.app`, and commit `b7f86c522d6dc398103ffca2e5f080ba20544568` passed the authenticated synthetic import/detail/ML-103/ML-104 flow with zero console errors, page errors, and failed requests. PR #6 merged normally at main `e671e3a0837ceb1d5544b024fd3f5c4ec8b53d2c`.

## Local evidence

The local app passed the authenticated boundary: bootstrap `201`, context `200`, Better Auth session `200`, authenticated missing-resolution `404`, and anonymous resolution `401`. The full local Blob import flow could not proceed because `.env.local` contains an empty `BLOB_READ_WRITE_TOKEN`; no fake upload success was recorded.

Qualification: `PASS_WITH_LIMITATIONS`. The next gate is owner/deployment execution of the hosted ML-105 acceptance flow.
