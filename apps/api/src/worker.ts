import { sql } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { runPendingJobs } from "./services/jobRunner.js";

const limit = Number(process.env.AGENTOPS_WORKER_LIMIT ?? 1);

try {
  await migrate();
  const jobs = await runPendingJobs(limit);
  console.log(JSON.stringify({ processed: jobs.length, jobs }, null, 2));
} finally {
  await sql.end();
}
