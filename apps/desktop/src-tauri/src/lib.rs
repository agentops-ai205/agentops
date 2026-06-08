use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    time::Instant,
};

const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_WRITE_BYTES: usize = 1024 * 1024;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;

#[derive(Serialize)]
struct DesktopRuntime {
    platform: String,
    api_url: String,
    product: String,
    workspace_root: String,
    file_access: String,
    terminal_access: String,
}

#[derive(Serialize)]
struct DesktopEntry {
    name: String,
    path: String,
    r#type: String,
    bytes: u64,
}

#[derive(Serialize)]
struct DesktopFileList {
    path: String,
    entries: Vec<DesktopEntry>,
}

#[derive(Serialize)]
struct DesktopFile {
    path: String,
    bytes: u64,
    language: String,
    content: String,
}

#[derive(Serialize)]
struct DesktopWriteResult {
    path: String,
    bytes: usize,
    saved: bool,
}

#[derive(Serialize)]
struct DesktopCommandResult {
    command: String,
    cwd: String,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    duration_ms: u128,
    truncated: bool,
}

#[tauri::command]
fn desktop_runtime() -> Result<DesktopRuntime, String> {
    let workspace_root = workspace_root()?;
    Ok(DesktopRuntime {
        platform: std::env::consts::OS.to_string(),
        api_url: "http://127.0.0.1:3000".to_string(),
        product: "AgentOps Desktop IDE".to_string(),
        workspace_root: workspace_root.to_string_lossy().to_string(),
        file_access: "project_scoped".to_string(),
        terminal_access: "allowlisted_no_shell".to_string(),
    })
}

#[tauri::command]
fn desktop_list_files(path: Option<String>) -> Result<DesktopFileList, String> {
    let root = workspace_root()?;
    let directory = resolve_path(&root, path.as_deref().unwrap_or(""))?;
    if !directory.is_dir() {
        return Err("Path is not a directory.".to_string());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if should_hide_entry(&name) {
            continue;
        }
        let absolute = entry.path();
        let relative = relative_path(&root, &absolute)?;
        entries.push(DesktopEntry {
            name,
            path: relative,
            r#type: if metadata.is_dir() {
                "directory"
            } else {
                "file"
            }
            .to_string(),
            bytes: metadata.len(),
        });
    }

    entries.sort_by(|left, right| {
        left.r#type
            .cmp(&right.r#type)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    entries.truncate(240);

    Ok(DesktopFileList {
        path: relative_path(&root, &directory)?,
        entries,
    })
}

#[tauri::command]
fn desktop_read_file(path: String) -> Result<DesktopFile, String> {
    let root = workspace_root()?;
    let file_path = resolve_path(&root, &path)?;
    if !file_path.is_file() {
        return Err("Path is not a file.".to_string());
    }

    let metadata = fs::metadata(&file_path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err("File is too large for the desktop editor.".to_string());
    }

    let content =
        fs::read_to_string(&file_path).map_err(|_| "File is not valid UTF-8.".to_string())?;
    Ok(DesktopFile {
        path: relative_path(&root, &file_path)?,
        bytes: metadata.len(),
        language: language_for(&file_path),
        content,
    })
}

#[tauri::command]
fn desktop_write_file(path: String, content: String) -> Result<DesktopWriteResult, String> {
    if content.len() > MAX_WRITE_BYTES {
        return Err("File content is too large for guarded desktop save.".to_string());
    }

    let root = workspace_root()?;
    let relative = validate_relative_path(&path)?;
    let target = root.join(&relative);
    if let Some(parent) = target.parent() {
        let parent = parent.canonicalize().map_err(|error| error.to_string())?;
        ensure_inside_root(&root, &parent)?;
    }
    fs::write(&target, content.as_bytes()).map_err(|error| error.to_string())?;

    Ok(DesktopWriteResult {
        path: relative_path(&root, &target)?,
        bytes: content.len(),
        saved: true,
    })
}

#[tauri::command]
fn desktop_run_command(
    command: String,
    cwd: Option<String>,
) -> Result<DesktopCommandResult, String> {
    let root = workspace_root()?;
    let cwd_path = resolve_path(&root, cwd.as_deref().unwrap_or(""))?;
    if !cwd_path.is_dir() {
        return Err("Command cwd is not a directory.".to_string());
    }
    let args = parse_command(&command)?;
    ensure_command_allowed(&args)?;
    run_process(&root, &cwd_path, &command, &args, None)
}

#[tauri::command]
fn desktop_apply_patch(unified_diff: String) -> Result<DesktopCommandResult, String> {
    if unified_diff.trim().is_empty() {
        return Err("Patch diff is empty.".to_string());
    }
    if unified_diff.len() > MAX_WRITE_BYTES {
        return Err("Patch diff is too large for guarded desktop apply.".to_string());
    }

    let root = workspace_root()?;
    let check = run_process(
        &root,
        &root,
        "git apply --check --whitespace=nowarn",
        &[
            "git".to_string(),
            "apply".to_string(),
            "--check".to_string(),
            "--whitespace=nowarn".to_string(),
        ],
        Some(unified_diff.as_bytes()),
    )?;
    if check.exit_code != Some(0) {
        return Ok(check);
    }

    run_process(
        &root,
        &root,
        "git apply --whitespace=nowarn",
        &[
            "git".to_string(),
            "apply".to_string(),
            "--whitespace=nowarn".to_string(),
        ],
        Some(unified_diff.as_bytes()),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desktop_runtime,
            desktop_list_files,
            desktop_read_file,
            desktop_write_file,
            desktop_run_command,
            desktop_apply_patch
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AgentOps desktop shell");
}

fn workspace_root() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("AGENTOPS_DESKTOP_WORKSPACE") {
        return canonical_workspace(PathBuf::from(path));
    }

    let mut current = std::env::current_dir().map_err(|error| error.to_string())?;
    loop {
        if current.join("package.json").is_file() && current.join("apps").is_dir() {
            return canonical_workspace(current);
        }
        if !current.pop() {
            break;
        }
    }

    Err("Unable to locate AgentOps workspace root.".to_string())
}

fn canonical_workspace(path: PathBuf) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    if !canonical.join("package.json").is_file() {
        return Err("Workspace root must contain package.json.".to_string());
    }
    Ok(canonical)
}

fn validate_relative_path(input: &str) -> Result<PathBuf, String> {
    let path = Path::new(input);
    if input.trim().is_empty() {
        return Ok(PathBuf::new());
    }
    if path.is_absolute() {
        return Err("Absolute paths are not allowed.".to_string());
    }
    for component in path.components() {
        if matches!(
            component,
            Component::ParentDir | Component::Prefix(_) | Component::RootDir
        ) {
            return Err("Path traversal is not allowed.".to_string());
        }
    }
    Ok(path.to_path_buf())
}

fn resolve_path(root: &Path, input: &str) -> Result<PathBuf, String> {
    let relative = validate_relative_path(input)?;
    let joined = root.join(relative);
    let canonical = joined.canonicalize().map_err(|error| error.to_string())?;
    ensure_inside_root(root, &canonical)?;
    Ok(canonical)
}

fn ensure_inside_root(root: &Path, path: &Path) -> Result<(), String> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err("Path is outside the AgentOps workspace.".to_string())
    }
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    ensure_inside_root(root, &canonical)?;
    let relative = canonical
        .strip_prefix(root)
        .map_err(|error| error.to_string())?;
    Ok(relative
        .to_string_lossy()
        .trim_start_matches('/')
        .to_string())
}

fn should_hide_entry(name: &str) -> bool {
    matches!(name, "node_modules" | "target" | "dist" | ".DS_Store")
}

fn language_for(path: &Path) -> String {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
    {
        "css" => "css",
        "html" => "html",
        "json" => "json",
        "md" => "markdown",
        "rs" => "rust",
        "toml" => "toml",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" => "javascript",
        "yml" | "yaml" => "yaml",
        _ => "text",
    }
    .to_string()
}

fn parse_command(command: &str) -> Result<Vec<String>, String> {
    let parts = command
        .split_whitespace()
        .map(|part| part.trim().to_string())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return Err("Command is empty.".to_string());
    }
    if parts.iter().any(|part| {
        part.contains(';')
            || part.contains('&')
            || part.contains('|')
            || part.contains('>')
            || part.contains('<')
            || part.contains('`')
            || part.contains("$(")
    }) {
        return Err("Shell operators are not allowed in desktop terminal commands.".to_string());
    }
    Ok(parts)
}

fn ensure_command_allowed(parts: &[String]) -> Result<(), String> {
    let command = parts.join(" ");
    let allowed_exact = [
        "npm test",
        "npm run build",
        "npm run desktop:check",
        "npm run desktop:build",
        "cargo build",
        "cargo test",
        "git status",
        "git status --short",
        "git diff",
        "git diff --stat",
    ];
    if allowed_exact.iter().any(|allowed| *allowed == command) {
        return Ok(());
    }
    Err(format!(
        "Command is not allowlisted for AgentOps Desktop IDE: {command}"
    ))
}

fn run_process(
    root: &Path,
    cwd: &Path,
    display_command: &str,
    parts: &[String],
    stdin: Option<&[u8]>,
) -> Result<DesktopCommandResult, String> {
    let started = Instant::now();
    let mut command = Command::new(&parts[0]);
    command
        .args(&parts[1..])
        .current_dir(cwd)
        .env_remove("DATABASE_URL")
        .env_remove("AGENTOPS_OPERATOR_TOKEN")
        .env_remove("SUPABASE_SERVICE_ROLE_KEY")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if stdin.is_some() {
        command.stdin(Stdio::piped());
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    if let Some(input) = stdin {
        let mut child_stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to open command stdin.".to_string())?;
        child_stdin
            .write_all(input)
            .map_err(|error| error.to_string())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    let stdout_raw = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_raw = String::from_utf8_lossy(&output.stderr).to_string();
    let stdout = limit_output(stdout_raw);
    let stderr = limit_output(stderr_raw);
    let cwd_relative = relative_path(root, cwd)?;

    Ok(DesktopCommandResult {
        command: display_command.to_string(),
        cwd: cwd_relative,
        exit_code: output.status.code(),
        truncated: stdout.truncated || stderr.truncated,
        stdout: stdout.value,
        stderr: stderr.value,
        duration_ms: started.elapsed().as_millis(),
    })
}

struct LimitedOutput {
    value: String,
    truncated: bool,
}

fn limit_output(value: String) -> LimitedOutput {
    if value.len() <= MAX_OUTPUT_BYTES {
        return LimitedOutput {
            value,
            truncated: false,
        };
    }
    LimitedOutput {
        value: value.chars().take(MAX_OUTPUT_BYTES).collect(),
        truncated: true,
    }
}
