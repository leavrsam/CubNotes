use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Stream;
use hound::{WavSpec, WavWriter};
use std::sync::Mutex;
use base64::{Engine as _, engine::general_purpose};

struct StreamWrapper(Option<Stream>);
unsafe impl Send for StreamWrapper {}
unsafe impl Sync for StreamWrapper {}

lazy_static::lazy_static! {
    static ref OUT_STREAM: Mutex<StreamWrapper> = Mutex::new(StreamWrapper(None));
    static ref IN_STREAM: Mutex<StreamWrapper> = Mutex::new(StreamWrapper(None));
    static ref OUT_BUFFER: Mutex<Vec<f32>> = Mutex::new(Vec::new());
    static ref IN_BUFFER: Mutex<Vec<f32>> = Mutex::new(Vec::new());
    static ref OUT_CONFIG: Mutex<Option<cpal::StreamConfig>> = Mutex::new(None);
    static ref IN_CONFIG: Mutex<Option<cpal::StreamConfig>> = Mutex::new(None);
}

#[tauri::command]
pub fn start_recording() -> Result<String, String> {
    let host = cpal::default_host();
    
    OUT_BUFFER.lock().unwrap().clear();
    IN_BUFFER.lock().unwrap().clear();
    *OUT_CONFIG.lock().unwrap() = None;
    *IN_CONFIG.lock().unwrap() = None;
    
    let mut started_any = false;

    // 1. Try System Loopback (Output capture on supported platforms like Windows)
    if let Some(out_device) = host.default_output_device() {
        if let Ok(out_cfg) = out_device.default_output_config() {
            let out_sample_format = out_cfg.sample_format();
            let out_config: cpal::StreamConfig = out_cfg.into();

            let out_stream = match out_sample_format {
                cpal::SampleFormat::F32 => out_device.build_input_stream(
                    &out_config,
                    move |data: &[f32], _: &_| {
                        if let Ok(mut buf) = OUT_BUFFER.lock() {
                            buf.extend_from_slice(data);
                        }
                    },
                    |err| eprintln!("out stream error: {}", err),
                    None,
                ).ok(),
                _ => None,
            };

            if let Some(stream) = out_stream {
                if stream.play().is_ok() {
                    *OUT_CONFIG.lock().unwrap() = Some(out_config);
                    *OUT_STREAM.lock().unwrap() = StreamWrapper(Some(stream));
                    started_any = true;
                }
            }
        }
    }

    // 2. Microphone (Input capture on all platforms)
    if let Some(in_device) = host.default_input_device() {
        if let Ok(in_cfg) = in_device.default_input_config() {
            let in_sample_format = in_cfg.sample_format();
            let in_config: cpal::StreamConfig = in_cfg.into();

            let in_stream = match in_sample_format {
                cpal::SampleFormat::F32 => in_device.build_input_stream(
                    &in_config,
                    move |data: &[f32], _: &_| {
                        if let Ok(mut buf) = IN_BUFFER.lock() {
                            buf.extend_from_slice(data);
                        }
                    },
                    |err| eprintln!("in stream error: {}", err),
                    None,
                ).ok(),
                _ => None,
            };
            
            if let Some(stream) = in_stream {
                if stream.play().is_ok() {
                    *IN_CONFIG.lock().unwrap() = Some(in_config);
                    *IN_STREAM.lock().unwrap() = StreamWrapper(Some(stream));
                    started_any = true;
                }
            }
        }
    }

    if started_any {
        Ok("Recording started".to_string())
    } else {
        Err("No audio recording device available".to_string())
    }
}

#[tauri::command]
pub fn stop_recording() -> Result<String, String> {
    if let Some(stream) = OUT_STREAM.lock().unwrap().0.take() { drop(stream); }
    if let Some(stream) = IN_STREAM.lock().unwrap().0.take() { drop(stream); }

    let out_buf = OUT_BUFFER.lock().unwrap().clone();
    let in_buf = IN_BUFFER.lock().unwrap().clone();
    
    let out_cfg = OUT_CONFIG.lock().unwrap().clone();
    let in_cfg = IN_CONFIG.lock().unwrap().clone();

    // Pick whichever config is active
    let active_cfg = out_cfg.clone().or(in_cfg.clone()).ok_or("No audio recorded")?;

    let target_channels = active_cfg.channels as usize;
    let target_rate = active_cfg.sample_rate.0 as f32;

    let mut mixed_buf = if !out_buf.is_empty() {
        out_buf.clone()
    } else {
        in_buf.clone()
    };

    // If both out and in buffers have audio, mix mic into output
    if !out_buf.is_empty() && !in_buf.is_empty() && in_cfg.is_some() {
        let cfg = in_cfg.unwrap();
        let src_channels = cfg.channels as usize;
        let src_rate = cfg.sample_rate.0 as f32;
        let ratio = src_rate / target_rate;

        let src_frames = if src_channels > 0 { in_buf.len() / src_channels } else { 0 };
        let target_frames = if target_channels > 0 { mixed_buf.len() / target_channels } else { 0 };
        let frames_to_mix = target_frames;

        for i in 0..frames_to_mix {
            let src_idx_f = i as f32 * ratio;
            let src_idx = src_idx_f.floor() as usize;
            
            if src_idx >= src_frames.saturating_sub(1) {
                break;
            }
            
            let frac = src_idx_f - src_idx as f32;

            for ch in 0..target_channels {
                let s_ch = ch % src_channels;
                let s1 = in_buf[src_idx * src_channels + s_ch];
                let s2 = in_buf[(src_idx + 1) * src_channels + s_ch];
                let interpolated = s1 + (s2 - s1) * frac;
                mixed_buf[i * target_channels + ch] += interpolated;
            }
        }
    }

    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join("meeting_capture.wav").to_string_lossy().to_string();

    let spec = WavSpec {
        channels: active_cfg.channels as u16,
        sample_rate: active_cfg.sample_rate.0 as u32,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let mut writer = WavWriter::create(&file_path, spec).map_err(|e| e.to_string())?;
    for sample in mixed_buf {
        writer.write_sample(sample).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;

    let bytes = std::fs::read(&file_path).map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    
    Ok(b64)
}
