import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "apps/web/dist");
const assetDir = resolve(dist, "assets");
const jsFile = resolve(assetDir, "agentops-local.js");

await mkdir(assetDir, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ["apps/web/src/main.tsx"],
  bundle: true,
  format: "iife",
  globalName: "AgentOpsWeb",
  platform: "browser",
  target: ["es2018"],
  outfile: jsFile,
  sourcemap: false,
  minify: false,
  loader: {
    ".ts": "ts",
    ".tsx": "tsx",
    ".css": "css",
    ".svg": "file"
  },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:3000"),
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true"
  }
});

await writeFile(
  resolve(dist, "index.html"),
  `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#070b0d" />
    <meta
      name="description"
      content="AgentOps control plane for governed AI operations, missions, evidence, policy gates and IDE workflows."
    />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icons/agentops.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/assets/agentops-local.css" />
    <title>AgentOps OS</title>
  </head>
  <body>
    <div
      id="agentops-boot-fallback"
      style="min-height:100vh;padding:48px;background:#f3f5f2;color:#18211f;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
    >
      <main style="max-width:1040px;margin:0 auto">
        <strong style="display:block;margin-bottom:28px;font-size:18px">AgentOps</strong>
        <section style="padding:54px 0;border-top:1px solid #d7dfdc">
          <span style="color:#4d6b61;text-transform:uppercase;font-size:12px;letter-spacing:.08em">AI operations control plane</span>
          <h1 style="font-size:64px;line-height:.95;margin:18px 0 20px">AgentOps</h1>
          <p style="max-width:680px;font-size:20px;line-height:1.55;margin:0">
            Local app is loading. If this message stays visible, the browser blocked the application script.
          </p>
        </section>
      </main>
    </div>
    <div id="root"></div>
    <script src="/assets/agentops-local.js"></script>
  </body>
</html>
`
);

console.log(`AgentOps local web bundle written to ${dirname(jsFile)}`);
