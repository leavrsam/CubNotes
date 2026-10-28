use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Stream;
use hound::{WavSpec, WavWriter};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use base64::{Engine as _, engine::general_purpose};
use tauri::{AppHandle, Emitter, Manager};

struct StreamWrapper(Option<Stream>);
unsafe impl Send for StreamWrapper {}
unsafe impl Sync for StreamWrapper {}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionManifest {
    pub sessionId: String,
    pub canvasPageId: String,
    pub startedAtEpochMs: u64,
    pub lastFlushedAtEpochMs: u64,
    pub totalPausedDurationMs: u64,
    pub isFinalized: bool,
    pub sampleRate: u32,
    pub channels: u16,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredSessionPayload {
    pub sessionId: String,
    pub canvasPageId: String,
    pub startedAtEpochMs: u64,
    pub recoveredFilePath: String,
    pub audioBase64: String,
}

enum AudioMessage {
    Samples(Vec<f32>),
    Pause,
    Resume,
    Stop,
}

struct ActiveSession {
    session_id: String,
    canvas_page_id: String,
    started_at_ms: u64,
    paused_at_ms: Option<u64>,
    total_paused_ms: u64,
    pcm_path: PathBuf,
    meta_path: PathBuf,
    tx: mpsc::Sender<AudioMessage>,
    sample_rate: u32,
    channels: u16,
}

lazy_static::lazy_static! {
    static ref OUT_STREAM: Mutex<StreamWrapper> = Mutex::new(StreamWrapper(None));
    static ref IN_STREAM: Mutex<StreamWrapper> = Mutex::new(StreamWrapper(None));
    static ref ACTIVE_SESSION: Mutex<Option<ActiveSession>> = Mutex::new(None);
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn get_audio_scratch_dir(app_handle: &AppHandle) -> PathBuf {
    let base = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("cubnotes"));
    let scratch = base.join("audio_scratch");
    let _ = std::fs::create_dir_all(&scratch);
    scratch
}

/**
 * Resamples raw 32-bit float samples from src_rate to 16,000 Hz mono (16-bit PCM).
 */
fn resample_to_16k_mono(input: &[f32], src_rate: u32, src_channels: u16) -> Vec<i16> {
    if input.is_empty() || src_rate == 0 || src_channels == 0 {
        return Vec::new();
    }

    let channels = src_channels as usize;
    let frames = input.len() / channels;
    if frames == 0 {
        return Vec::new();
    }

    // Step 1: Downmix channels to mono
    let mut mono: Vec<f32> = Vec::with_capacity(frames);
    for i in 0..frames {
        let mut sum = 0.0f32;
        for c in 0..channels {
            sum += input[i * channels + c];
        }
        mono.push(sum / (channels as f32));
    }

    // Step 2: Linear interpolation to 16,000 Hz
    let target_rate = 16000.0f32;
    let ratio = (src_rate as f32) / target_rate;
    let target_frames = ((frames as f32) / ratio).floor() as usize;
    let mut output: Vec<i16> = Vec::with_capacity(target_frames);

    for i in 0..target_frames {
        let src_idx_f = (i as f32) * ratio;
        let idx0 = src_idx_f.floor() as usize;
        let idx1 = (idx0 + 1).min(frames.saturating_sub(1));
        let frac = src_idx_f - (idx0 as f32);

        let sample_f = if idx0 < mono.len() {
            let s0 = mono[idx0];
            let s1 = if idx1 < mono.len() { mono[idx1] } else { s0 };
            s0 + (s1 - s0) * frac
        } else {
            0.0
        };

        // Clamp to [-1.0, 1.0] and convert to signed 16-bit PCM
        let clamped = sample_f.max(-1.0).min(1.0);
        let sample_i16 = (clamped * 32767.0) as i16;
        output.push(sample_i16);
    }

    output
}

#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    session_id: Option<String>,
    canvas_page_id: Option<String>,
) -> Result<String, String> {
    let host = cpal::default_host();
    let scratch_dir = get_audio_scratch_dir(&app);

    let session_uuid = session_id.unwrap_or_else(|| {
        format!("rec_{}", now_epoch_ms())
    });
    let page_id = canvas_page_id.unwrap_or_else(|| "default".to_string());

    let pcm_path = scratch_dir.join(format!("{}.pcm", session_uuid));
    let meta_path = scratch_dir.join(format!("{}.meta.json", session_uuid));

    let started_at = now_epoch_ms();
    let (tx, rx) = mpsc::channel::<AudioMessage>();

    // Determine device audio config
    let in_device = host.default_input_device().ok_or("No input recording device found")?;
    let in_cfg = in_device.default_input_config().map_err(|e| e.to_string())?;
    let stream_cfg: cpal::StreamConfig = in_cfg.into();
    let sample_rate = stream_cfg.sample_rate.0;
    let channels = stream_cfg.channels;

    // Write initial session manifest
    let manifest = SessionManifest {
        sessionId: session_uuid.clone(),
        canvasPageId: page_id.clone(),
        startedAtEpochMs: started_at,
        lastFlushedAtEpochMs: started_at,
        totalPausedDurationMs: 0,
        isFinalized: false,
        sampleRate: sample_rate,
        channels: channels,
    };

    if let Ok(json) = serde_json::to_string_pretty(&manifest) {
        let _ = std::fs::write(&meta_path, json);
    }

    // Decoupled Background Rolling File Sink Thread
    let pcm_path_clone = pcm_path.clone();
    let meta_path_clone = meta_path.clone();
    let mut manifest_clone = manifest.clone();

    std::thread::spawn(move || {
        let mut file = match OpenOptions::new().create(true).append(true).open(&pcm_path_clone) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[AudioRollingEngine] Failed to open PCM sink: {}", e);
                return;
            }
        };

        let mut last_flush = SystemTime::now();
        let mut is_paused = false;

        while let Ok(msg) = rx.recv() {
            match msg {
                AudioMessage::Samples(chunk) => {
                    if !is_paused && !chunk.is_empty() {
                        // Append raw 32-bit float bytes directly to rolling sink
                        let byte_slice: &[u8] = unsafe {
                            std::slice::from_raw_parts(
                                chunk.as_ptr() as *const u8,
                                chunk.len() * std::mem::size_of::<f32>(),
                            )
                        };
                        let _ = file.write_all(byte_slice);
                    }
                }
                AudioMessage::Pause => {
                    is_paused = true;
                    let _ = file.flush();
                }
                AudioMessage::Resume => {
                    is_paused = false;
                }
                AudioMessage::Stop => {
                    let _ = file.flush();
                    break;
                }
            }

            // Periodic flush & manifest heartbeat every 3-5 seconds
            if last_flush.elapsed().map(|d| d.as_secs() >= 3).unwrap_or(false) {
                let _ = file.flush();
                manifest_clone.lastFlushedAtEpochMs = now_epoch_ms();
                if let Ok(json) = serde_json::to_string_pretty(&manifest_clone) {
                    let _ = std::fs::write(&meta_path_clone, json);
                }
                last_flush = SystemTime::now();
            }
        }
    });

    // Build Native Input Stream
    let tx_in = tx.clone();
    let in_stream = in_device
        .build_input_stream(
            &stream_cfg,
            move |data: &[f32], _: &_| {
                let _ = tx_in.send(AudioMessage::Samples(data.to_vec()));
            },
            |err| eprintln!("Input stream error: {}", err),
            None,
        )
        .map_err(|e| e.to_string())?;

    in_stream.play().map_err(|e| e.to_string())?;
    *IN_STREAM.lock().unwrap() = StreamWrapper(Some(in_stream));

    // Desktop Dual-Channel Loopback Capture (Windows/macOS)
    #[cfg(not(target_os = "android"))]
    {
        if let Some(out_device) = host.default_output_device() {
            if let Ok(out_cfg) = out_device.default_output_config() {
                let out_config: cpal::StreamConfig = out_cfg.into();
                let tx_out = tx.clone();
                let out_stream = out_device
                    .build_input_stream(
                        &out_config,
                        move |data: &[f32], _: &_| {
                            let _ = tx_out.send(AudioMessage::Samples(data.to_vec()));
                        },
                        |err| eprintln!("Loopback stream error: {}", err),
                        None,
                    )
                    .ok();

                if let Some(stream) = out_stream {
                    if stream.play().is_ok() {
                        *OUT_STREAM.lock().unwrap() = StreamWrapper(Some(stream));
                    }
                }
            }
        }
    }

    *ACTIVE_SESSION.lock().unwrap() = Some(ActiveSession {
        session_id: session_uuid.clone(),
        canvas_page_id: page_id,
        started_at_ms: started_at,
        paused_at_ms: None,
        total_paused_ms: 0,
        pcm_path,
        meta_path,
        tx,
        sample_rate,
        channels,
    });

    Ok(session_uuid)
}

#[tauri::command]
pub fn pause_recording() -> Result<(), String> {
    if let Some(ref mut session) = *ACTIVE_SESSION.lock().unwrap() {
        if session.paused_at_ms.is_none() {
            session.paused_at_ms = Some(now_epoch_ms());
            let _ = session.tx.send(AudioMessage::Pause);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn resume_recording() -> Result<(), String> {
    if let Some(ref mut session) = *ACTIVE_SESSION.lock().unwrap() {
        if let Some(paused_at) = session.paused_at_ms.take() {
            session.total_paused_ms += now_epoch_ms().saturating_sub(paused_at);
            let _ = session.tx.send(AudioMessage::Resume);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn stop_recording() -> Result<String, String> {
    // 1. Drop hardware audio streams
    if let Some(stream) = OUT_STREAM.lock().unwrap().0.take() {
        drop(stream);
    }
    if let Some(stream) = IN_STREAM.lock().unwrap().0.take() {
        drop(stream);
    }

    let session = ACTIVE_SESSION
        .lock()
        .unwrap()
        .take()
        .ok_or("No active recording session")?;

    // Signal background thread to flush and terminate
    let _ = session.tx.send(AudioMessage::Stop);
    std::thread::sleep(std::time::Duration::from_millis(150));

    // 2. Read recorded PCM buffer
    let mut pcm_bytes = Vec::new();
    if let Ok(mut f) = File::open(&session.pcm_path) {
        let _ = f.read_to_end(&mut pcm_bytes);
    }

    if pcm_bytes.is_empty() {
        return Err("No audio captured in session".to_string());
    }

    let float_count = pcm_bytes.len() / std::mem::size_of::<f32>();
    let float_slice: &[f32] = unsafe {
        std::slice::from_raw_parts(pcm_bytes.as_ptr() as *const f32, float_count)
    };

    // 3. Resample to 16kHz mono 16-bit PCM (Sub-10MB/hour footprint)
    let mono_16k_samples = resample_to_16k_mono(float_slice, session.sample_rate, session.channels);

    let scratch_dir = session.pcm_path.parent().unwrap_or_else(|| Path::new("."));
    let finalized_wav_path = scratch_dir.join(format!("{}.wav", session.session_id));

    let spec = WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::create(&finalized_wav_path, spec).map_err(|e| e.to_string())?;
    for sample in mono_16k_samples {
        writer.write_sample(sample).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;

    // 4. Update manifest to finalized
    let final_manifest = SessionManifest {
        sessionId: session.session_id.clone(),
        canvasPageId: session.canvas_page_id,
        startedAtEpochMs: session.started_at_ms,
        lastFlushedAtEpochMs: now_epoch_ms(),
        totalPausedDurationMs: session.total_paused_ms,
        isFinalized: true,
        sampleRate: 16000,
        channels: 1,
    };

    if let Ok(json) = serde_json::to_string_pretty(&final_manifest) {
        let _ = std::fs::write(&session.meta_path, json);
    }

    // Clean up scratch PCM file
    let _ = std::fs::remove_file(&session.pcm_path);

    // Return Base64 encoded 16kHz WAV
    let wav_bytes = std::fs::read(&finalized_wav_path).map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&wav_bytes);

    Ok(b64)
}

/**
 * Boot-Time Orphan Session Recovery (Phase 2.4)
 * Scans audio_scratch/ for unfinalized manifests, reconstructs WAV containers,
 * re-links session metadata to target canvas pages, and emits recovery events to UI.
 */
pub fn recover_orphan_sessions(app: &AppHandle) {
    let scratch_dir = get_audio_scratch_dir(app);
    let entries = match std::fs::read_dir(&scratch_dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json")
            && path.to_string_lossy().ends_with(".meta.json")
        {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(mut manifest) = serde_json::from_str::<SessionManifest>(&content) {
                    if !manifest.isFinalized {
                        let pcm_path = scratch_dir.join(format!("{}.pcm", manifest.sessionId));
                        if pcm_path.exists() {
                            if let Ok(mut f) = File::open(&pcm_path) {
                                let mut pcm_bytes = Vec::new();
                                if f.read_to_end(&mut pcm_bytes).is_ok() && !pcm_bytes.is_empty() {
                                    let float_count = pcm_bytes.len() / std::mem::size_of::<f32>();
                                    let float_slice: &[f32] = unsafe {
                                        std::slice::from_raw_parts(
                                            pcm_bytes.as_ptr() as *const f32,
                                            float_count,
                                        )
                                    };

                                    let rate = if manifest.sampleRate > 0 { manifest.sampleRate } else { 48000 };
                                    let chans = if manifest.channels > 0 { manifest.channels } else { 1 };
                                    let mono_16k = resample_to_16k_mono(float_slice, rate, chans);

                                    let recovered_wav_path = scratch_dir.join(format!("{}_recovered.wav", manifest.sessionId));
                                    let spec = WavSpec {
                                        channels: 1,
                                        sample_rate: 16000,
                                        bits_per_sample: 16,
                                        sample_format: hound::SampleFormat::Int,
                                    };

                                    if let Ok(mut writer) = WavWriter::create(&recovered_wav_path, spec) {
                                        for s in mono_16k {
                                            let _ = writer.write_sample(s);
                                        }
                                        let _ = writer.finalize();

                                        if let Ok(wav_bytes) = std::fs::read(&recovered_wav_path) {
                                            let b64 = general_purpose::STANDARD.encode(&wav_bytes);

                                            // Mark manifest as finalized & cleanup scratch PCM
                                            manifest.isFinalized = true;
                                            if let Ok(new_json) = serde_json::to_string_pretty(&manifest) {
                                                let _ = std::fs::write(&path, new_json);
                                            }
                                            let _ = std::fs::remove_file(&pcm_path);

                                            // Emit recovery event to UI
                                            let payload = RecoveredSessionPayload {
                                                sessionId: manifest.sessionId.clone(),
                                                canvasPageId: manifest.canvasPageId.clone(),
                                                startedAtEpochMs: manifest.startedAtEpochMs,
                                                recoveredFilePath: recovered_wav_path.to_string_lossy().to_string(),
                                                audioBase64: b64,
                                            };

                                            let _ = app.emit("audio-session-recovered", payload);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
