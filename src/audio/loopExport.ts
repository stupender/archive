/**
 * Soundscape bridge — render a trimmed Multi-Track loop to a self-contained WAV
 * and ship it (plus a JSON sidecar) to the shared iCloud folder, where
 * Soundscape's inbox picks it up. See Soundscape's Docs/BRIDGE.md for the
 * shared contract.
 *
 * Rendering happens entirely in the renderer via OfflineAudioContext — no
 * ffmpeg, no new dependency. The in/out points, playback rate, and reverse are
 * all *baked* into the WAV so the file is authoritative on the Soundscape side.
 */
import type { Track } from '../../shared/types';

export interface LoopExportOptions {
  track: Track;
  /** media:// URL the renderer can fetch (window.sonic.toMediaUrl(path)). */
  mediaUrl: string;
  loopStart: number;   // seconds into the source
  loopEnd: number;     // seconds into the source
  playbackRate: number;
  reversed: boolean;
}

/** Decode → trim → (rate/reverse) → encode WAV → hand to main for writing. */
export async function exportLoopToSoundscape(opts: LoopExportOptions): Promise<{ folder: string; filename: string }> {
  const { track, mediaUrl, loopStart, loopEnd, playbackRate, reversed } = opts;

  // 1. Decode the source file.
  const resp = await fetch(mediaUrl);
  if (!resp.ok) throw new Error(`Couldn't read audio (status ${resp.status})`);
  const arr = await resp.arrayBuffer();
  const decodeCtx = new OfflineAudioContext(1, 1, 44100);
  const decoded = await decodeCtx.decodeAudioData(arr);

  // 2. Resolve the region (whole file if no valid region given).
  const start = Math.max(0, Math.min(decoded.duration, loopStart || 0));
  const end = loopEnd && loopEnd > start ? Math.min(decoded.duration, loopEnd) : decoded.duration;
  const regionDur = Math.max(0.01, end - start);
  const outDur = regionDur / Math.max(0.01, playbackRate);

  const sampleRate = decoded.sampleRate;
  const channels = decoded.numberOfChannels;
  const ctx = new OfflineAudioContext(channels, Math.ceil(outDur * sampleRate), sampleRate);

  // 3. Build a buffer of just the region (so we can reverse it cleanly).
  const regionFrames = Math.floor(regionDur * sampleRate);
  const startFrame = Math.floor(start * sampleRate);
  const region = ctx.createBuffer(channels, regionFrames, sampleRate);
  for (let c = 0; c < channels; c++) {
    const src = decoded.getChannelData(c).subarray(startFrame, startFrame + regionFrames);
    const dst = region.getChannelData(c);
    if (reversed) {
      for (let i = 0; i < regionFrames; i++) dst[i] = src[regionFrames - 1 - i] ?? 0;
    } else {
      dst.set(src);
    }
  }

  // 4. Play it through the offline context at the chosen rate.
  const node = ctx.createBufferSource();
  node.buffer = region;
  node.playbackRate.value = playbackRate;
  node.connect(ctx.destination);
  node.start();
  const rendered = await ctx.startRendering();

  // 5. Encode 16-bit PCM WAV.
  const wav = encodeWav(rendered);

  // 6. Sidecar (SoundscapeLoop/1).
  const name = `${track.title || 'Loop'}${reversed ? ' (rev)' : ''}`;
  const sidecar = {
    schema: 'soundscape.loop/1',
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    audioFile: '',                       // filled by main after de-duping
    duration: rendered.duration,
    sampleRate,
    render: { loopStart: start, loopEnd: end, playbackRate, reversed },
    sourceRef: {
      title: track.title,
      artist: track.artist,
      originalPath: track.path,
      bpm: track.bpm,
      musicalKey: track.musicalKey,
      archiveTrackId: track.id,
    },
  };

  const baseName = `${new Date().toISOString().slice(0, 10)} ${name}`;
  const result = await window.sonic.exportLoopToSoundscape({
    baseName,
    wav,
    sidecar: JSON.stringify({ ...sidecar, audioFile: baseName + '.wav' }, null, 2),
  });
  return result;
}

/** Minimal 16-bit PCM WAV encoder for an AudioBuffer. */
function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);             // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave + clamp to 16-bit.
  let offset = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}
