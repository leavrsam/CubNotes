/**
 * Universal Gemini Audio MIME Type Normalizer
 * Google Gemini strictly accepts:
 * - audio/wav
 * - audio/mp3
 * - audio/aiff
 * - audio/aac
 * - audio/ogg
 * - audio/flac
 * - audio/mp4
 * - audio/webm
 * 
 * Non-standard types like audio/x-m4a or audio/webm;codecs=opus cause Gemini API 400 errors.
 */
export function normalizeGeminiAudioMimeType(mime?: string, filenameOrUrl?: string): string {
  // 1. Check file extension first (often more reliable than browser/OS guessed MIME)
  if (filenameOrUrl) {
    const cleanUrl = filenameOrUrl.split('?')[0].split('#')[0];
    const ext = cleanUrl.split('.').pop()?.toLowerCase();
    if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
    if (ext === 'aac') return 'audio/aac';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'mp3') return 'audio/mp3';
    if (ext === 'ogg' || ext === 'oga') return 'audio/ogg';
    if (ext === 'flac') return 'audio/flac';
    if (ext === 'webm') return 'audio/webm';
    if (ext === 'aif' || ext === 'aiff') return 'audio/aiff';
  }

  // 2. Strip parameters like ;codecs=opus
  let raw = (mime || '').split(';')[0].trim().toLowerCase();

  // 3. Normalization mapping
  if (raw === 'audio/x-m4a' || raw === 'audio/m4a' || raw === 'audio/mp4a-latm') {
    return 'audio/mp4';
  }
  if (raw === 'audio/mpeg' || raw === 'audio/mp3') {
    return 'audio/mp3';
  }
  if (raw === 'audio/wave' || raw === 'audio/x-wav' || raw === 'audio/vnd.wave') {
    return 'audio/wav';
  }
  if (raw === 'audio/ogg' || raw === 'audio/opus' || raw === 'application/ogg') {
    return 'audio/ogg';
  }
  if (raw === 'audio/x-flac' || raw === 'audio/flac') {
    return 'audio/flac';
  }
  if (raw === 'audio/aac' || raw === 'audio/x-aac') {
    return 'audio/aac';
  }
  if (raw === 'audio/webm') {
    return 'audio/webm';
  }
  if (raw === 'audio/mp4') {
    return 'audio/mp4';
  }

  // Fallback to audio/mp4 (universal standard for AAC/m4a/native recordings)
  return raw || 'audio/mp4';
}
