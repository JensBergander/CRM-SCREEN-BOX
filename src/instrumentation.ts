// Bringt die Datenbank beim Serverstart auf den Stand der Migrationen in ./drizzle.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DB_NAME) return;

  const path = await import("node:path");
  const mysql = (await import("mysql2/promise")).default;
  const { drizzle } = await import("drizzle-orm/mysql2");
  const { migrate } = await import("drizzle-orm/mysql2/migrator");

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  try {
    await migrate(drizzle(connection), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  } finally {
    await connection.end();
  }
}
