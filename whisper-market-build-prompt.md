# Build "Whisper Market / بازار سیاه" — complete playable v0.1 in one run

You are building a complete, playable, beautiful multiplayer party game from an empty folder. Work autonomously until everything below is done, tested, and runs with `docker compose up`. Do not stop at a skeleton or a partial build. If something is ambiguous, pick the option that makes the game more fun and record the decision in `DESIGN.md`.

---

## 0. How to work

1. Read this whole document first. Write a short plan in `DESIGN.md`: architecture, folder layout, and the decisions you made.
2. Build in this order. Each step must work before you start the next.
   1. A **pure TypeScript game engine** with unit tests.
   2. The **realtime server**.
   3. The **database layer**.
   4. The **UI**: player phone view, then TV view.
   5. **Docker**.
3. The engine must be deterministic, given a seed, and fully covered by tests. Run the tests and fix every failure.
4. Add **bot players** early, so you can play a full game alone in dev, and use them in an automated full-game simulation test.
5. Finish by running: lint, typecheck, unit tests, the bot simulation of a full 8-round game, and `docker compose up --build`. Then confirm the app loads and a game can be played end to end with bots.
6. If a frontend or UI design skill is available to you, use it for the visual work.

---

## 1. Tech requirements (mandatory)

- **Next.js** (latest stable, App Router, TypeScript, strict mode).
- **PostgreSQL**, accessed with **Prisma**, with migrations included and run automatically on container start.
- **Realtime:** Socket.IO on a custom Node server (`server.ts`) that also serves Next.js, all in one app container. The server is authoritative: clients never compute prices or results.
- **Styling and animation:** Tailwind CSS and Framer Motion. Sound effects are optional, with a mute toggle, and can be generated with the Web Audio API so no asset files are needed.
- **Tests:** Vitest for the engine and server logic.
- **Docker:**
  - `Dockerfile`: multi-stage production build.
  - `docker-compose.yml` with services `app` and `postgres`. Include a healthcheck, a named volume for the database, and an app that waits for the database and runs `prisma migrate deploy` on start.
  - `.env.example`.
  - `docker compose up --build` must be the only command needed. App on port 3000.
- **No accounts or login.** Players join a room with a nickname and a 4-letter room code, Jackbox style. Store a reconnect token in localStorage. Refreshing or reconnecting puts the player back into the same seat, with full state restored from the server.
- **Persistence:**
  - Live game state lives in server memory.
  - Snapshot it to Postgres at every phase change, so a server restart can resume rooms.
  - Also store rooms, players, matches, each round's events and clues, orders, trades, clue sales, claims, auctions, and final results. The end-of-game recap is built from this data.

---

## 2. Product summary

A party game for **3–6 players**, played mainly **face to face in the same room**. Everyone uses their own phone as a private hand of cards and an order pad. An optional **TV / laptop screen** shows timers and the big dramatic reveals. Players are merchants in a fictional night-time port. Prices move because of hidden events. Each player knows a different fragment of the truth.

- **Core fun:** reading the gap between what people **say** and what they **do**. Every round goes **guess → commit → reveal**.
- **Core principle:** *The system never lies; players can.* Every system clue is true, but it is only part of the truth.
- **Layering principle:** Everything binding goes through the system: orders, trades, clue sales, claims, bids. Talking happens out loud in the room, and the system never needs to know what was said.
- **No real money**, no gambling, nothing cashable.
- **No player elimination.** Everyone plays until the end.

---

## 3. Screens and routes

- `/`: landing page. Create a room or join with a code and nickname. Atmospheric, game-like. Includes a "How to play" entry.
- `/room/[code]`: the **player view**, mobile first. This is where the game is played.
- `/tv/[code]`: the optional **shared-screen view**, made for a big landscape screen. Opening it just needs the room code. It shows public information only, and **never** private info or anyone's wealth.
- `/how-to-play`: a short, illustrated Persian rules page.

**Without a TV screen,** every reveal must also play as a synchronized, step-by-step sequence on all phones at the same moment, so the group experiences it together.

---

## 4. Lobby (host = lobby manager)

The first player to create the room is the host. The host can:

- start the game, kick a player, add or remove **bots**, and pause, resume or skip a phase;
- choose a preset or open **Advanced** settings:
  - **«میز باز» (Open Table), the default:**
    - whispering not allowed;
    - tribune 20 s per player;
    - market 120 s.
  - **«بندر شلوغ» (Busy Port):**
    - whispering allowed;
    - tribune 30 s;
    - market 180 s.
  - **Advanced:**
    - number of rounds, 6–10, default 8;
    - tribune seconds;
    - market seconds;
    - order seconds;
    - whisper allowed (yes/no);
    - **in-app chat (off by default)**: public chat, plus private messages if whispering is allowed. This is for remote play.

The whisper rule is shown to everyone as a table rule. When face to face, the system cannot enforce it. When in-app chat is on, it decides whether private messages exist.

**Ready button:** in timed phases, if every human player taps «آماده‌ام», the phase ends early.

---

## 5. Game rules (v0.1)

All numbers live in one config file (`engine/config.ts`), so they can be tuned.

### 5.1 Setup

- Goods: 3–4 players use 4 goods (گندم، سوخت، آهن، دارو). 5–6 players use 5 goods (add تراشه).
- Base prices: گندم 50, سوخت 80, آهن 100, دارو 120, تراشه 150.
- Each player starts with **1000 coins** and an empty warehouse with a **12-unit total** capacity.
- Final score = cash + inventory valued at final prices.
- **Wealth is hidden** until the end. Each player sees only their own. There is no leaderboard during the game.

### 5.2 Gradual unlock (built-in tutorial)

| Round | What is available |
|---|---|
| 1 | Clues, tribune, registered claims, market orders |
| 2 | Adds direct player-to-player trades and clue-card sales. The first contract is announced. |
| 3 | Adds the first sealed contract auction |

When a feature unlocks, show a short, delightful one-time explainer.

### 5.3 Round phases

1. **اطلاعات (Information), about 15 s.** Public news and the private clue are shown. In announce rounds the upcoming contract is shown too.
2. **تریبون (Tribune).** Players speak one at a time, out loud. The server runs the turns. The speaking order rotates every round, so the person who was first last round goes last.
   - The current speaker's phone says it is their turn, with a big countdown.
   - Everyone else sees who is speaking.
   - The TV shows the speaker big, with a timer.
   - In in-app chat mode, the speaker may post one public message.
3. **بازار (Market).** Free talk.
   - Players can make direct trades, buy or sell clue cards, and register claims.
   - Order entry is **not yet** open. It opens in the next phase.
4. **سفارش (Orders), about 30 s.** Players secretly enter market orders, plus a sealed bid in auction rounds.
5. **افشا (Reveal).** A theatrical step-by-step sequence, which the host can advance (or it auto-advances):
   1. execution prices;
   2. events, one by one;
   3. claims compared with the truth;
   4. footprints;
   5. public trades;
   6. auction result;
   7. each player's private round result, on their own phone only.

### 5.4 Events and clues

Each round has **2–3 hidden events**. The last round has 3. Each event has three components:

- **target:** which good;
- **direction:** up or down;
- **magnitude:** low 10%, medium 20%, high 30%.

The **last round is «طوفان» (Storm):** magnitudes are ×1.5, and the round is announced dramatically.

**Rules:**

- Exactly **one event per round has no clues** (the "hidden" event). It adds controlled uncertainty.
- **Public news** reveals one component of one clued event to everyone, for example «امروز رویدادی روی آهن هست».
- Each player gets **one private clue**. A clue reveals **two of the three components** of one clued event, for example "an event pushes iron UP" (magnitude unknown).
- A clue may instead be a **count clue**, used sparingly: "N events affect iron".
- **Distribution invariants.** Enforce these in the engine and test them:
  - no player ever gets all three components of an event;
  - no two players get an identical clue;
  - every clued event can be fully reconstructed by combining the clues of at most 2–3 players;
  - each player's clue carries roughly equal information (two components);
  - the clue set must not let any single pair of players know the complete truth about every event, unless there are only 3 players.
- Events should come from a themed generator with flavor text in Persian, for example «قرارداد ساخت‌وساز بزرگ امضا شد»، «محمولهٔ آهن از جنوب رسید»، «اعتصاب در پالایشگاه». Use at least about 30 event templates, each with direction and plausible targets.

### 5.5 Prices

- **Execution price** for good g this round = `current_price × (1 + 0.02 × net_demand_g)`.
  - `net_demand_g` = total units bought minus total units sold by all players this round.
  - Clamp the execution price between 50% and 200% of the current price.
  - All buyers and sellers of g pay or receive the same execution price.
- **Next price** = `current_price × (1 + sum of event effects on g) + 0.5 × (execution_price − current_price)`.
  - Half of the execution impact carries into the next round. This creates "bubble" stories without making pumping profitable.
  - Floor: 20% of the base price.
- **Orders:**
  - Per good, each player buys **or** sells a quantity. No shorting, no loans.
  - Buy validation happens at execution:
    - if the player cannot afford the quantity at the execution price, or it would overflow the warehouse, scale the quantity down to the maximum possible;
    - show an estimated price range in the order UI so this never surprises the player.
  - Sells are limited to the units the player holds.

### 5.6 Direct trades (from round 2)

- An offer is a bundle: goods and/or coins given ⇄ goods and/or coins received. It executes atomically on acceptance, during the market phase.
- **Anti-wealth-transfer band:** the implied price per good unit must be within **±50% of its current market price**. The UI shows the allowed range.
- Direct trades **do not** affect execution prices. This is a reason to trade directly.
- At reveal, trades are shown publicly as «سارا ↔ علی: آهن», with the participants and goods but **not** the amounts or price.

### 5.7 Clue cards (from round 2)

- A player can list their clue as a **verified card** with a price. The price cap is 200 coins.
- Before buying, a buyer sees only:
  - the topic preview, for example «موضوع: آهن · شامل: جهت»;
  - "sold N times so far".
- After paying, the buyer receives the true full clue, shown with a **wax-seal "verified"** look.
- A seller may sell the same card to multiple buyers.
- A buyer can never resell a card as verified.

### 5.8 Registered claims

- In the tribune and market phases, a player can register up to **2 claims per round**, of the form «[کالا] ↑» or «[کالا] ↓».
- Claims appear publicly right away, as stamped notices on the board and the TV.
- At reveal, each claim is compared against the event or events on that good. Show "matched an event / contradicted by events / net result" honestly and simply.
- There is **no reputation score**. Show only the history, and let the humans judge.

### 5.9 Footprints

At reveal, everyone sees, for each player and each good, whether they were **buyer / seller / nothing** this round. Quantities are never shown.

### 5.10 Contracts and sealed auctions

- Announced in round 2 and auctioned in round 3. Announced in round 5 and auctioned in round 6. For other round counts, use about 1/3 and 2/3 of the game.
- Example: «بیمارستان ۴ دارو را به ۱۸۰ می‌خرد».
  - Quantity: 3–5.
  - Price: 40–60% above the current price.
- In the auction round's order phase, players submit a **sealed coin bid**. The highest bid wins. A tie goes to a random seeded choice. Only the winner pays.
- **Delivery:** after market execution, the winner must hold the quantity. The goods are removed and the contract price is paid out. If the winner cannot deliver, the contract fails and the **bid is still lost**. Show a dramatic «قرارداد شکست خورد».
- A bid cannot exceed the player's cash.

### 5.11 End of game: the "one more game" moment

This is a full theatrical recap, shown on the TV and on phones:

1. **Final ranking reveal**, with a countdown from last place to first.
2. **Truth recap, per round:**
   - every event;
   - which clue each player had;
   - every claim compared with the truth;
   - who sold which clue to whom;
   - every trade.
3. **Titles**, computed from behavior. Each title goes to one player:
   - «صادق‌ترین تاجر»: most claims matching events;
   - «استاد بلوف»: most claims contradicted by their own footprint;
   - «دلال اطلاعات»: most coins earned from clue sales;
   - «گرگ تنها»: fewest trades and sales;
   - «شکارچی قرارداد»: most contract profit;
   - «مرد طوفان»: best last-round result.
4. A big **«یه دست دیگه!»** button. It restarts in the same room with the same players and settings, and a new seed.

---

## 6. Visual and UX direction (very important)

**It must feel like a game, never like an admin panel or a dashboard.** No plain data tables, no grey forms, no sidebar layouts. If a screen looks like a CRUD app, redesign it.

- **Language and layout:** Persian UI, full **RTL**, Persian digits. Use a good Persian font, **Vazirmatn**, self-hosted through next/font or @fontsource, with no runtime CDN dependency.
- **Theme:** a smuggler's market at night in a fictional harbor.
  - Deep navy sea and night sky, warm lantern and amber light, brass and copper accents.
  - Weathered paper and parchment cards, wax seals, rubber stamps, crates, ropes.
  - Subtle fog or water shimmer.
  - Build everything with CSS, SVG and gradients. **No external image assets are required.** Draw good icons as inline SVG: crates of wheat, fuel barrels, iron ingots, medicine boxes, chips.
- **Game objects instead of widgets:**
  - **Goods** are illustrated crate cards with a live price "chalkboard" tag and an up/down arrow animation.
  - **Warehouse:** 12 visible slots that fill with tiny crate icons.
  - **Cash:** a coin purse with an animated counter.
  - **Orders:** big tactile +/− steppers on each crate card, a "seal the order" button with a wax-stamp animation, and the estimated price range shown in a friendly way.
  - **Clue:** a sealed letter that the player tears open. Verified bought cards carry a red wax seal.
  - **Claims:** stamped notices pinned to a harbor notice board.
  - **Timers:** a burning fuse or an hourglass, with a gentle pulse in the last 5 seconds.
  - **Tribune:** a spotlight on the speaker's name, with the queue of upcoming speakers as small lanterns.
- **Reveal choreography** (Framer Motion):
  - card flips for events;
  - prices rolling like an odometer;
  - footprints appearing as stamps;
  - a dramatic beat before contradictions («ولی خودش خرید!»).
- **Mobile first:**
  - one-handed play, tap targets ≥ 44 px;
  - no horizontal scrolling;
  - private information always visible but compact;
  - bottom navigation for the market sub-areas: trade, clue market, claims.
- **TV view:** landscape, large type readable from 3 m, cinematic transitions, public info only.
- **Feedback:** micro-interactions everywhere, light haptics where supported (`navigator.vibrate`), optional sounds (coin clink, stamp, paper tear, fuse hiss) with a mute toggle.
- **Accessibility:**
  - sufficient contrast;
  - never use color alone to convey up/down (always arrows plus text);
  - respect `prefers-reduced-motion`.
- **Empty and waiting states** should be charming, for example «منتظر بقیهٔ تاجرها…» with a little animated lantern.

---

## 7. Bots

Bots can be added from the lobby. They are for testing and for filling a table.

- Simple strategy:
  - trade on their own clue;
  - partially believe registered claims;
  - occasionally make false claims;
  - sell their clue card sometimes;
  - bid on contracts when they can deliver.
- Bots act after random short delays, so they feel alive.
- Bots skip the tribune automatically.

---

## 8. Tests and acceptance criteria

**Engine unit tests (Vitest) must cover:**

- execution price, clamping, next price and carry-over;
- order scaling by cash and capacity;
- sell limits;
- clue distribution invariants, as property tests over many seeds;
- the trade price band and atomic execution;
- clue card sales (multiple buyers, no resale);
- claim evaluation;
- footprints;
- auction ties, delivery failure and the bid cap;
- the storm round;
- final scoring and titles.

**Simulation test:** 4 bots play a full 8-round game with a fixed seed. It must finish with no errors and with consistent money and goods totals (conservation checks for trades and sales).

**Done means all of these work:**

- [ ] `docker compose up --build` starts Postgres and the app, and runs migrations.
- [ ] Creating a room, joining from 3+ browser tabs or phones, and adding bots all work.
- [ ] A full game plays from lobby to final recap with every mechanic above working.
- [ ] Refreshing a phone mid-game restores the player's seat and private state.
- [ ] The TV view works and never leaks private information or wealth.
- [ ] «یه دست دیگه!» restarts in the same room.
- [ ] Every screen is Persian, RTL, and looks like a polished game on a 375 px wide phone and on a 1080p TV.
- [ ] Lint, typecheck and all tests pass.

---

## 9. Out of scope for v0.1

- user accounts;
- public matchmaking;
- voice chat;
- monetization, shops or cosmetics;
- localization beyond Persian, though UI strings should still be kept in a single dictionary file.

---

## 10. Deliverables

- the full source code;
- `README.md` in Persian and English: what the game is, `docker compose up --build`, how to play locally with phones on the same Wi-Fi (`http://<LAN-IP>:3000`), how to open the TV view, and how to run tests;
- `DESIGN.md`: architecture, the decisions you made, and the tunable numbers;
- a final summary of what was built, and any known limitations.
