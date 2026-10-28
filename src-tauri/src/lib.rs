pub mod audio;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Boot-Time Orphan Session Recovery
      audio::recover_orphan_sessions(app.handle());

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      audio::start_recording,
      audio::stop_recording,
      audio::pause_recording,
      audio::resume_recording
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
