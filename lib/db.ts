import { PrismaClient } from "@prisma/client";

// Connection strategy:
// - Production (Firebase App Hosting / Cloud Run): connect to Cloud SQL through
//   the Cloud SQL Node.js connector (IAM + mTLS, no public network exposure).
//   Triggered when INSTANCE_CONNECTION_NAME is set. This keeps the connection
//   logic in app code so it survives every App Hosting rollout.
// - Local dev / Cloud SQL Auth Proxy / migrations + seed: fall back to a plain
//   DATABASE_URL connection.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

async function createClient(): Promise<PrismaClient> {
  const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;

  if (instanceConnectionName) {
    const { Connector, IpAddressTypes } = await import(
      "@google-cloud/cloud-sql-connector"
    );
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { default: pg } = await import("pg");

    const connector = new Connector();
    const clientOpts = await connector.getOptions({
      instanceConnectionName,
      ipType: IpAddressTypes.PUBLIC
    });

    const pool = new pg.Pool({
      ...clientOpts,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 5
    });

    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter, log: ["error"] });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
}

export const prisma = globalForPrisma.prisma ?? (await createClient());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
