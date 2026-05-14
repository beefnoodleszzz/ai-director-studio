import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";
import fs from "fs";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env.DATABASE_URL ?? "file:./public/workspace/database.db";
  const dbUrl = rawUrl.startsWith("file:./")
    ? `file:${path.join(process.cwd(), rawUrl.slice(7))}`
    : rawUrl;

  const dir = path.dirname(dbUrl.replace("file:", ""));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const adapter = new PrismaLibSql({ url: dbUrl });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
