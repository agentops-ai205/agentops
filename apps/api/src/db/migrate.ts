import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { sql } from "./client.js";

export async function migrate() {
  const migrationDir = path.join(config.projectRoot, "apps/api/migrations");
  const files = (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const migration = await readFile(path.join(migrationDir, file), "utf8");
    await sql.unsafe(migration);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrate();
  await sql.end();
  console.log("AgentOps migrations applied");
}
