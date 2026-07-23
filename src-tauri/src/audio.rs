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
    
    // System Loopback (Output)
    let out_device = host.default_output_device().ok_or("No output device available")?;
    let out_cfg = out_device.default_output_config().map_err(|e| e.to_string())?;
    let out_sample_format = out_cfg.sample_format();
    let out_config: cpal::StreamConfig = out_cfg.into();
    *OUT_CONFIG.lock().unwrap() = Some(out_config.clone());

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
        ),
        _ => return Err("Unsupported out sample format".to_string()),
    }.map_err(|e| e.to_string())?;
    
    out_stream.play().map_err(|e| e.to_string())?;
    *OUT_STREAM.lock().unwrap() = StreamWrapper(Some(out_stream));

    // Microphone (Input)
    if let Some(in_device) = host.default_input_device() {
        if let Ok(in_cfg) = in_device.default_input_config() {
            let in_sample_format = in_cfg.sample_format();
            let in_config: cpal::StreamConfig = in_cfg.into();
            *IN_CONFIG.lock().unwrap() = Some(in_config.clone());

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
                ),
                _ => return Err("Unsupported in sample format".to_string()),
            };
            
            if let Ok(stream) = in_stream {
                let _ = stream.play();
                *IN_STREAM.lock().unwrap() = StreamWrapper(Some(stream));
            }
        }
    }

    Ok("Recording started".to_string())
}

#[tauri::command]
pub fn stop_recording() -> Result<String, String> {
    if let Some(stream) = OUT_STREAM.lock().unwrap().0.take() { drop(stream); }
    if let Some(stream) = IN_STREAM.lock().unwrap().0.take() { drop(stream); }

    let out_buf = OUT_BUFFER.lock().unwrap().clone();
    let in_buf = IN_BUFFER.lock().unwrap().clone();
    
    let out_cfg = OUT_CONFIG.lock().unwrap().clone().ok_or("No out config")?;
    let in_cfg = IN_CONFIG.lock().unwrap().clone();

    // The target config will be the output (system) config
    let target_channels = out_cfg.channels as usize;
    let target_rate = out_cfg.sample_rate.0 as f32;

    let mut mixed_buf = out_buf.clone();

    if let Some(cfg) = in_cfg {
        let src_channels = cfg.channels as usize;
        let src_rate = cfg.sample_rate.0 as f32;
        let ratio = src_rate / target_rate;

        // Ensure we calculate frames properly to avoid out of bounds panic
        let src_frames = if src_channels > 0 { in_buf.len() / src_channels } else { 0 };
        let target_frames = if target_channels > 0 { out_buf.len() / target_channels } else { 0 };
        
        let frames_to_mix = target_frames;

        for i in 0..frames_to_mix {
            let src_idx_f = i as f32 * ratio;
            let src_idx = src_idx_f.floor() as usize;
            
            if src_idx >= src_frames.saturating_sub(1) {
                break; // end of mic buffer
            }
            
            let frac = src_idx_f - src_idx as f32;

            for ch in 0..target_channels {
                // if mic is mono, use channel 0, else match channel or modulo
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
        channels: out_cfg.channels as u16,
        sample_rate: out_cfg.sample_rate.0 as u32,
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
