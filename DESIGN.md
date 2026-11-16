# DESIGN — Whisper Market (بازار سیاه) v0.1

## 1. Architecture

```
Browser (phone)  ─┐                         ┌──────────────────────────────┐
Browser (TV)     ─┼─ Socket.IO + HTTP ─────▶│ server.ts (one Node process) │
                  ┘                         │  ├─ Next.js (App Router)      │
                                            │  ├─ RoomManager (rooms,       │
                                            │  │   timers, bots, reconnect) │
                                            │  ├─ Engine (pure TypeScript)  │
                                            │  └─ Store ──▶ PostgreSQL      │
                                            └──────────────────────────────┘
```

* **Engine** (`src/engine`) — pure, deterministic, JSON-serialisable state, seeded PRNG (mulberry32, state stored inside the game state). No timers, no I/O. All mutations go through the functions in `game.ts`; `actions.ts` is the single zod-validated action union used by clients, bots and the server.
* **Views** (`views.ts`) — the *only* data that leaves the server. `buildPlayerView` adds the private part (own clue, cash, inventory, orders, offers, bought clues); `buildPublicView` (TV) has none of it. During the reveal the views are gated step by step (events are not in the payload before they are revealed; a player's own outcome stays hidden until the "private" step).
* **RoomManager** (`src/server/room-manager.ts`) — lobby, host commands, deadlines (`setTimeout` from `state.deadline`), pause/resume, reconnect tokens (sha-256 hashed server side, raw token in `localStorage`), bot driver (900 ms tick, random delays), chat, host hand-over after 45 s away, sweeping of idle rooms.
* **Persistence** — live state in memory. A full snapshot (`RoomSnapshot`) is written at every phase change (and debounced 3 s after other changes); on boot active snapshots (<24 h) are restored and timers re-armed. History tables (Round, Order, Trade, ClueSale, Claim, Auction, Match results) are written when a round is resolved / the match ends. Without `DATABASE_URL` a no-op store is used so dev needs no database.
* **Realtime protocol** — client → server: `room:create`, `room:join`, `room:resume`, `tv:watch`, `action`, `host`, `chat`, `leave` (all with acks). Server → client: a personalised `state` snapshot after each change, `kicked`. Clients never compute prices or results.
* **UI** — Next.js App Router, Tailwind v4, Framer Motion, Vazirmatn (self-hosted through `next/font/local`; the font file is in `src/fonts`). Everything is CSS/SVG; sounds are Web Audio.

## 2. Folder layout

```
server.ts · Dockerfile · docker-compose.yml · docker-entrypoint.sh
prisma/schema.prisma + migrations/
src/engine/   config types rng content describe events prices game actions bots sim views
src/server/   room-manager store
src/lib/      protocol useRoom sound
src/i18n/fa.ts
src/components/ art ui shared lobby player tv reveal final room-client providers
src/app/      / · /room/[code] · /tv/[code] · /how-to-play
tests/engine  tests/server
```

## 3. Decisions (where the brief was open or ambiguous)

| Topic | Decision | Why |
|---|---|---|
| Execution price vs. scaled buys | Pass 1: price from *requested* net demand; buys are scaled (cash, space) at pass-1 prices; final price = from the *actual* net demand (≤ pass 1 on the buy side) | breaks the circularity, every scaled buy stays affordable, and phantom unaffordable orders cannot pump the price |
| Cash for buys | Sell proceeds of the same round are **not** spendable that round; sells **do** free warehouse space | deterministic without circular price dependence |
| Final valuation prices | "Final prices" = prices after the last round's events (`nextPrices`) | that is when predictions pay off; it also makes the storm decisive |
| Clue types | Every private clue has exactly 2 of 3 components; when more distinct clues are needed (4+ players) extra clues are *count clues* ("N events affect X", N may be 0) | needed to keep "no two identical clues" with 1 clued event; counts are true and sparse |
| Small tables | With 3 players and 2 clued events one event has a single holder; the public news then supplies the missing component so it is still reconstructable | brief allows the exception for 3 players |
| Auction cash | The winner's bid is reserved from spendable cash before market buys, so the bid can always be paid; the bid is paid even if delivery fails | spec: "bid is still lost" |
| Contract price | Per unit, 40–60 % above the market price at announcement; qty 3–5 | matches the example «۴ دارو به ۱۸۰» |
| Contract rounds | (2→3) and (round(2R/3) → +1) for R rounds (8 → 5→6) | spec: ≈ 1/3 and 2/3 |
| Trade price band | Pure goods ↔ coins: coins ∈ [0.5, 1.5] × market value. Anything else (goods ↔ goods, mixed): the two sides' market values may differ by at most 50 %. Empty/one-sided offers rejected | brief defines only the per-unit case |
| Clue-card preview | Topic (the good, when the clue includes it) + the kinds of information inside + sold count | matches «موضوع: آهن · شامل: جهت» |
| Claim verdict | per claim: events on that good agreeing / contradicting, and net = sign of the summed event effects (`true`/`false`/`mixed`/`noEvent`) | "honest and simple" |
| Titles | each title → one player; ties broken by the seeded PRNG; a title needs a positive value where that makes sense (e.g. nobody sold a clue ⇒ no "info broker") | avoids meaningless awards |
| Bots in the tribune | excluded from the speaker order | spec |
| Bots + early finish | bots draft their orders the instant the orders phase starts (sealed later) so a quick finish never drops them | fairness |
| Kick / leave mid-game | the seat is taken over by a bot (token revoked) | keeps the match consistent, no elimination |
| Ready | counts humans only; tribune uses a per-speaker "done" button instead | tribune is turn-based |
| Reveal pacing | per-step auto timers (5–10 s) + host "next"; claims reveal one by one with a "but he bought!" beat | spec's theatrical sequence |
| Final recap | rank countdown (last→first) → round-by-round truth → titles → «یه دست دیگه!» (host only; new seed, same players/settings) | spec |
| Docker lockfile | `package-lock.json` is not copied into the image; `npm install` runs against the default registry | a lockfile created behind a private registry would break the build elsewhere |
| LAN dev | `allowedDevOrigins` includes private ranges | phones on Wi-Fi can load dev assets |

## 4. Tunable numbers (`src/engine/config.ts`)

| Key | Value |
|---|---|
| players | 3–6 (≤4 players: 4 goods, else 5) |
| base prices | wheat 50 · fuel 80 · iron 100 · medicine 120 · chips 150 |
| start cash / warehouse | 1000 / 12 units |
| magnitudes | low 10 % · medium 20 % · high 30 % (storm ×1.5) |
| demand impact | 2 % per unit of net demand; clamp 50 %–200 % of current |
| carry-over | 0.5 of (execution − current); floor 20 % of base |
| trade band | ±50 % |
| clue card cap | 200 coins |
| claims | 2 per round |
| contract | qty 3–5, +40–60 % |
| rounds | 6–10 (default 8) |
| events / round | 2–3 (storm: 3); exactly 1 hidden |
| phases | info 15 s · tribune 20/30 s per player · market 120/180 s · orders 30 s |
| presets | «میز باز» (no whisper) · «بندر شلوغ» (whisper) |

## 5. Testing

* `tests/engine` — price maths, scaling, sells, clue-distribution **property tests** (400 seeds × 4 table sizes × storm/normal), trades (band, atomicity, conservation), clue cards, claims, footprints, auctions (ties, failed delivery, bid cap, cash reserve), storm, final scoring/titles, restart, view privacy.
* `tests/engine/sim.test.ts` — 4 bots play a full 8-round game with a fixed seed; all other table sizes/round counts and many seeds also run; cash/goods are checked for conservation around every trade and clue sale.
* `tests/server` — real Socket.IO round trip: create/join/bots/start, reconnect with token, TV payload contains nothing private, chat rules, a whole match, restart.

## 6. Known limitations

* The Docker image and the PostgreSQL store were written and type-checked, but only verified end-to-end where Docker/Postgres are available (see the README). Without a database the game runs fully in memory.
* Rooms only resume from snapshots taken at phase changes (debounced in between), so a crash can lose up to a few seconds of actions.
* Sounds are synthesised and simple; no music.
* No per-IP rate limiting on the socket endpoints.
