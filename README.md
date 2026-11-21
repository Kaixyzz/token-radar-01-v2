# Firstlight Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Kaixyzz/token-radar-01-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Kaixyzz/token-radar-01-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a frozen DefiLlama snapshot of 758 protocols,
ranks the ones that record no token by what their launch would be worth, and
hands in a dashboard a reader can use — a board, a detail view per protocol,
filters, and the steps to farm each one.

## The model

Every protocol is scored from the snapshot's own figures only — no list of
names is hardcoded anywhere:

```
implied = tvl_usd x 0.22 x growth x seasoning x breadth
  growth    = 1 + clamp(change_7d, -40, +80) / 100   (no 7-day figure: 1.00)
  seasoning = 0.85 + 0.30 x min(age_days, 730) / 730  (no listing date: 365 days)
  breadth   = 1 + 0.03 x min(chains - 1, 5)
```

A protocol that records a token (a CoinGecko id or a symbol in the record)
is cut by a post-launch discount and scaled so every live row sits below the
lowest pre-token row: on a launch radar, a launch that already happened
cannot outrank one that has not. Live rows stay on the board, clearly marked,
for contrast.

Only launch candidates are ranked, by the same rule the snapshot's own
watchlist uses: no centralised exchange, no bridge, no liquid-staking or
restaking product, no wrapped or staked product of a token that already
trades, no name beginning with an exchange's name, and no versioned copy.
The watchlist's 40 all pass this rule, so coverage is untouched.

"Records no token" means the record carries neither a CoinGecko id nor a
symbol. That is a record, not proof the protocol has none.

## Run it

Node 22 or later, standard library only, nothing to install:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` into the output directory. Run it twice from different working
directories and the bytes are identical.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes the output
- `lib/model.ts` — the value model, the board, the farm plans
- `vendor/makefun-board.ts` — the dossier library, byte for byte from the kit
- `dashboard/` — the static page (index.html, app.css, app.js), no network
- `screenshots/` — the board, a detail view and a filtered view

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
