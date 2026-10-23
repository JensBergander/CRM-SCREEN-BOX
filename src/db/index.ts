import "server-only";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: 5,
    timezone: "Z",
    dateStrings: ["DATE"],
  });
}

// Im Entwicklungsmodus überlebt der Pool so das Neuladen von Modulen.
const globalForDb = globalThis as unknown as { crmPool?: mysql.Pool };
const pool = globalForDb.crmPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.crmPool = pool;

export const db = drizzle(pool, { schema, mode: "default" });
