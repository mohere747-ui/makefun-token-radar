# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mohere747-ui/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/mohere747-ui/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: every protocol in the sealed snapshot that records no token yet, ranked by a value fitted on the snapshot's own labelled tokens, with a costed farm plan per row. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

The 128 protocols whose `mcap_usd` is nonzero are the ground truth. The model regresses `log10(mcap)` on `log10(TVL)` plus only those extra terms that improve BOTH a leave-one-out test and a walk-forward test (7d growth, listing age, chain breadth, sector). Terms that help one test but hurt the other are dropped. The fitted model prices the 198 pre-token rows; live tokens keep the market's own value. The dashboard reports validation MAEs, kept/dropped terms, a coverage manifest accounting for all 758 protocols, and a $/hour estimate on every farm step. No protocol name is hardcoded into the value.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=$PWD/out node main.ts --input /input/snapshot.json
```

In the grader the sealed snapshot is mounted at `/input`; outside it, pass `--input <snapshot.json>`.

Outputs land in `out/`: `board.json` (the ranked board), `data.js`, `dashboard/` and `screenshots/` copied in,
and `dossier.json` rebuilt by the vendored library.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
