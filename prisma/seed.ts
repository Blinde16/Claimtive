import "./load-env";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
import { ingestEdiFile } from "../lib/ingest";

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@claimtive.com";

// No working password literal lives in this repo. A demo deployment supplies
// DEMO_PASSWORD (and sets NEXT_PUBLIC_DEMO_PASSWORD to the same value at build
// time so the login form can pre-fill it); anywhere else we mint a random one
// and print it once, so a stray seed run can never leave a guessable account
// behind.
const DEMO_PASSWORD_FROM_ENV = process.env.DEMO_PASSWORD?.trim();
const DEMO_PASSWORD =
  DEMO_PASSWORD_FROM_ENV || randomBytes(18).toString("base64url");
const DEMO_PASSWORD_WAS_GENERATED = !DEMO_PASSWORD_FROM_ENV;

async function main() {
  console.log("Resetting demo data...");
  // Cascades to users, payers, contracts, edi files, claims, etc.
  await prisma.organization.deleteMany({ where: { slug: "demo-clinic" } });

  console.log("Creating organization and owner...");
  const org = await prisma.organization.create({
    data: {
      name: "Mountain View Surgical",
      slug: "demo-clinic",
      users: {
        create: {
          email: DEMO_EMAIL,
          name: "Demo Admin",
          role: "OWNER",
          passwordHash: await hashPassword(DEMO_PASSWORD)
        }
      }
    },
    include: { users: true }
  });
  const owner = org.users[0];

  console.log("Creating payers and contract rates...");
  const bcbs = await prisma.payer.create({
    data: {
      organizationId: org.id,
      name: "BLUE CROSS BLUE SHIELD",
      externalId: "BCBS001",
      contracts: {
        create: {
          organizationId: org.id,
          name: "BCBS Commercial PPO 2024",
          effectiveDate: new Date("2024-01-01"),
          rates: {
            create: [
              { procedureCode: "99213", allowedAmount: 130 },
              { procedureCode: "99214", allowedAmount: 210 },
              { procedureCode: "20610", allowedAmount: 250 },
              { procedureCode: "29881", allowedAmount: 1100 },
              { procedureCode: "64483", allowedAmount: 800 }
            ]
          }
        }
      }
    }
  });

  const aetna = await prisma.payer.create({
    data: {
      organizationId: org.id,
      name: "AETNA",
      externalId: "AETNA001",
      contracts: {
        create: {
          organizationId: org.id,
          name: "Aetna Choice POS 2024",
          effectiveDate: new Date("2024-01-01"),
          rates: {
            create: [
              { procedureCode: "45378", allowedAmount: 700 },
              { procedureCode: "64721", allowedAmount: 650 },
              { procedureCode: "99203", allowedAmount: 175 }
            ]
          }
        }
      }
    }
  });
  console.log(`  payers: ${bcbs.name}, ${aetna.name}`);

  console.log("Ingesting sample EDI files...");
  const sampleDir = join(process.cwd(), "sample-data");
  const files = [
    "sample-835-bcbs.edi",
    "sample-835-aetna.edi",
    "sample-837p.edi"
  ];
  for (const fileName of files) {
    const content = readFileSync(join(sampleDir, fileName), "utf8");
    const result = await ingestEdiFile({
      organizationId: org.id,
      uploadedById: owner.id,
      fileName,
      content
    });
    console.log(
      `  ${fileName}: ${result.type}, ${result.claimCount} claims, ` +
        `denied $${result.totalDenied}, underpaid $${result.totalUnderpaid}`
    );
  }

  console.log("\nSeed complete.");
  if (DEMO_PASSWORD_WAS_GENERATED) {
    console.log(
      `Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n` +
        "  ^ randomly generated because DEMO_PASSWORD was not set. Copy it now — " +
        "it is not stored anywhere, and re-seeding mints a new one."
    );
  } else {
    console.log(`Login: ${DEMO_EMAIL} / (the DEMO_PASSWORD you supplied)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
