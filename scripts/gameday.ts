/**
 * One command to run the whole stand: `npm run gameday`
 *
 * Running the app locally meant babysitting two terminals, and if either the
 * database or the web server died mid-game the stand went down with it. This
 * starts both, keeps the Mac awake, restarts the web server if it crashes, and
 * prints the address volunteers' phones should use.
 *
 * Still local-only — phones must share the Mac's wifi. See DEPLOY.md for the
 * hosted setup, which is what an actual game away from your own network needs.
 */
import EmbeddedPostgres from 'embedded-postgres'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), '.pgdata')
const PG_PORT = 54329
const APP_PORT = Number(process.env.PORT ?? 3002)
const USER = 'tilltrack'
const PASSWORD = 'tilltrack'
const DATABASE = 'tilltrack'

const skipBuild = process.argv.includes('--skip-build')

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PG_PORT,
  persistent: true,
})

let shuttingDown = false
let appProcess: ChildProcess | null = null
let caffeinate: ChildProcess | null = null

function lanAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return null
}

/** Runs a command to completion, inheriting stdio. Rejects on non-zero exit. */
function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    )
    child.on('error', reject)
  })
}

/**
 * Keeps the web server alive. A crash on a Saturday afternoon should cost a few
 * seconds, not the rest of the game — the offline queue on each phone covers the
 * gap, and volunteers never see it.
 */
function superviseApp() {
  let restarts = 0
  let lastStart = Date.now()

  const start = () => {
    if (shuttingDown) return

    appProcess = spawn(
      'npx',
      ['next', 'start', '--hostname', '0.0.0.0', '--port', String(APP_PORT)],
      { stdio: 'inherit', shell: false },
    )
    lastStart = Date.now()

    appProcess.on('exit', (code) => {
      if (shuttingDown) return

      // A process that survived a while and then died is worth restarting. One
      // that dies instantly is misconfigured, and looping would just spam.
      const ranFor = Date.now() - lastStart
      if (ranFor < 5000) restarts += 1
      else restarts = 0

      if (restarts >= 3) {
        console.error(
          `\nWeb server exited (${code}) three times in a row without staying up.` +
            `\nSomething is wrong with the app itself — the error above should say what.` +
            `\nStopping so you can read it.`,
        )
        void shutdown(1)
        return
      }

      console.error(`\nWeb server exited (${code}). Restarting...`)
      setTimeout(start, 1000)
    })
  }

  start()
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true

  console.log('\nShutting down...')
  appProcess?.kill('SIGTERM')
  caffeinate?.kill('SIGTERM')

  try {
    await pg.stop()
  } catch {
    // Already stopped, or never started — nothing useful to do here.
  }

  process.exit(exitCode)
}

async function main() {
  const isFirstRun = !existsSync(DATA_DIR)
  if (isFirstRun) {
    console.log('Setting up the database for the first time (downloads Postgres)...')
    await pg.initialise()
  }

  console.log('Starting database...')
  await pg.start()
  if (isFirstRun) await pg.createDatabase(DATABASE)

  console.log('Applying any pending database changes...')
  await run('npx', ['prisma', 'migrate', 'deploy'])

  if (!skipBuild) {
    console.log('Building the app (about a minute, only needed after code changes)...')
    await run('npx', ['next', 'build'])
  } else if (!existsSync(path.join(process.cwd(), '.next', 'BUILD_ID'))) {
    console.error('No previous build found — run without --skip-build first.')
    await shutdown(1)
    return
  }

  // Stop the Mac sleeping mid-shift, which is what silently kills the stand.
  if (process.platform === 'darwin') {
    caffeinate = spawn('caffeinate', ['-dimsu'], { stdio: 'ignore' })
    console.log('Keeping this Mac awake while the stand is open.')
  }

  superviseApp()

  const lan = lanAddress()
  console.log('\n' + '='.repeat(52))
  console.log('  TillTrack is running')
  console.log('='.repeat(52))
  console.log(`  On this Mac:  http://localhost:${APP_PORT}`)
  if (lan) {
    console.log(`  On phones:    http://${lan}:${APP_PORT}`)
    console.log('                (same wifi as this Mac)')
  } else {
    console.log('  On phones:    unavailable — this Mac is not on a network')
  }
  console.log('='.repeat(52))
  console.log('  Press Ctrl+C to close the stand.\n')
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

main().catch(async (err) => {
  console.error(err)
  await shutdown(1)
})
