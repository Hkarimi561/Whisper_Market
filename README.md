# بازار سیاه · Whisper Market

[فارسی](#فارسی) · [English](#english)

---

## فارسی

**بازار سیاه** یک بازی دورهمی برای ۳ تا ۶ نفر است که شب‌های یک بندر خیالی را روایت می‌کند. هر بازیکن تاجری است که با گوشی خودش بازی می‌کند (دفترچهٔ سفارش و کارت‌های خصوصی‌اش)، و همه کنار هم می‌نشینند و با هم حرف می‌زنند. یک صفحهٔ مشترک (تلویزیون یا لپ‌تاپ) اختیاری است.

- هر دور ۲ تا ۳ رویداد پنهان قیمت کالاها را جابه‌جا می‌کند.
- هر تاجر یک سرنخ سربه‌مهر دارد؛ **سیستم هرگز دروغ نمی‌گوید، ولی هیچ‌وقت همه‌چیز را هم نمی‌گوید. تاجرها می‌توانند دروغ بگویند.**
- هر دور: اطلاعات ← تریبون ← بازار آزاد ← سفارش سربسته ← افشا.
- بدون پول واقعی، بدون ثبت‌نام، بدون حذف بازیکن.

### اجرا با Docker

```bash
docker compose up --build
```

این تنها دستور لازم است: PostgreSQL بالا می‌آید، مهاجرت‌های Prisma خودکار اجرا می‌شود و برنامه روی <http://localhost:3000> در دسترس است. (رمز و نام پایگاه‌داده را می‌توان با `.env` عوض کرد؛ نمونه: `.env.example`.)

اگر پایگاه‌داده‌ات از قبل وجود دارد و فقط یک `DATABASE_URL` کامل داری (مثلاً `postgresql://user:pass@host:5432/dbname`):

```bash
DATABASE_URL='postgresql://user:pass@host:5432/dbname' docker compose -f docker-compose.external-db.yml up --build
```

این حالت فقط برنامه را بالا می‌آورد و مهاجرت‌ها را روی همان پایگاه‌داده اجرا می‌کند.

### بازی با گوشی‌ها روی یک وای‌فای

۱. IP شبکهٔ محلی کامپیوتر را پیدا کن (مثلاً `192.168.1.20`؛ در ویندوز `ipconfig` و در مک/لینوکس `ifconfig`/`ip a`).
۲. روی همان کامپیوتر برنامه را اجرا کن، و روی هر گوشی `http://<LAN-IP>:3000` را باز کن.
۳. یک نفر «اتاق تازه بساز» را می‌زند؛ بقیه کد چهارحرفی را وارد می‌کنند (یا لینک داخل اتاق انتظار را باز می‌کنند).
۴. اگر فایروال سیستم اجازه نمی‌دهد، پورت ۳۰۰۰ را باز کن.

### ورود با گوگل (اختیاری)

در [Google Cloud Console](https://console.cloud.google.com/apis/credentials) یک OAuth Client از نوع Web بساز، آدرس سایت (مثلاً `http://localhost:3000`) را در «Authorized JavaScript origins» بگذار و مقدار `GOOGLE_CLIENT_ID` را در `.env` بنویس. بدون آن، دکمه نمایش داده نمی‌شود و ورود فقط با اسم مستعار است.

### صفحهٔ تلویزیون

روی لپ‌تاپ یا تلویزیون آدرس `http://<LAN-IP>:3000/tv/<کد اتاق>` را باز کن (یا در صفحهٔ اول «نمایش روی تلویزیون» را بزن). این صفحه فقط اطلاعات عمومی نشان می‌دهد: هرگز سرنخ خصوصی یا ثروت کسی را نشان نمی‌دهد (جز در جدول پایانی).

### توسعه و آزمون

```bash
npm install
npm run dev            # http://localhost:3000 — بدون DATABASE_URL هم کار می‌کند (بدون ذخیره‌سازی)
npm test               # آزمون‌های موتور، شبیه‌سازی ربات‌ها و سرور (Vitest)
npm run lint
npm run typecheck
npm run sim -- 42 4    # یک بازی کامل ۸ دوری با ۴ ربات و seed=42
```

برای تنهایی بازی کردن در محیط توسعه: اتاق بساز، «افزودن ربات» را دو بار بزن و «شروع بازی».

---

## English

**Whisper Market** is a face-to-face party game for 3–6 players set in a night-time smuggler's harbour. Everyone plays on their own phone (private clues and order pad) while sitting together and talking. A shared TV / laptop screen is optional.

- Each round 2–3 hidden events move the prices.
- Every merchant holds a sealed clue. **The system never lies, but it never tells the whole truth. Players can lie.**
- Round loop: Information → Tribune → open Market → sealed Orders → Reveal.
- No real money, no accounts, no elimination. The UI is Persian and RTL.

### Run with Docker

```bash
docker compose up --build
```

That is the only command needed. It starts PostgreSQL (named volume, healthcheck), the app waits for the database, runs `prisma migrate deploy`, then serves <http://localhost:3000>. Override defaults through `.env` (see `.env.example`).

If you already have a PostgreSQL server and only a full `DATABASE_URL`:

```bash
DATABASE_URL='postgresql://user:pass@host:5432/dbname' docker compose -f docker-compose.external-db.yml up --build
```

### Play on phones over the same Wi-Fi

1. Find your machine's LAN IP (e.g. `192.168.1.20`).
2. Run the app there and open `http://<LAN-IP>:3000` on each phone.
3. One player taps *Create room*; the others enter the 4-letter code (or open the link shown in the lobby).
4. Allow port 3000 through the firewall if needed.

### Sign in with Google (optional)

Create an OAuth 2.0 *Web* client in the Google Cloud Console, add your site origin (e.g. `http://localhost:3000`) under *Authorized JavaScript origins*, and set `GOOGLE_CLIENT_ID` in `.env`. The server verifies the ID token; the Google first name prefills the nickname, and the same account can take its seat back from another device. Without the variable the button is hidden and guests join with a nickname only.

### TV view

Open `http://<LAN-IP>:3000/tv/<ROOM-CODE>` on a laptop or TV (or use *TV view* on the landing page). It only renders public information — never private clues, orders or anybody's wealth until the final ranking.

### Develop & test

```bash
npm install
npm run dev          # works without DATABASE_URL (no persistence)
npm test             # engine, bot simulation and realtime server tests (Vitest)
npm run lint && npm run typecheck
npm run sim -- 42 4  # headless full 8-round game: seed 42, 4 bots
```

To play alone in dev: create a room, press *Add bot* twice, then *Start*.

### Project layout

```
server.ts                custom Node server: Next.js + Socket.IO
src/engine/              pure, seeded, JSON-serialisable game engine (+ bots, simulation, views)
src/server/              room manager (timers, bots, reconnect) and the Prisma store
src/components, src/app  Persian RTL UI (phone, TV), routes
src/i18n/fa.ts           the UI string dictionary
prisma/                  schema + migrations
tests/                   Vitest suites
```

See [DESIGN.md](DESIGN.md) for the architecture, decisions and every tunable number.
