import { Pool } from "pg";
import * as schema from "./schema";
import { appConfig } from "../config";
import { drizzle } from "drizzle-orm/node-postgres";

export const pool = new Pool({
  connectionString: appConfig.postgres.getDBString(),
  max: 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });
