import { buildApp, bootstrapApplication } from "./app.js";
import { config } from "./config.js";
import { sql } from "./db/client.js";

const app = await buildApp();

try {
  await bootstrapApplication();
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await sql.end();
  process.exit(1);
}
