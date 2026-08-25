/**
 * Replaces all demo data with a real club's setup.
 *
 * Edit the CONFIG block below, then run:  npm run db:setup
 *
 * This wipes every organization in the database and recreates one from CONFIG,
 * so it is safe to re-run while you're still getting the menu right. Once real
 * shifts have been recorded, stop using this and edit through the app instead —
 * re-running it would delete that history.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline/promises'

// ---------------------------------------------------------------------------
// CONFIG — everything below the line is generic; only edit this block.
// ---------------------------------------------------------------------------

const CONFIG = {
  club: {
    name: 'Big Horn Booster Club',
    slug: 'big-horn-boosters',
    // Shifts get flagged when the closing count is off by more than this.
    discrepancyThreshold: 10.0,
  },

  // The first admin account. You'll sign in with this.
  //
  // The password comes from the environment rather than living here, because
  // this file goes into git and anything committed stays in the history for
  // good — including after a repo is shared or made public.
  //
  //   ADMIN_PASSWORD="..." npm run db:bootstrap
  admin: {
    name: 'Drake Martinson',
    email: 'drakemartinson49@gmail.com',
    password: process.env.ADMIN_PASSWORD ?? '',
  },

  stands: [
    {
      name: 'Concession Stand',

      // From Concessions - Inventory_Pricing.pdf.
      // price / cost are in dollars. cost is optional and only drives the
      // profit-by-item report — blank just means that report shows no margin.
      menu: [
        { name: 'Soft Pretzel', price: 4.0, cost: 0.81 },
        { name: 'Nachos', price: 4.0 }, // cost was $0.00 on the sheet — unfilled
        { name: 'Popcorn', price: 2.0 }, // cost was blank on the sheet
        { name: 'Hot Dog', price: 3.0, cost: 0.66 },

        { name: 'Chocolate Cookie', price: 2.0, cost: 0.58 },
        { name: 'Brownie Cookie', price: 2.0, cost: 0.58 },
        { name: 'Doritos Cool Ranch', price: 2.0, cost: 0.67 },
        { name: 'Doritos Nacho Cheese', price: 2.0, cost: 0.67 },

        { name: 'Snickers', price: 2.0, cost: 1.11 },
        { name: 'Skittles', price: 2.0, cost: 1.11 },
        { name: "Peanut M&M's", price: 2.0, cost: 1.11 },
        { name: "M&M's", price: 2.0, cost: 1.11 },
        { name: 'KitKat', price: 2.0 }, // no pricing on the sheet
        { name: "Reese's", price: 2.0 }, // no pricing on the sheet
        { name: 'Candy (rename me)', price: 2.0, cost: 0.94 }, // unnamed row on the sheet

        { name: 'Water', price: 1.0 },
        { name: 'Pepsi', price: 2.0 },
        { name: 'Diet Pepsi', price: 2.0 },
        { name: 'Root Beer', price: 2.0 },
        { name: 'Mt. Dew', price: 2.0 },
        { name: 'Sprite', price: 2.0 },
        { name: 'Gatorade Cool Blue', price: 2.0 },
        { name: 'Gatorade Glacier Freeze', price: 2.0 },
        { name: 'Gatorade Red', price: 2.0 },

        { name: 'Hot Cocoa', price: 2.0 },
        { name: 'Hot Drink (rename me)', price: 2.0 }, // unnamed row on the sheet
      ] as { name: string; price: number; cost?: number }[],

      // Everything starts at zero so the first real count sets the baseline.
      // Reorder points come from the sheet's own low-stock marks; until you
      // count stock in, every item will read as low, which is accurate.
      inventory: [
        { name: 'Pretzels', unit: 'each', reorderAt: 25, unitCost: 0.81 },
        { name: 'Cheese cups', unit: 'each', reorderAt: 100 },
        { name: 'Plates', unit: 'each', reorderAt: 100 },

        { name: 'Nacho cheese', unit: 'bag', reorderAt: 4 },
        { name: 'Tortilla chips', unit: 'bag', reorderAt: 16 },
        { name: 'Jalapeños', unit: 'gal', reorderAt: 4 },
        { name: 'Paper boats', unit: 'each', reorderAt: 250 },

        { name: 'Flavacol', unit: 'box', reorderAt: 5 },
        { name: 'Popcorn oil', unit: 'gal', reorderAt: 10 },
        { name: 'Popcorn kernels', unit: 'each', reorderAt: 25, unitCost: 7.3 },
        { name: 'Popcorn bags', unit: 'each', reorderAt: 250 },

        { name: 'Hot dog buns', unit: 'each', reorderAt: 48, unitCost: 0.28 },
        { name: 'Hot dogs', unit: 'each', reorderAt: 35, unitCost: 0.38 },
        { name: 'Ketchup', unit: 'packet', reorderAt: 500 },
        { name: 'Mustard', unit: 'packet', reorderAt: 250 },

        { name: 'Napkins', unit: 'each', reorderAt: 250 },
        { name: 'Gloves', unit: 'box', reorderAt: 2 },
      ] as {
        name: string
        unit?: string
        onHand?: number
        reorderAt?: number
        unitCost?: number
      }[],
    },
  ],

  // Optional. Volunteers can also be added later from the People page.
  people: [
    // { name: 'Sam Okafor', email: 'sam@example.com', role: 'VOLUNTEER', password: 'temp1234' },
  ] as {
    name: string
    email: string
    role: 'ADMIN' | 'VOLUNTEER' | 'VIEWER'
    password: string
  }[],
}

// ---------------------------------------------------------------------------

const db = new PrismaClient()
const cents = (dollars: number) => Math.round(dollars * 100)

async function confirmWipe() {
  const existing = await db.organization.findMany({ select: { name: true } })

  // Production seeding path: create the club only if the database is untouched,
  // and never delete anything. Safe to leave in a deploy pipeline.
  if (process.argv.includes('--only-if-empty')) {
    if (existing.length > 0) {
      console.log('Database already has a club set up — leaving it alone.')
      process.exit(0)
    }
    return
  }

  if (process.argv.includes('--yes')) return
  if (existing.length === 0) return

  const counts = await Promise.all([db.saleEntry.count(), db.tillCount.count()])
  const [sales, tills] = counts

  console.log(`\nThis will delete ${existing.length} organization(s):`)
  for (const org of existing) console.log(`  - ${org.name}`)

  if (sales > 0 || tills > 0) {
    console.log(
      `\n  WARNING: ${sales} recorded sales and ${tills} till counts will be deleted too.`,
    )
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('\nType "delete" to continue: ')
  rl.close()

  if (answer.trim().toLowerCase() !== 'delete') {
    console.log('Cancelled. Nothing was changed.')
    process.exit(0)
  }
}

async function main() {
  if (CONFIG.admin.email === 'you@example.com') {
    console.error('Edit the CONFIG block in prisma/setup-club.ts first — the admin email is still a placeholder.')
    process.exit(1)
  }

  if (CONFIG.admin.password.length < 8) {
    console.error(
      'Set an admin password of at least 8 characters, for example:\n\n' +
        '  ADMIN_PASSWORD="something-only-you-know" npm run db:bootstrap\n',
    )
    process.exit(1)
  }

  await confirmWipe()

  // Every model cascades from Organization, so this clears the database.
  await db.organization.deleteMany({})

  const org = await db.organization.create({
    data: {
      name: CONFIG.club.name,
      slug: CONFIG.club.slug,
      discrepancyThresholdCents: cents(CONFIG.club.discrepancyThreshold),
    },
  })

  await db.user.create({
    data: {
      organizationId: org.id,
      name: CONFIG.admin.name,
      email: CONFIG.admin.email.toLowerCase(),
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(CONFIG.admin.password, 12),
    },
  })

  for (const person of CONFIG.people) {
    await db.user.create({
      data: {
        organizationId: org.id,
        name: person.name,
        email: person.email.toLowerCase(),
        role: person.role,
        passwordHash: await bcrypt.hash(person.password, 12),
      },
    })
  }

  for (const standConfig of CONFIG.stands) {
    const stand = await db.stand.create({
      data: { organizationId: org.id, name: standConfig.name },
    })

    await db.menuItem.createMany({
      data: standConfig.menu.map((item, index) => ({
        organizationId: org.id,
        standId: stand.id,
        name: item.name,
        priceCents: cents(item.price),
        costCents: cents(item.cost ?? 0),
        sortOrder: index + 1,
      })),
    })

    await db.inventoryItem.createMany({
      data: standConfig.inventory.map((item) => ({
        organizationId: org.id,
        standId: stand.id,
        name: item.name,
        unit: item.unit ?? 'each',
        currentStock: item.onHand ?? 0,
        reorderThreshold: item.reorderAt ?? 0,
        unitCostCents: cents(item.unitCost ?? 0),
      })),
    })
  }

  const menuCount = CONFIG.stands.reduce((n, s) => n + s.menu.length, 0)
  const invCount = CONFIG.stands.reduce((n, s) => n + s.inventory.length, 0)

  console.log(`\n${CONFIG.club.name} is set up.`)
  console.log(`  ${CONFIG.stands.length} stand(s), ${menuCount} menu items, ${invCount} inventory items`)
  console.log(`  ${1 + CONFIG.people.length} account(s)`)
  console.log(`\nSign in at http://localhost:3002 as ${CONFIG.admin.email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
