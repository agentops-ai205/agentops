export interface DesktopRuntime {
  platform: string;
  apiUrl: string;
  product: string;
  workspaceRoot: string;
  fileAccess: string;
  terminalAccess: string;
}

export interface DesktopEntry {
  name: string;
  path: string;
  type: "directory" | "file";
  bytes: number;
}

export interface DesktopFileList {
  path: string;
  entries: DesktopEntry[];
}

export interface DesktopFile {
  path: string;
  bytes: number;
  language: string;
  content: string;
}

export interface DesktopWriteResult {
  path: string;
  bytes: number;
  saved: boolean;
}

export interface DesktopCommandResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}

interface TauriInternals {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

type RawRuntime = Omit<DesktopRuntime, "apiUrl" | "workspaceRoot" | "fileAccess" | "terminalAccess"> & {
  api_url: string;
  workspace_root: string;
  file_access: string;
  terminal_access: string;
};

type RawCommandResult = Omit<DesktopCommandResult, "exitCode" | "durationMs"> & {
  exit_code: number | null;
  duration_ms: number;
};

export function hasDesktopRuntime() {
  return Boolean(getTauriInternals());
}

export async function getDesktopRuntime() {
  const raw = await invokeDesktop<RawRuntime>("desktop_runtime");
  return {
    platform: raw.platform,
    apiUrl: raw.api_url,
    product: raw.product,
    workspaceRoot: raw.workspace_root,
    fileAccess: raw.file_access,
    terminalAccess: raw.terminal_access
  };
}

export function listDesktopFiles(path: string) {
  return invokeDesktop<DesktopFileList>("desktop_list_files", { path });
}

export function readDesktopFile(path: string) {
  return invokeDesktop<DesktopFile>("desktop_read_file", { path });
}

export function writeDesktopFile(path: string, content: string) {
  return invokeDesktop<DesktopWriteResult>("desktop_write_file", { path, content });
}

export async function runDesktopCommand(command: string, cwd = "") {
  return normalizeCommandResult(
    await invokeDesktop<RawCommandResult>("desktop_run_command", {
      command,
      cwd
    })
  );
}

export async function applyDesktopPatch(unifiedDiff: string) {
  return normalizeCommandResult(
    await invokeDesktop<RawCommandResult>("desktop_apply_patch", {
      unifiedDiff
    })
  );
}

function normalizeCommandResult(raw: RawCommandResult): DesktopCommandResult {
  return {
    command: raw.command,
    cwd: raw.cwd,
    exitCode: raw.exit_code,
    stdout: raw.stdout,
    stderr: raw.stderr,
    durationMs: raw.duration_ms,
    truncated: raw.truncated
  };
}

async function invokeDesktop<T>(cmd: string, args?: Record<string, unknown>) {
  const tauri = getTauriInternals();
  if (!tauri) throw new Error("AgentOps Desktop runtime is not available in this browser.");
  return tauri.invoke<T>(cmd, args);
}

function getTauriInternals() {
  const candidate = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  return typeof candidate?.invoke === "function" ? candidate : null;
}
