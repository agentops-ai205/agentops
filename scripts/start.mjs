const args = process.argv.slice(2);

if (args[0] === "api-local") {
  await import("./start-api-local.mjs");
} else {
  process.argv = [process.argv[0] ?? "node", new URL("dev.mjs", import.meta.url).pathname, "start"];
  await import("./dev.mjs");
}
