# token-radar-01-attempt-8

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dariovarga/token-radar-01-attempt-8/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dariovarga/token-radar-01-attempt-8/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Breakout Radar — a momentum-breakout token launch radar: it ranks pre-token protocols by the implied value of the token they may one day issue, under one question — is this protocol breaking out right now? Implied value = base × momentum × runway, from the snapshot's TVL, 7-day TVL change and days listed with no token. A breakout kick rewards weekly growth above 10%, a mildly concave scale keeps sheer size from deciding the board, and a runway curve rewards protocols that have run long enough without a token to be real. Every row carries a concrete farm plan with costs and times, and the dashboard adds a model sandbox so a reader can change the model and watch the board move.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
