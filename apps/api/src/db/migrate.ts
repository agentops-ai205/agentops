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

async function runCli() {
  await migrate();
  await sql.end();
  console.log("AgentOps migrations applied");
}

if (isCliEntrypoint("migrate.js")) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function isCliEntrypoint(fileName: string) {
  return Boolean(process.argv[1]?.replaceAll("\\", "/").endsWith(`/db/${fileName}`));
}
