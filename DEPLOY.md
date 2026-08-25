# Getting TillTrack off your laptop

Running the app on your Mac works for showing someone how it looks. It does not
work for a real game, for three reasons:

- Volunteers' phones have to be on the same wifi as your Mac.
- If the Mac sleeps or the terminal closes, the stand goes down.
- Only one stand can use it, and only while you're personally there.

Hosting it fixes all three. It also costs nothing at this size — a single booster
club fits inside the free tier of both services below with room to spare.

Budget about twenty minutes. You need to create two accounts; that part I can't
do for you.

---

## What you're setting up

Two services, one each:

| | What it does | Cost at your size |
|---|---|---|
| **Neon** | Holds the database — menu, shifts, sales, till counts | Free |
| **Vercel** | Runs the website volunteers open on their phones | Free |

---

## 1. Put the code on GitHub

Vercel deploys from a repository. If this project isn't on GitHub yet:

```bash
cd "/Users/drakemartinson/Desktop/claude code/tilltrack" && git init && git add -A && git commit -m "TillTrack MVP"
```

Then create an empty repo at [github.com/new](https://github.com/new) — **make it
private**, it has your club's data model in it — and follow the push instructions
GitHub shows you.

`.env` is already gitignored, so your local database password won't be uploaded.

## 2. Create the database

1. Sign up at [neon.tech](https://neon.tech) and create a project. Any name.
2. Pick the region closest to you — **US West (Oregon)** for Wyoming.
3. Copy the connection string it gives you. It looks like:
   `postgresql://user:password@ep-something.us-west-2.aws.neon.tech/neondb?sslmode=require`

Keep that tab open, you need the string in a moment.

## 3. Deploy the site

1. Sign up at [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New → Project**, and pick the repo you just pushed.
3. Before clicking Deploy, open **Environment Variables** and add two:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string from step 2 |
   | `SESSION_SECRET` | run the command below and paste the result |

   ```bash
   openssl rand -base64 32
   ```

   That second one signs the login cookies. Anyone who has it can forge a login,
   so treat it like a password — don't reuse your local one, don't paste it into
   a message.

4. Click **Deploy**.

The build runs `prisma migrate deploy` automatically, so the database tables get
created on the first deploy. You don't need to run migrations by hand.

## 4. Create your club in the live database

The hosted database starts empty. From your Mac, pointing at the live database
for one command only:

```bash
cd "/Users/drakemartinson/Desktop/claude code/tilltrack" && DATABASE_URL="<paste-your-neon-string>" npm run db:bootstrap
```

This creates the club, your admin account, and the full menu and inventory from
`prisma/setup-club.ts`. It **refuses to run if the database already has a club**,
so you can't wipe a live season by re-running it.

Change the admin password in `setup-club.ts` before you run this — the temporary
one is fine on your laptop, not on the open internet.

## 5. Hand out the link

Vercel gives you an address like `tilltrack-abc123.vercel.app`. That's the link
volunteers open on their phones. It works from anywhere — no wifi sharing, no
laptop involved.

Tell volunteers to open it once and tap **Add to Home Screen**. That installs it
as an app icon and pre-caches the shift screens, which matters for the next part.

---

## What happens when the stand has no signal

This is the part worth understanding, because it's why the app is built the way
it is.

Once a volunteer has opened a shift, **everything works with no connection**.
Orders and till counts are written to the phone itself first and uploaded when
signal returns. The badge in the corner says "Offline · 3 waiting" so they know
it's holding, and the running total keeps climbing normally.

They can finish the whole shift — opening count, every customer, closing count —
on a dead connection, and it all lands when they're back in coverage.

Two things volunteers should know:

- **Open the app before you lose signal**, ideally before leaving home. The first
  load needs a connection.
- **Don't force-quit the app with a full queue.** The records survive, but they
  only upload while the page is open. The closing screen warns if anything is
  still waiting.

---

## Once it's live

**A code change** goes out by pushing to GitHub. Vercel rebuilds automatically —
no command to remember.

**A menu change** is done in the app under Stands, not in `setup-club.ts`. That
file is for first-time setup only; re-running it against a live season deletes
recorded shifts.

**Backups** are worth turning on before your first real game. Neon keeps point-in-
time history on the free tier; check the retention window in your project
settings and know how to restore. A booster club losing a season of cash records
is a genuinely bad afternoon.

---

## Running locally after this

Still useful for trying changes before pushing them. One command now:

```bash
npm run gameday
```

That starts the database and the web server together, keeps the Mac awake,
restarts the server if it crashes, and prints both the localhost address and the
one phones on your wifi can use. Ctrl+C stops everything cleanly.
