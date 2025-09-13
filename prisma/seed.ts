import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.role.createMany({
    data: [{ name: "ADMIN" }, { name: "VIEWER" }],
    skipDuplicates: true, // avoid duplicate insert
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
