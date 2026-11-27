import { defineConfig } from "drizzle-kit";

// Only drizzle-kit, the migrations CLI, reads this config. The app itself does not
// import it: the database connection lives in src/server/db/client.ts.
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set: copy .env.example to .env and fill it in",
  );
}

export default defineConfig({
  dialect: "postgresql",
  // One schema and one set of migrations for the local database and Neon.
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  // Migrations are applied only from the files in ./drizzle, so schema changes go
  // through review like code. We do not use `drizzle-kit push`.
  strict: true,
  verbose: true,
});
