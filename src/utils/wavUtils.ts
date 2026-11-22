export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface WavChunkInfo {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  pcmData: Uint8Array;
}

export function parseWavBytes(bytes: Uint8Array): WavChunkInfo {
  if (bytes.length < 44) {
    return {
      sampleRate: 24000,
      numChannels: 1,
      bitsPerSample: 16,
      pcmData: bytes,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff =
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF";
  if (!riff) {
    return {
      sampleRate: 24000,
      numChannels: 1,
      bitsPerSample: 16,
      pcmData: bytes,
    };
  }

  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = 44;
  let dataLength = bytes.length - 44;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt " && offset + 8 + 16 <= bytes.length) {
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataLength = Math.min(chunkSize, bytes.length - dataOffset);
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    pcmData: bytes.subarray(dataOffset, dataOffset + dataLength),
  };
}

export function getWavDurationSeconds(bytes: Uint8Array): number {
  const info = parseWavBytes(bytes);
  const byteRate =
    info.sampleRate * info.numChannels * (info.bitsPerSample / 8);
  if (!byteRate) return 0;
  return info.pcmData.byteLength / byteRate;
}

export function stitchWavBuffers(wavByteArrays: Uint8Array[]): Blob {
  if (wavByteArrays.length === 0) {
    return new Blob([], { type: "audio/wav" });
  }

  const parsed = wavByteArrays.map(parseWavBytes);
  const { sampleRate, numChannels, bitsPerSample } = parsed[0];
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // Insert 0.35s of clean digital silence between chapters for natural lesson pacing
  const pauseSamples = Math.floor(sampleRate * 0.35);
  const pauseBytesLength = pauseSamples * blockAlign;

  let totalPcmBytes = 0;
  for (let i = 0; i < parsed.length; i++) {
    totalPcmBytes += parsed[i].pcmData.byteLength;
    if (i < parsed.length - 1) {
      totalPcmBytes += pauseBytesLength;
    }
  }

  const output = new Uint8Array(44 + totalPcmBytes);
  const view = new DataView(output.buffer);

  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      output[pos + i] = str.charCodeAt(i);
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + totalPcmBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, totalPcmBytes, true);

  let writeOffset = 44;
  for (let i = 0; i < parsed.length; i++) {
    output.set(parsed[i].pcmData, writeOffset);
    writeOffset += parsed[i].pcmData.byteLength;
    if (i < parsed.length - 1) {
      // Zeroed silence gap already initialized in Uint8Array
      writeOffset += pauseBytesLength;
    }
  }

  return new Blob([output], { type: "audio/wav" });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Ensures bytes have a valid 44-byte RIFF/WAVE header (wraps raw 24kHz mono 16-bit PCM if missing).
 */
export function ensureWavBytes(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length >= 44 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF"
  ) {
    return bytes;
  }

  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataLen = bytes.byteLength;

  const output = new Uint8Array(44 + dataLen);
  const view = new DataView(output.buffer);

  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      output[pos + i] = str.charCodeAt(i);
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  output.set(bytes, 44);
  return output;
}

/**
 * Splits a long script into TTS-safe chunks (<= maxChars) along line/sentence boundaries.
 */
export function splitScriptIntoTtsChunks(
  script: string,
  maxChars = 3500
): string[] {
  const clean = script.trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const lines = clean
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = "";
    }
  };

  for (const line of lines) {
    if (line.length > maxChars) {
      pushCurrent();
      // Split oversized line by sentences or words
      const sentences = line.split(/(?<=[.!?؟،])\s+/);
      let sub = "";
      for (const s of sentences) {
        if ((sub ? `${sub} ${s}` : s).length <= maxChars) {
          sub = sub ? `${sub} ${s}` : s;
        } else {
          if (sub) chunks.push(sub.trim());
          if (s.length <= maxChars) {
            sub = s;
          } else {
            // Hard split by words
            const words = s.split(/\s+/);
            let wBuf = "";
            for (const w of words) {
              if ((wBuf ? `${wBuf} ${w}` : w).length <= maxChars) {
                wBuf = wBuf ? `${wBuf} ${w}` : w;
              } else {
                if (wBuf) chunks.push(wBuf.trim());
                wBuf = w;
              }
            }
            sub = wBuf;
          }
        }
      }
      if (sub) chunks.push(sub.trim());
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      pushCurrent();
      current = line;
    }
  }

  pushCurrent();
  return chunks;
}

