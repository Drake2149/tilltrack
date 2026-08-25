// Local dev Postgres. No Docker or system Postgres required — this downloads and
// runs a real Postgres binary under .pgdata so the dev database matches production.
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync } from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), '.pgdata')
const PORT = 54329
const USER = 'tilltrack'
const PASSWORD = 'tilltrack'
const DATABASE = 'tilltrack'

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
})

async function main() {
  const isFirstRun = !existsSync(DATA_DIR)
  if (isFirstRun) {
    console.log('Initialising Postgres cluster (first run, downloads binaries)...')
    await pg.initialise()
  }

  await pg.start()

  if (isFirstRun) {
    await pg.createDatabase(DATABASE)
  }

  const url = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`
  console.log(`Postgres ready: ${url}`)
  console.log('Press Ctrl+C to stop.')

  const shutdown = async () => {
    console.log('\nStopping Postgres...')
    await pg.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
