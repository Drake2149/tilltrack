import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('password123', 12)

  const org = await db.organization.upsert({
    where: { slug: 'big-horn-boosters' },
    update: {},
    create: {
      name: 'Big Horn Booster Club',
      slug: 'big-horn-boosters',
      discrepancyThresholdCents: 1000,
    },
  })

  const [admin, volunteer, viewer] = await Promise.all([
    db.user.upsert({
      where: { email: 'treasurer@bighorn.test' },
      update: {},
      create: {
        organizationId: org.id,
        email: 'treasurer@bighorn.test',
        passwordHash,
        name: 'Dana Reyes',
        role: 'ADMIN',
      },
    }),
    db.user.upsert({
      where: { email: 'volunteer@bighorn.test' },
      update: {},
      create: {
        organizationId: org.id,
        email: 'volunteer@bighorn.test',
        passwordHash,
        name: 'Sam Okafor',
        role: 'VOLUNTEER',
      },
    }),
    db.user.upsert({
      where: { email: 'ad@bighorn.test' },
      update: {},
      create: {
        organizationId: org.id,
        email: 'ad@bighorn.test',
        passwordHash,
        name: 'Jordan Blake',
        role: 'VIEWER',
      },
    }),
  ])

  const existingStand = await db.stand.findFirst({
    where: { organizationId: org.id, name: 'Football Concession' },
  })

  const stand =
    existingStand ??
    (await db.stand.create({
      data: { organizationId: org.id, name: 'Football Concession' },
    }))

  const menuSeed = [
    { name: 'Hot Dog', priceCents: 300, costCents: 90, sortOrder: 1 },
    { name: 'Nachos', priceCents: 400, costCents: 130, sortOrder: 2 },
    { name: 'Popcorn', priceCents: 200, costCents: 45, sortOrder: 3 },
    { name: 'Candy', priceCents: 150, costCents: 60, sortOrder: 4 },
    { name: 'Soda', priceCents: 200, costCents: 55, sortOrder: 5 },
    { name: 'Water', priceCents: 100, costCents: 25, sortOrder: 6 },
    { name: 'Coffee', priceCents: 150, costCents: 30, sortOrder: 7 },
    { name: 'Hot Chocolate', priceCents: 150, costCents: 35, sortOrder: 8 },
  ]

  for (const item of menuSeed) {
    const existing = await db.menuItem.findFirst({
      where: { standId: stand.id, name: item.name },
    })
    if (!existing) {
      await db.menuItem.create({ data: { ...item, organizationId: org.id, standId: stand.id } })
    }
  }

  const inventorySeed = [
    { name: 'Hot dog buns', unit: 'pack', currentStock: 12, reorderThreshold: 4, unitCostCents: 250 },
    { name: 'Hot dogs', unit: 'pack', currentStock: 10, reorderThreshold: 4, unitCostCents: 600 },
    { name: 'Nacho cheese', unit: 'bag', currentStock: 3, reorderThreshold: 3, unitCostCents: 900 },
    { name: 'Tortilla chips', unit: 'bag', currentStock: 8, reorderThreshold: 3, unitCostCents: 400 },
    { name: 'Popcorn kernels', unit: 'lb', currentStock: 6, reorderThreshold: 2, unitCostCents: 300 },
    { name: 'Soda cases', unit: 'case', currentStock: 2, reorderThreshold: 3, unitCostCents: 1200 },
    { name: 'Water cases', unit: 'case', currentStock: 5, reorderThreshold: 2, unitCostCents: 800 },
  ]

  for (const item of inventorySeed) {
    const existing = await db.inventoryItem.findFirst({
      where: { standId: stand.id, name: item.name },
    })
    if (!existing) {
      await db.inventoryItem.create({
        data: { ...item, organizationId: org.id, standId: stand.id },
      })
    }
  }

  // One upcoming event with a scheduled shift, so Shift Mode has something to open.
  const upcomingName = 'Homecoming vs. Riverton'
  const existingEvent = await db.event.findFirst({
    where: { organizationId: org.id, name: upcomingName },
  })

  if (!existingEvent) {
    const startsAt = new Date()
    startsAt.setHours(startsAt.getHours() + 2, 0, 0, 0)
    const endsAt = new Date(startsAt)
    endsAt.setHours(endsAt.getHours() + 4)

    const event = await db.event.create({
      data: { organizationId: org.id, name: upcomingName, startsAt },
    })

    const shift = await db.shift.create({
      data: {
        organizationId: org.id,
        standId: stand.id,
        eventId: event.id,
        name: 'Main shift',
        startsAt,
        endsAt,
      },
    })

    await db.shiftAssignment.createMany({
      data: [
        { organizationId: org.id, shiftId: shift.id, userId: volunteer.id },
        { organizationId: org.id, shiftId: shift.id, userId: admin.id },
      ],
      skipDuplicates: true,
    })
  }

  console.log('Seeded:')
  console.log(`  org        ${org.name}`)
  console.log(`  admin      ${admin.email} / password123`)
  console.log(`  volunteer  ${volunteer.email} / password123`)
  console.log(`  viewer     ${viewer.email} / password123`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
