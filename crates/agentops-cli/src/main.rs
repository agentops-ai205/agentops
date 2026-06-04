use agentops_core::{
    evaluate, evidence_hash, hash_json, run_sandbox_command, sandbox_info_json, Action,
    PolicyResult, SandboxRunConfig, SandboxRunResult,
};
use std::{env, fs, path::PathBuf};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("init") => {
            let root = args
                .next()
                .map(PathBuf::from)
                .unwrap_or(env::current_dir().map_err(|error| error.to_string())?);
            init(root)
        }
        Some("policy-test") => {
            let action = parse_policy_action(args.collect())?;
            println!("{}", policy_result_json(&evaluate(&action)));
            Ok(())
        }
        Some("sandbox-run") => {
            let config = parse_sandbox_config(args.collect())?;
            println!("{}", sandbox_result_json(&run_sandbox_command(config)?));
            Ok(())
        }
        Some("hash") => {
            let text = args.next().ok_or("hash requires text")?;
            println!("{}", evidence_hash(&text));
            Ok(())
        }
        Some("hash-json") => {
            let input = parse_hash_json_input(args.collect())?;
            println!("{}", hash_json(&input)?);
            Ok(())
        }
        Some("mission-template") => {
            println!("{}", mission_template());
            Ok(())
        }
        Some("help") | Some("--help") | Some("-h") | None => {
            println!("{}", help());
            Ok(())
        }
        Some(command) => Err(format!("unknown command: {command}")),
    }
}

fn parse_hash_json_input(args: Vec<String>) -> Result<String, String> {
    let mut input_json = None;
    let mut index = 0;
    while index < args.len() {
        let key = &args[index];
        match key.as_str() {
            "--input-json" => input_json = Some(next_value(&args, &mut index, key)?),
            other => return Err(format!("unknown hash-json option: {other}")),
        }
        index += 1;
    }
    input_json.ok_or("--input-json is required".to_string())
}

fn parse_sandbox_config(args: Vec<String>) -> Result<SandboxRunConfig, String> {
    let mut command = None;
    let mut project_root = env::current_dir()
        .map_err(|error| error.to_string())?
        .display()
        .to_string();
    let mut sandbox_root = ".agentops/sandboxes".to_string();
    let mut mission_id = None;
    let mut timeout_ms = 120_000;
    let mut output_limit_bytes = 20_000;

    let mut index = 0;
    while index < args.len() {
        let key = &args[index];
        match key.as_str() {
            "--command" => command = Some(next_value(&args, &mut index, key)?),
            "--project-root" => project_root = next_value(&args, &mut index, key)?,
            "--sandbox-root" => sandbox_root = next_value(&args, &mut index, key)?,
            "--mission-id" => mission_id = Some(next_value(&args, &mut index, key)?),
            "--timeout-ms" => {
                timeout_ms = next_value(&args, &mut index, key)?
                    .parse::<u64>()
                    .map_err(|_| "--timeout-ms must be an integer".to_string())?;
            }
            "--output-limit-bytes" => {
                output_limit_bytes = next_value(&args, &mut index, key)?
                    .parse::<usize>()
                    .map_err(|_| "--output-limit-bytes must be an integer".to_string())?;
            }
            other => return Err(format!("unknown sandbox-run option: {other}")),
        }
        index += 1;
    }

    Ok(SandboxRunConfig {
        command: command.ok_or("--command is required")?,
        project_root,
        sandbox_root,
        mission_id,
        timeout_ms,
        output_limit_bytes,
        env: env::vars().collect(),
    })
}

fn parse_policy_action(args: Vec<String>) -> Result<Action, String> {
    let mut input_json = None;
    let mut action_type = None;
    let mut path = None;
    let mut command = None;
    let mut agent_role = Some("coder".to_string());
    let mut autonomy_level = 2;
    let mut risk_level = "medium".to_string();

    let mut index = 0;
    while index < args.len() {
        let key = &args[index];
        match key.as_str() {
            "--input-json" => input_json = Some(next_value(&args, &mut index, key)?),
            "--action-type" => action_type = Some(next_value(&args, &mut index, key)?),
            "--path" => path = Some(next_value(&args, &mut index, key)?),
            "--command" => command = Some(next_value(&args, &mut index, key)?),
            "--agent-role" => agent_role = Some(next_value(&args, &mut index, key)?),
            "--autonomy-level" => {
                let value = next_value(&args, &mut index, key)?;
                autonomy_level = value
                    .parse::<u8>()
                    .map_err(|_| "--autonomy-level must be an integer 0-255".to_string())?;
            }
            "--risk-level" => risk_level = next_value(&args, &mut index, key)?,
            other => return Err(format!("unknown policy-test option: {other}")),
        }
        index += 1;
    }

    if let Some(input) = input_json {
        return action_from_json(&input);
    }

    Ok(Action {
        action_type: action_type.ok_or("--action-type is required without --input-json")?,
        path,
        command,
        agent_role,
        autonomy_level,
        risk_level,
    })
}

fn next_value(args: &[String], index: &mut usize, key: &str) -> Result<String, String> {
    *index += 1;
    args.get(*index)
        .cloned()
        .ok_or_else(|| format!("{key} requires a value"))
}

fn action_from_json(input: &str) -> Result<Action, String> {
    let action_type = string_field(input, "type")
        .or_else(|| string_field(input, "action_type"))
        .ok_or("policy action JSON requires type")?;
    Ok(Action {
        action_type,
        path: string_field(input, "path"),
        command: string_field(input, "command"),
        agent_role: string_field(input, "agent_role"),
        autonomy_level: number_field(input, "autonomy_level").unwrap_or(2),
        risk_level: string_field(input, "risk_level").unwrap_or_else(|| "medium".to_string()),
    })
}

fn string_field(input: &str, field: &str) -> Option<String> {
    let start = value_start(input, field)?;
    let rest = input[start..].trim_start();
    if rest.starts_with("null") {
        return None;
    }
    let first_quote = rest.find('"')?;
    parse_json_string(&rest[first_quote..]).map(|(value, _)| value)
}

fn number_field(input: &str, field: &str) -> Option<u8> {
    let start = value_start(input, field)?;
    let rest = input[start..].trim_start();
    let digits: String = rest.chars().take_while(|ch| ch.is_ascii_digit()).collect();
    digits.parse().ok()
}

fn value_start(input: &str, field: &str) -> Option<usize> {
    let needle = format!("\"{}\"", escape_json(field));
    let field_start = input.find(&needle)?;
    let colon = input[field_start + needle.len()..].find(':')?;
    Some(field_start + needle.len() + colon + 1)
}

fn parse_json_string(input: &str) -> Option<(String, usize)> {
    let mut chars = input.char_indices();
    if chars.next()?.1 != '"' {
        return None;
    }

    let mut output = String::new();
    let mut escaped = false;
    while let Some((index, ch)) = chars.next() {
        if escaped {
            match ch {
                '"' => output.push('"'),
                '\\' => output.push('\\'),
                '/' => output.push('/'),
                'b' => output.push('\u{0008}'),
                'f' => output.push('\u{000c}'),
                'n' => output.push('\n'),
                'r' => output.push('\r'),
                't' => output.push('\t'),
                'u' => {
                    let code = input.get(index + 1..index + 5)?;
                    let value = u32::from_str_radix(code, 16).ok()?;
                    output.push(char::from_u32(value)?);
                    for _ in 0..4 {
                        chars.next();
                    }
                }
                _ => return None,
            }
            escaped = false;
            continue;
        }

        match ch {
            '\\' => escaped = true,
            '"' => return Some((output, index + 1)),
            _ => output.push(ch),
        }
    }
    None
}

fn policy_result_json(result: &PolicyResult) -> String {
    let approver = result
        .approver_role
        .as_deref()
        .map(|role| format!("  \"approver_role\": \"{}\",\n", escape_json(role)))
        .unwrap_or_default();

    format!(
        "{{\n  \"decision\": \"{}\",\n  \"reason\": \"{}\",\n  \"matched_rule\": \"{}\",\n{}  \"engine\": \"{}\",\n  \"kernel_version\": \"{}\"\n}}",
        result.decision.as_str(),
        escape_json(&result.reason),
        escape_json(&result.matched_rule),
        approver,
        escape_json(&result.engine),
        escape_json(&result.kernel_version)
    )
}

fn sandbox_result_json(result: &SandboxRunResult) -> String {
    format!(
        "{{\n  \"command\": \"{}\",\n  \"exitCode\": {},\n  \"signal\": {},\n  \"output\": \"{}\",\n  \"timedOut\": {},\n  \"sandbox\": {}\n}}",
        escape_json(&result.command),
        result
            .exit_code
            .map(|value| value.to_string())
            .unwrap_or_else(|| "null".to_string()),
        result
            .signal
            .as_deref()
            .map(|value| format!("\"{}\"", escape_json(value)))
            .unwrap_or_else(|| "null".to_string()),
        escape_json(&result.output),
        result.timed_out,
        sandbox_info_json(&result.sandbox)
    )
}

fn escape_json(input: &str) -> String {
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

fn init(root: PathBuf) -> Result<(), String> {
    let agentops = root.join(".agentops");
    fs::create_dir_all(agentops.join("audit")).map_err(|error| error.to_string())?;
    fs::create_dir_all(agentops.join("memory")).map_err(|error| error.to_string())?;
    fs::create_dir_all(agentops.join("policies")).map_err(|error| error.to_string())?;
    fs::write(
        agentops.join("README.md"),
        "AgentOps kernel initialized by Rust CLI.\n",
    )
    .map_err(|error| error.to_string())?;
    fs::write(agentops.join("audit/action-log.jsonl"), "").map_err(|error| error.to_string())?;
    println!("Initialized {}", agentops.display());
    Ok(())
}

fn help() -> &'static str {
    r#"AgentOps OS CLI

Commands:
  init [root]
  policy-test --input-json '{"type":"file_read","path":".env"}'
  policy-test --action-type file_read --path .env
  sandbox-run --command "cargo build" --project-root . --sandbox-root .agentops/sandboxes
  hash <text>
  hash-json --input-json '{"b":2,"a":1}'
  mission-template
"#
}

fn mission_template() -> &'static str {
    r#"mission_id: AOS-MIS-2026-0001
title: Ajouter une capacite gouvernee
intent: Transformer une intention humaine en artefact verifiable
scope:
  include: ["apps/**"]
  exclude: [".env*", "secrets/**"]
success_criteria:
  - Build sans erreur
  - Evidence attachee
risk_level: medium
autonomy_level: 4
"#
}
