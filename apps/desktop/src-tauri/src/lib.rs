use serde::Serialize;

#[derive(Serialize)]
struct DesktopRuntime {
    platform: String,
    api_url: String,
    product: String,
}

#[tauri::command]
fn desktop_runtime() -> DesktopRuntime {
    DesktopRuntime {
        platform: std::env::consts::OS.to_string(),
        api_url: "http://127.0.0.1:3000".to_string(),
        product: "AgentOps Desktop IDE".to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![desktop_runtime])
        .run(tauri::generate_context!())
        .expect("failed to run AgentOps desktop shell");
}
