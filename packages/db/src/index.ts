import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { schema };

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!database) {
    client = postgres(databaseUrl);
    database = drizzle(client, { schema });
  }
  return database;
}

export type Db = ReturnType<typeof getDb>;
