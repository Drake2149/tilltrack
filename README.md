# TillTrack

Cash accountability and inventory for volunteer-run concession stands.

Built from `tilltrack-mvp-spec.md`. One job, done well: a rotating volunteer who
has never seen the app before can open a till, log sales, close out, and have any
shortage flagged for the treasurer — without a training session and without
reliable wifi.

## Running it locally

```bash
npm install
```

Then one command runs everything — database, migrations, build, and web server,
with the server restarted if it falls over and (on macOS) sleep held off while
it's up:

```bash
npm run gameday
```

It prints both the local address and the one phones on the same wifi can use.
Ctrl+C stops it all cleanly.

### Or run the pieces separately

Useful while developing, since `gameday` runs a production build.

Start the database. This downloads and runs a real Postgres under `.pgdata`, so
no Docker or system Postgres is needed:

```bash
npm run db:up
```

In a second terminal, create the schema and seed the pilot club:

```bash
npm run db:migrate && npm run db:seed
```

Then start the app:

```bash
npm run dev
```

### Seeded accounts

All use the password `password123`:

| Email | Role | Sees |
|---|---|---|
| `treasurer@bighorn.test` | Admin | Everything |
| `volunteer@bighorn.test` | Volunteer | Only their own shifts + inventory |
| `ad@bighorn.test` | Viewer | Dashboard and reports, read-only |

## The volunteer flow

Shift Mode rings up **one customer at a time**, because the hard part at a
concession window isn't remembering what sold — it's adding up four items and
counting back change with a line waiting.

1. Tap what the customer asked for. Each item shows a quantity badge and the
   order builds in a list at the bottom.
2. Hit **Take payment**. The order total is shown large.
3. Punch in the cash handed over, or tap a quick button ($20, $50, exact).
   The app shows **Give back $8.00** in large type.
4. **Done — next customer** saves the sale and clears the screen.

Each completed order is stored as an `Order` with its line items, so reports can
show customers served and average order value, not just units sold.

Prices are re-read from the server on sync rather than trusted from the phone, so
a device that has been offline since a menu change can't undercharge.

## How the offline path works

This is the part that decides whether the pilot succeeds, because stands lose
signal constantly and that is exactly when money is moving.

1. Every completed order and till count is written to **IndexedDB first** with a
   client-generated UUID (`src/lib/offline-queue.ts`).
2. The queue is POSTed to `/api/sync`, which skips any order whose UUID is
   already stored. Replaying a batch therefore cannot double-charge.
3. Nothing leaves the outbox until the server acknowledges it, so closing the
   browser or walking out of coverage mid-game loses nothing.
4. A service worker (`public/sw.js`) caches the app shell so the shift screen
   still loads when reopened off-network.
5. The header badge always tells the volunteer where they stand: `Saved`,
   `Saving...`, or `Offline · N waiting`.

`navigator.onLine` is treated as a hint, not truth — stadium wifi routinely
reports "connected" while dropping every request, so reachability is inferred
from whether sync attempts actually succeed.

## Money handling

All money is stored as **integer cents**. Floating point in a cash-reconciliation
app produces phantom discrepancies, which is precisely the thing this product
exists to eliminate.

Sale rows snapshot `unitPriceCents` and `unitCostCents` at the time of sale, so
editing the menu later never rewrites past reports. Closed shifts likewise
snapshot the discrepancy threshold, so changing the setting can't silently
un-flag history.

## Core business logic

Implemented in `src/lib/shift-math.ts`, matching spec §5:

```
expectedClosing = openingCash + sales
discrepancy     = closingCash - expectedClosing
flag if abs(discrepancy) > threshold   // configurable per org, default $10
lowStockAlert   = currentStock <= reorderThreshold
```

## Deployment

Set two environment variables (see `.env.example`):

- `DATABASE_URL` — any Postgres (Neon, Supabase, RDS)
- `SESSION_SECRET` — 32+ chars, generate with `openssl rand -base64 32`

Then `npm run build && npm start`. Deploys to Vercel as-is; the embedded Postgres
in `scripts/pg.ts` is a local-development convenience only and is never used in
production.

## Deliberate v1 simplifications

These are choices, not oversights — each is contained and easy to revisit:

- **One organization per user.** Email is globally unique and a user belongs to
  one booster club, so the spec's "org selection" step is unnecessary. Supporting
  a person in two clubs means adding a membership join table.
- **Sell-through rate** is not computed. The spec's formula needs an opening
  stock count per shift, which would add a counting step to the volunteer flow —
  the one flow worth protecting from friction. "Hot items" is ranked by sales
  volume and revenue instead, and inventory movements are a full ledger, so
  adding true sell-through later is additive.
- **No password reset flow.** Treasurers create accounts and set temporary
  passwords from `/people`. Self-serve reset needs an email sender.
- **An in-progress order is not persisted.** Completed sales are durable the
  instant they're saved, but if a phone reloads while an order is half-rung-up,
  those taps are lost. Persisting it would mean either a hydration mismatch on
  the most safety-critical screen or restoring state in an effect; re-tapping
  three items was judged the cheaper cost.
- **Recipe-level inventory decrementing** is out of scope per spec §7. Selling a
  hot dog does not decrement buns; inventory is tracked by explicit restock and
  waste entries.

## Before taking a paying club

Spec §9 flags this and it is still open: booster club finances need an adult
signer / account owner (treasurer, AD, or booster president) as the contracting
party. Worth settling before the first invoice, independent of the software.
