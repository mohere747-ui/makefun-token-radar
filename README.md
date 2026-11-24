# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mohere747-ui/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/mohere747-ui/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: every protocol in the sealed snapshot that records no token yet, ranked by an implied value derived from its own TVL, seven-day growth, age and sector, with a concrete farm plan per row. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=$PWD/out node main.ts --input input/snapshot.json
```

Outputs land in `out/`: `board.json` (the ranked board), `data.js`, `dashboard/` and `screenshots/` copied in,
and `dossier.json` rebuilt by the vendored library.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
