use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    process::{Command, Stdio},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyDecision {
    Allow,
    Deny,
    RequireApproval,
    RequireSandbox,
    RequireReview,
    RequireMoreContext,
}

impl PolicyDecision {
    pub fn as_str(&self) -> &'static str {
        match self {
            PolicyDecision::Allow => "allow",
            PolicyDecision::Deny => "deny",
            PolicyDecision::RequireApproval => "require_approval",
            PolicyDecision::RequireSandbox => "require_sandbox",
            PolicyDecision::RequireReview => "require_review",
            PolicyDecision::RequireMoreContext => "require_more_context",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Action {
    pub action_type: String,
    pub path: Option<String>,
    pub command: Option<String>,
    pub agent_role: Option<String>,
    pub autonomy_level: u8,
    pub risk_level: String,
}

impl Action {
    pub fn new(action_type: impl Into<String>) -> Self {
        Self {
            action_type: action_type.into(),
            path: None,
            command: None,
            agent_role: None,
            autonomy_level: 2,
            risk_level: "medium".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PolicyResult {
    pub decision: PolicyDecision,
    pub reason: String,
    pub matched_rule: String,
    pub approver_role: Option<String>,
    pub engine: String,
    pub kernel_version: String,
}

pub fn evaluate(action: &Action) -> PolicyResult {
    let target_path = action
        .path
        .as_deref()
        .map(normalize_path)
        .unwrap_or_default();

    if !target_path.is_empty()
        && matches_any(
            &target_path,
            &[".env", ".env.*", "secrets/**", "infra/prod/**"],
        )
    {
        return result(
            PolicyDecision::Deny,
            "Agents cannot read or write raw secrets, production infra, or env files.",
            "deny_secrets_and_prod_paths",
            None,
        );
    }

    if let Some(command) = &action.command {
        let command = normalize_command(command);
        if is_destructive_command(&command) {
            return result(
                PolicyDecision::Deny,
                "Destructive or exfiltration-prone command blocked by command policy.",
                "deny_destructive_commands",
                None,
            );
        }

        let allowlisted = [
            "npm run test",
            "npm run build",
            "npm run typecheck",
            "cargo test",
            "cargo build",
        ];
        if !allowlisted.contains(&command.as_str()) {
            return result(
                PolicyDecision::RequireSandbox,
                "Command is not in the workflow allowlist and must run in a stricter sandbox.",
                "require_sandbox_for_unlisted_command",
                None,
            );
        }
    }

    if !target_path.is_empty() {
        if matches_any(
            &target_path,
            &["auth/**", "middleware/auth*", "src/auth/**"],
        ) {
            return result(
                PolicyDecision::RequireApproval,
                "Authentication changes require security owner and technical owner review.",
                "require_approval_for_auth_changes",
                Some("security_owner"),
            );
        }

        if matches_any(
            &target_path,
            &["database/**", "db/**", "migrations/**", "**/migrations/**"],
        ) || action.action_type == "database_schema_change"
        {
            return result(
                PolicyDecision::RequireApproval,
                "Database changes require explicit technical and data owner approval.",
                "require_approval_for_database_changes",
                Some("technical_owner"),
            );
        }

        if matches_any(
            &target_path,
            &[
                ".agentops/policies/**",
                ".agentops/agents/**",
                ".agentops/agentops.yml",
            ],
        ) && action.agent_role.as_deref() == Some("metadev")
        {
            return result(
                PolicyDecision::RequireApproval,
                "MetaDev may propose governance changes but cannot apply them without human approval.",
                "require_approval_for_agentops_governance_changes",
                Some("governance_owner"),
            );
        }
    }

    if action.action_type == "self_improvement_apply"
        || action.action_type == "production_deploy"
        || action.autonomy_level >= 6
    {
        return result(
            PolicyDecision::RequireApproval,
            "High autonomy, production, and self-improvement application require human approval.",
            "require_approval_for_high_autonomy",
            Some("governance_owner"),
        );
    }

    if action.risk_level == "critical" {
        return result(
            PolicyDecision::RequireReview,
            "Critical risk actions may proceed only with explicit review evidence.",
            "require_review_for_critical_risk",
            None,
        );
    }

    result(
        PolicyDecision::Allow,
        "Action is inside declared AgentOps v1 permissions.",
        "allow_scoped_action",
        None,
    )
}

pub fn evidence_hash(input: &str) -> String {
    format!("sha256:{}", to_hex(&sha256(input.as_bytes())))
}

pub fn hash_json(input: &str) -> Result<String, String> {
    let mut parser = JsonParser::new(input);
    let value = parser.parse()?;
    parser.finish()?;
    Ok(evidence_hash(&stable_json(&value)))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SandboxCommandSpec {
    pub display: String,
    pub executable: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct SandboxRunConfig {
    pub command: String,
    pub project_root: String,
    pub sandbox_root: String,
    pub mission_id: Option<String>,
    pub timeout_ms: u64,
    pub output_limit_bytes: usize,
    pub env: Vec<(String, String)>,
}

#[derive(Debug, Clone)]
pub struct SandboxInfo {
    pub shell: bool,
    pub execution_cwd: String,
    pub workspace_root: Option<String>,
    pub artifacts_dir: Option<String>,
    pub manifest_path: Option<String>,
    pub manifest_hash: Option<String>,
    pub env: String,
    pub network: String,
    pub output_limit_bytes: usize,
    pub timeout_ms: u64,
    pub isolation: String,
    pub engine: String,
    pub kernel_version: String,
}

#[derive(Debug, Clone)]
pub struct SandboxRunResult {
    pub command: String,
    pub exit_code: Option<i32>,
    pub signal: Option<String>,
    pub output: String,
    pub timed_out: bool,
    pub sandbox: SandboxInfo,
}

#[derive(Debug, Clone)]
pub struct SandboxWorkspace {
    pub root: String,
    pub artifacts_dir: String,
    pub manifests_dir: String,
}

pub fn resolve_sandbox_command(command: &str) -> Result<SandboxCommandSpec, String> {
    let normalized = normalize_command(command);
    let spec = match normalized.as_str() {
        "npm run test" => ("npm run test", "npm", vec!["run", "test"]),
        "npm run build" => ("npm run build", "npm", vec!["run", "build"]),
        "npm run typecheck" => ("npm run typecheck", "npm", vec!["run", "typecheck"]),
        "cargo test" => ("cargo test", "cargo", vec!["test"]),
        "cargo build" => ("cargo build", "cargo", vec!["build"]),
        _ => {
            return Err(format!(
                "Command is not allowlisted for AgentOps sandbox executor: {normalized}"
            ))
        }
    };

    Ok(SandboxCommandSpec {
        display: spec.0.to_string(),
        executable: spec.1.to_string(),
        args: spec.2.into_iter().map(str::to_string).collect(),
    })
}

pub fn build_sandbox_env_from(source: &[(String, String)]) -> Vec<(String, String)> {
    let allowed = [
        "PATH",
        "HOME",
        "TMPDIR",
        "TMP",
        "TEMP",
        "NODE_ENV",
        "CI",
        "CARGO_HOME",
        "RUSTUP_HOME",
    ];
    let mut env = Vec::new();
    for key in allowed {
        if let Some((_, value)) = source.iter().find(|(source_key, _)| source_key == key) {
            if !looks_secret_key(key) {
                env.push((key.to_string(), value.clone()));
            }
        }
    }
    env.retain(|(key, _)| !looks_secret_key(key));
    env.push(("FORCE_COLOR".to_string(), "0".to_string()));
    if !env.iter().any(|(key, _)| key == "CI") {
        env.push(("CI".to_string(), "true".to_string()));
    }
    env
}

pub fn limit_output(input: &str, max_bytes: usize) -> String {
    if input.len() <= max_bytes {
        return input.to_string();
    }

    let mut output = input.to_string();
    while output.len() > max_bytes {
        let cut = (output.len() / 10).max(1);
        while !output.is_char_boundary(cut) {
            output.remove(0);
        }
        output = output[cut..].to_string();
    }
    output
}

pub fn sandbox_workspace(sandbox_root: &str, mission_id: &str) -> SandboxWorkspace {
    let root = join_path(sandbox_root, &safe_path_segment(mission_id));
    SandboxWorkspace {
        artifacts_dir: join_path(&root, "artifacts"),
        manifests_dir: join_path(&root, "manifests"),
        root,
    }
}

pub fn safe_path_segment(input: &str) -> String {
    let segment: String = input
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
        .take(120)
        .collect();
    if segment.is_empty() {
        "unknown".to_string()
    } else {
        segment
    }
}

pub fn run_sandbox_command(config: SandboxRunConfig) -> Result<SandboxRunResult, String> {
    let spec = resolve_sandbox_command(&config.command)?;
    let started_at = current_millis();
    let mut child = Command::new(&spec.executable)
        .args(&spec.args)
        .current_dir(&config.project_root)
        .env_clear()
        .envs(build_sandbox_env_from(&config.env))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or("failed to capture sandbox stdout")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("failed to capture sandbox stderr")?;

    let stdout_reader = thread::spawn(move || read_pipe(stdout));
    let stderr_reader = thread::spawn(move || read_pipe(stderr));
    let deadline = if config.timeout_ms > 0 {
        Some(SystemTime::now() + Duration::from_millis(config.timeout_ms))
    } else {
        None
    };

    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            break status;
        }

        if let Some(deadline) = deadline {
            if SystemTime::now() >= deadline {
                timed_out = true;
                let _ = child.kill();
                break child.wait().map_err(|error| error.to_string())?;
            }
        }

        thread::sleep(Duration::from_millis(25));
    };

    let mut output = stdout_reader
        .join()
        .map_err(|_| "failed to join stdout reader".to_string())?;
    output.push_str(
        &stderr_reader
            .join()
            .map_err(|_| "failed to join stderr reader".to_string())?,
    );
    output = limit_output(&output, config.output_limit_bytes);

    let finished_at = current_millis();
    let mut sandbox = SandboxInfo {
        shell: false,
        execution_cwd: config.project_root.clone(),
        workspace_root: None,
        artifacts_dir: None,
        manifest_path: None,
        manifest_hash: None,
        env: "filtered".to_string(),
        network: "not_enforced".to_string(),
        output_limit_bytes: config.output_limit_bytes,
        timeout_ms: config.timeout_ms,
        isolation: "rust_process_no_shell_workspace_artifacts".to_string(),
        engine: "rust_core".to_string(),
        kernel_version: env!("CARGO_PKG_VERSION").to_string(),
    };

    if let Some(mission_id) = config.mission_id.as_deref() {
        let manifest = write_sandbox_manifest(
            mission_id,
            &config.sandbox_root,
            &spec.display,
            status.code(),
            exit_signal(&status),
            timed_out,
            started_at,
            finished_at,
            &sandbox,
        )?;
        sandbox.workspace_root = Some(manifest.workspace.root);
        sandbox.artifacts_dir = Some(manifest.workspace.artifacts_dir);
        sandbox.manifest_path = Some(manifest.path);
        sandbox.manifest_hash = Some(manifest.hash);
    }

    Ok(SandboxRunResult {
        command: spec.display,
        exit_code: status.code(),
        signal: exit_signal(&status),
        output,
        timed_out,
        sandbox,
    })
}

#[derive(Debug, Clone)]
pub struct SandboxManifestWrite {
    pub path: String,
    pub hash: String,
    pub workspace: SandboxWorkspace,
}

fn write_sandbox_manifest(
    mission_id: &str,
    sandbox_root: &str,
    command: &str,
    exit_code: Option<i32>,
    signal: Option<String>,
    timed_out: bool,
    started_at: u128,
    finished_at: u128,
    sandbox: &SandboxInfo,
) -> Result<SandboxManifestWrite, String> {
    let workspace = sandbox_workspace(sandbox_root, mission_id);
    fs::create_dir_all(&workspace.artifacts_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&workspace.manifests_dir).map_err(|error| error.to_string())?;

    let manifest_without_hash = manifest_json(
        mission_id,
        command,
        exit_code,
        signal.as_deref(),
        timed_out,
        started_at,
        finished_at,
        sandbox,
        None,
    );
    let hash = evidence_hash(&manifest_without_hash);
    let manifest = manifest_json(
        mission_id,
        command,
        exit_code,
        signal.as_deref(),
        timed_out,
        started_at,
        finished_at,
        sandbox,
        Some(&hash),
    );
    let filename = format!("{}-{}.json", current_millis(), safe_path_segment(command));
    let path = join_path(&workspace.manifests_dir, &filename);
    fs::write(&path, format!("{manifest}\n")).map_err(|error| error.to_string())?;

    Ok(SandboxManifestWrite {
        path,
        hash,
        workspace,
    })
}

fn manifest_json(
    mission_id: &str,
    command: &str,
    exit_code: Option<i32>,
    signal: Option<&str>,
    timed_out: bool,
    started_at: u128,
    finished_at: u128,
    sandbox: &SandboxInfo,
    manifest_hash: Option<&str>,
) -> String {
    let manifest_hash_line = manifest_hash
        .map(|hash| format!(",\n  \"manifestHash\": \"{}\"", json_escape(hash)))
        .unwrap_or_default();
    format!(
        "{{\n  \"missionId\": \"{}\",\n  \"command\": \"{}\",\n  \"exitCode\": {},\n  \"signal\": {},\n  \"timedOut\": {},\n  \"startedAt\": \"{}\",\n  \"finishedAt\": \"{}\",\n  \"executionCwd\": \"{}\",\n  \"sandbox\": {}{}\n}}",
        json_escape(mission_id),
        json_escape(command),
        json_option_i32(exit_code),
        json_option_string(signal),
        timed_out,
        started_at,
        finished_at,
        json_escape(&sandbox.execution_cwd),
        sandbox_info_json(sandbox),
        manifest_hash_line
    )
}

pub fn sandbox_info_json(sandbox: &SandboxInfo) -> String {
    format!(
        "{{\n    \"shell\": {},\n    \"executionCwd\": \"{}\",\n    \"workspaceRoot\": {},\n    \"artifactsDir\": {},\n    \"manifestPath\": {},\n    \"manifestHash\": {},\n    \"env\": \"{}\",\n    \"network\": \"{}\",\n    \"outputLimitBytes\": {},\n    \"timeoutMs\": {},\n    \"isolation\": \"{}\",\n    \"engine\": \"{}\",\n    \"kernelVersion\": \"{}\"\n  }}",
        sandbox.shell,
        json_escape(&sandbox.execution_cwd),
        json_option_string(sandbox.workspace_root.as_deref()),
        json_option_string(sandbox.artifacts_dir.as_deref()),
        json_option_string(sandbox.manifest_path.as_deref()),
        json_option_string(sandbox.manifest_hash.as_deref()),
        json_escape(&sandbox.env),
        json_escape(&sandbox.network),
        sandbox.output_limit_bytes,
        sandbox.timeout_ms,
        json_escape(&sandbox.isolation),
        json_escape(&sandbox.engine),
        json_escape(&sandbox.kernel_version)
    )
}

fn result(
    decision: PolicyDecision,
    reason: &str,
    matched_rule: &str,
    approver_role: Option<&str>,
) -> PolicyResult {
    PolicyResult {
        decision,
        reason: reason.to_string(),
        matched_rule: matched_rule.to_string(),
        approver_role: approver_role.map(str::to_string),
        engine: "rust_core".to_string(),
        kernel_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

fn matches_any(path: &str, patterns: &[&str]) -> bool {
    patterns
        .iter()
        .any(|pattern| matches_pattern(path, pattern))
}

fn matches_pattern(path: &str, pattern: &str) -> bool {
    match pattern {
        ".env.*" => path.starts_with(".env."),
        "**/migrations/**" => path.starts_with("migrations/") || path.contains("/migrations/"),
        _ if pattern.ends_with("/**") => {
            let prefix = pattern.trim_end_matches("**");
            path.starts_with(prefix)
        }
        _ if pattern.ends_with('*') => {
            let prefix = pattern.trim_end_matches('*');
            path.starts_with(prefix)
        }
        _ => path == pattern,
    }
}

fn normalize_path(path: &str) -> String {
    path.strip_prefix("./").unwrap_or(path).replace('\\', "/")
}

fn normalize_command(command: &str) -> String {
    command.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_destructive_command(command: &str) -> bool {
    let command = command.to_ascii_lowercase();
    command.contains("rm -rf /")
        || command.contains("rm -rf *")
        || (command.contains("curl ") && command.contains("| sh"))
        || command.starts_with("ssh ")
        || command.starts_with("sudo ")
}

fn looks_secret_key(key: &str) -> bool {
    let key = key.to_ascii_uppercase();
    key.contains("SECRET")
        || key.contains("TOKEN")
        || key.contains("PASSWORD")
        || key.contains("API_KEY")
        || key.contains("PRIVATE_KEY")
        || key.contains("CREDENTIAL")
        || key.contains("DATABASE_URL")
}

fn read_pipe<R: Read>(mut reader: R) -> String {
    let mut output = String::new();
    let _ = reader.read_to_string(&mut output);
    output
}

fn current_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn join_path(left: &str, right: &str) -> String {
    let separator = std::path::MAIN_SEPARATOR;
    if left.ends_with(separator) {
        format!("{left}{right}")
    } else {
        format!("{left}{separator}{right}")
    }
}

fn json_option_i32(value: Option<i32>) -> String {
    value
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".to_string())
}

fn json_option_string(value: Option<&str>) -> String {
    value
        .map(|value| format!("\"{}\"", json_escape(value)))
        .unwrap_or_else(|| "null".to_string())
}

fn json_escape(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            _ => output.push(ch),
        }
    }
    output
}

#[derive(Debug, Clone, PartialEq)]
enum JsonValue {
    Null,
    Bool(bool),
    Number(String),
    String(String),
    Array(Vec<JsonValue>),
    Object(BTreeMap<String, JsonValue>),
}

fn stable_json(value: &JsonValue) -> String {
    match value {
        JsonValue::Null => "null".to_string(),
        JsonValue::Bool(value) => value.to_string(),
        JsonValue::Number(value) => value.clone(),
        JsonValue::String(value) => format!("\"{}\"", json_escape(value)),
        JsonValue::Array(values) => format!(
            "[{}]",
            values.iter().map(stable_json).collect::<Vec<_>>().join(",")
        ),
        JsonValue::Object(values) => format!(
            "{{{}}}",
            values
                .iter()
                .map(|(key, value)| format!("\"{}\":{}", json_escape(key), stable_json(value)))
                .collect::<Vec<_>>()
                .join(",")
        ),
    }
}

struct JsonParser<'a> {
    input: &'a str,
    index: usize,
}

impl<'a> JsonParser<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, index: 0 }
    }

    fn parse(&mut self) -> Result<JsonValue, String> {
        self.skip_whitespace();
        match self.peek() {
            Some('n') => self.parse_literal("null", JsonValue::Null),
            Some('t') => self.parse_literal("true", JsonValue::Bool(true)),
            Some('f') => self.parse_literal("false", JsonValue::Bool(false)),
            Some('"') => self.parse_string().map(JsonValue::String),
            Some('[') => self.parse_array(),
            Some('{') => self.parse_object(),
            Some('-') | Some('0'..='9') => self.parse_number().map(JsonValue::Number),
            Some(ch) => Err(format!("unexpected JSON character: {ch}")),
            None => Err("empty JSON input".to_string()),
        }
    }

    fn finish(&mut self) -> Result<(), String> {
        self.skip_whitespace();
        if self.index == self.input.len() {
            Ok(())
        } else {
            Err("unexpected trailing JSON content".to_string())
        }
    }

    fn parse_literal(&mut self, literal: &str, value: JsonValue) -> Result<JsonValue, String> {
        if self.input[self.index..].starts_with(literal) {
            self.index += literal.len();
            Ok(value)
        } else {
            Err(format!("invalid JSON literal, expected {literal}"))
        }
    }

    fn parse_array(&mut self) -> Result<JsonValue, String> {
        self.expect('[')?;
        let mut values = Vec::new();
        loop {
            self.skip_whitespace();
            if self.consume(']') {
                break;
            }
            values.push(self.parse()?);
            self.skip_whitespace();
            if self.consume(']') {
                break;
            }
            self.expect(',')?;
        }
        Ok(JsonValue::Array(values))
    }

    fn parse_object(&mut self) -> Result<JsonValue, String> {
        self.expect('{')?;
        let mut values = BTreeMap::new();
        loop {
            self.skip_whitespace();
            if self.consume('}') {
                break;
            }
            let key = self.parse_string()?;
            self.skip_whitespace();
            self.expect(':')?;
            let value = self.parse()?;
            values.insert(key, value);
            self.skip_whitespace();
            if self.consume('}') {
                break;
            }
            self.expect(',')?;
        }
        Ok(JsonValue::Object(values))
    }

    fn parse_string(&mut self) -> Result<String, String> {
        self.expect('"')?;
        let mut output = String::new();
        while let Some(ch) = self.next() {
            match ch {
                '"' => return Ok(output),
                '\\' => output.push(self.parse_escape()?),
                _ => output.push(ch),
            }
        }
        Err("unterminated JSON string".to_string())
    }

    fn parse_escape(&mut self) -> Result<char, String> {
        match self.next().ok_or("unterminated JSON escape")? {
            '"' => Ok('"'),
            '\\' => Ok('\\'),
            '/' => Ok('/'),
            'b' => Ok('\u{0008}'),
            'f' => Ok('\u{000c}'),
            'n' => Ok('\n'),
            'r' => Ok('\r'),
            't' => Ok('\t'),
            'u' => {
                let hex = self.take(4)?;
                let code = u32::from_str_radix(hex, 16).map_err(|_| "invalid unicode escape")?;
                char::from_u32(code).ok_or_else(|| "invalid unicode scalar".to_string())
            }
            ch => Err(format!("invalid JSON escape: {ch}")),
        }
    }

    fn parse_number(&mut self) -> Result<String, String> {
        let start = self.index;
        self.consume('-');
        self.take_digits();
        if self.consume('.') {
            self.take_digits();
        }
        if matches!(self.peek(), Some('e' | 'E')) {
            self.next();
            if matches!(self.peek(), Some('+' | '-')) {
                self.next();
            }
            self.take_digits();
        }
        Ok(self.input[start..self.index].to_string())
    }

    fn take_digits(&mut self) {
        while matches!(self.peek(), Some('0'..='9')) {
            self.next();
        }
    }

    fn expect(&mut self, expected: char) -> Result<(), String> {
        self.skip_whitespace();
        if self.consume(expected) {
            Ok(())
        } else {
            Err(format!("expected JSON character: {expected}"))
        }
    }

    fn consume(&mut self, expected: char) -> bool {
        if self.peek() == Some(expected) {
            self.next();
            true
        } else {
            false
        }
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek(), Some(' ' | '\n' | '\r' | '\t')) {
            self.next();
        }
    }

    fn peek(&self) -> Option<char> {
        self.input[self.index..].chars().next()
    }

    fn next(&mut self) -> Option<char> {
        let ch = self.peek()?;
        self.index += ch.len_utf8();
        Some(ch)
    }

    fn take(&mut self, count: usize) -> Result<&'a str, String> {
        let start = self.index;
        for _ in 0..count {
            self.next().ok_or("unexpected end of JSON input")?;
        }
        Ok(&self.input[start..self.index])
    }
}

#[cfg(unix)]
fn exit_signal(status: &std::process::ExitStatus) -> Option<String> {
    use std::os::unix::process::ExitStatusExt;
    status.signal().map(|signal| signal.to_string())
}

#[cfg(not(unix))]
fn exit_signal(_status: &std::process::ExitStatus) -> Option<String> {
    None
}

fn to_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}

fn sha256(input: &[u8]) -> [u8; 32] {
    const H0: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];

    let bit_len = (input.len() as u64) * 8;
    let mut data = input.to_vec();
    data.push(0x80);
    while (data.len() % 64) != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());

    let mut h = H0;
    for chunk in data.chunks(64) {
        let mut w = [0u32; 64];
        for (index, word) in w.iter_mut().take(16).enumerate() {
            let offset = index * 4;
            *word = u32::from_be_bytes([
                chunk[offset],
                chunk[offset + 1],
                chunk[offset + 2],
                chunk[offset + 3],
            ]);
        }
        for index in 16..64 {
            let s0 = w[index - 15].rotate_right(7)
                ^ w[index - 15].rotate_right(18)
                ^ (w[index - 15] >> 3);
            let s1 = w[index - 2].rotate_right(17)
                ^ w[index - 2].rotate_right(19)
                ^ (w[index - 2] >> 10);
            w[index] = w[index - 16]
                .wrapping_add(s0)
                .wrapping_add(w[index - 7])
                .wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for index in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[index])
                .wrapping_add(w[index]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut output = [0u8; 32];
    for (index, word) in h.iter().enumerate() {
        output[index * 4..index * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denies_secrets() {
        let result = evaluate(&Action {
            action_type: "file_read".into(),
            path: Some(".env".into()),
            command: None,
            agent_role: Some("coder".into()),
            autonomy_level: 2,
            risk_level: "medium".into(),
        });
        assert_eq!(result.decision, PolicyDecision::Deny);
    }

    #[test]
    fn requires_approval_for_auth_changes() {
        let result = evaluate(&Action {
            action_type: "file_write".into(),
            path: Some("auth/session.rs".into()),
            command: None,
            agent_role: Some("coder".into()),
            autonomy_level: 4,
            risk_level: "high".into(),
        });
        assert_eq!(result.decision, PolicyDecision::RequireApproval);
        assert_eq!(result.approver_role.as_deref(), Some("security_owner"));
    }

    #[test]
    fn allows_core_workflow_commands() {
        let result = evaluate(&Action {
            action_type: "command_execute".into(),
            path: None,
            command: Some("cargo build".into()),
            agent_role: Some("coder".into()),
            autonomy_level: 4,
            risk_level: "medium".into(),
        });
        assert_eq!(result.decision, PolicyDecision::Allow);
    }

    #[test]
    fn requires_review_for_critical_risk() {
        let result = evaluate(&Action {
            action_type: "file_write".into(),
            path: Some("apps/web/src/App.tsx".into()),
            command: None,
            agent_role: Some("coder".into()),
            autonomy_level: 3,
            risk_level: "critical".into(),
        });
        assert_eq!(result.decision, PolicyDecision::RequireReview);
    }

    #[test]
    fn protects_agentops_governance_for_metadev() {
        let result = evaluate(&Action {
            action_type: "file_write".into(),
            path: Some("./.agentops/policies/root.yml".into()),
            command: None,
            agent_role: Some("metadev".into()),
            autonomy_level: 2,
            risk_level: "medium".into(),
        });
        assert_eq!(result.decision, PolicyDecision::RequireApproval);
        assert_eq!(
            result.matched_rule,
            "require_approval_for_agentops_governance_changes"
        );
    }

    #[test]
    fn resolves_allowlisted_sandbox_commands() {
        let spec = resolve_sandbox_command("cargo   build").unwrap();
        assert_eq!(spec.display, "cargo build");
        assert_eq!(spec.executable, "cargo");
        assert_eq!(spec.args, vec!["build"]);
        assert!(resolve_sandbox_command("cargo build && rm -rf /").is_err());
    }

    #[test]
    fn filters_sandbox_environment() {
        let env = build_sandbox_env_from(&[
            ("PATH".to_string(), "/usr/bin".to_string()),
            ("HOME".to_string(), "/tmp/home".to_string()),
            ("DATABASE_URL".to_string(), "postgres://secret".to_string()),
            ("OPENAI_API_KEY".to_string(), "secret".to_string()),
        ]);
        assert!(env.contains(&("PATH".to_string(), "/usr/bin".to_string())));
        assert!(env.contains(&("HOME".to_string(), "/tmp/home".to_string())));
        assert!(env.contains(&("FORCE_COLOR".to_string(), "0".to_string())));
        assert!(env.contains(&("CI".to_string(), "true".to_string())));
        assert!(!env.iter().any(|(key, _)| key == "DATABASE_URL"));
        assert!(!env.iter().any(|(key, _)| key == "OPENAI_API_KEY"));
    }

    #[test]
    fn keeps_output_within_byte_budget() {
        let output = limit_output("abcdefghij", 5);
        assert!(output.len() <= 5);
        assert!("abcdefghij".ends_with(&output));
    }

    #[test]
    fn hashes_evidence_with_sha256() {
        assert_eq!(
            evidence_hash("proof"),
            "sha256:c1cda26362828b69266512052b97cb3729e3b052e4ade47c0a1e3383defe73c7"
        );
    }

    #[test]
    fn hashes_json_with_stable_key_order() {
        assert_eq!(
            hash_json(r#"{"b":2,"a":1}"#).unwrap(),
            hash_json(r#"{"a":1,"b":2}"#).unwrap()
        );
    }

    #[test]
    fn hashes_json_content_changes() {
        assert_ne!(
            hash_json(r#"{"result":"success"}"#).unwrap(),
            hash_json(r#"{"result":"failed"}"#).unwrap()
        );
    }
}
