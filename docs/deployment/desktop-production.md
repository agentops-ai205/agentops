# Desktop Production Runbook

AgentOps Desktop is the native IDE surface for macOS and Windows. The web app remains the cloud cockpit; the desktop app owns local project work: files, terminal, patch review, agent runs, evidence and audit capture.

## Architecture

- UI: shared React cockpit from `apps/web`.
- Shell: Tauri v2 in `apps/desktop/src-tauri`.
- Local runtime: guarded Tauri commands for project files, saves, allowlisted terminal runs and patch apply.
- Local API: `@agentops/api` on `127.0.0.1:3000` for missions, evidence, audit, policy and cloud sync.
- Cloud state: Supabase/PostgreSQL through the production API.
- Web distribution: Netlify for `agentops.ai`.
- Desktop distribution: signed macOS and Windows installers from CI release artifacts.

## Build Targets

- macOS: Apple Silicon and Intel where CI runners are available.
- Windows: x64 first, ARM64 later if usage justifies it.

## GitHub Workflow

`.github/workflows/desktop.yml` builds macOS and Windows bundles on production branch changes, pull requests, manual dispatch and `v*` tags. Tag builds attach bundles to a draft GitHub Release so signing and notarization can be verified before public publication.

## Required Release Gates

Run before desktop release:

```bash
npm install
npm run build
npm test
npm audit
npm run preflight:prod -- --env deploy/production.env.example --allow-placeholders
npm run desktop:check
npm run desktop:build
```

`desktop:check` and `desktop:build` require access to crates.io and the native Tauri toolchain. In restricted/offline environments these steps stop at dependency resolution.

## Signing And Updates

- macOS requires Apple Developer ID signing and notarization before public distribution.
- Windows requires Authenticode signing before broad release.
- Auto-update should be served from signed GitHub Releases or a controlled release endpoint.
- Desktop update metadata must be generated only after all web/API tests and desktop builds pass.

## Security Boundary

The Tauri shell owns local IDE operations but keeps them project-scoped and explicit:

- Workspace root is discovered from the AgentOps repo or pinned with `AGENTOPS_DESKTOP_WORKSPACE`.
- Filesystem access rejects absolute paths and path traversal.
- The editor blocks large files and non-UTF-8 content.
- Terminal execution uses direct process spawning without a shell.
- Only allowlisted commands can run from the IDE terminal.
- Patch application performs `git apply --check --whitespace=nowarn` before mutating files.
- Runtime secrets such as `DATABASE_URL`, `AGENTOPS_OPERATOR_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` are stripped from child command environments.

Hidden local paths include `node_modules`, `target`, `dist` and `.DS_Store`.
