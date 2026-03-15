/**
 * Patches the MP4 tkhd rotation matrix in an exported copy of a vault video.
 *
 * Strategy:
 *  1. Read full source file as base64 (one native I/O, no JS data loops on the full file).
 *  2. Scan only the first / last 100 KB chunk to find the tkhd matrix byte offset.
 *  3. Decode and patch only the 3-byte-aligned window (~38 bytes) around the matrix.
 *  4. Splice the patched window back into the base64 string using native string ops.
 *  5. Write the complete modified base64 to destUri (one native I/O write).
 *
 * No O(fileSize) JS loops — only two O(100 KB) loops for the chunk scans.
 * The full file is never held in a Uint8Array; base64 string slicing is done
 * natively by the JS engine and avoids the main perf bottleneck of the old approach.
 */

import * as FileSystem from 'expo-file-system/legacy';

const CHUNK = 100 * 1024; // 100 KB — enough for any typical moov header

const TKHD_MATRICES: Record<number, number[]> = {
  0:   [0x00010000, 0x00000000, 0x00000000,
        0x00000000, 0x00010000, 0x00000000,
        0x00000000, 0x00000000, 0x40000000],
  90:  [0x00000000, 0x00010000, 0x00000000,
        0xFFFF0000, 0x00000000, 0x00000000,
        0x00000000, 0x00000000, 0x40000000],
  180: [0xFFFF0000, 0x00000000, 0x00000000,
        0x00000000, 0xFFFF0000, 0x00000000,
        0x00000000, 0x00000000, 0x40000000],
  270: [0x00000000, 0xFFFF0000, 0x00000000,
        0x00010000, 0x00000000, 0x00000000,
        0x00000000, 0x00000000, 0x40000000],
};

// ── binary helpers ────────────────────────────────────────────────────────────

function r32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function w32(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >>> 24) & 0xff; b[o+1] = (v >>> 16) & 0xff;
  b[o+2] = (v >>> 8) & 0xff; b[o+3] = v & 0xff;
}
function fourcc(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o], b[o+1], b[o+2], b[o+3]);
}
function findBox(b: Uint8Array, start: number, end: number, type: string): number {
  let o = start;
  while (o + 8 <= end) {
    const size = r32(b, o);
    if (size < 8) break;
    if (fourcc(b, o + 4) === type) return o;
    o += size;
  }
  return -1;
}

/**
 * Maps a tkhd matrix back to the rotation angle it represents (0 / 90 / 180 / 270).
 * Reads the first two values (a, b) of the matrix stored at `offset` inside `bytes`.
 */
function matrixToRotation(bytes: Uint8Array, offset: number): number {
  const a = r32(bytes, offset);         // matrix[0,0] in 16.16 fixed-point
  const b = r32(bytes, offset + 4);     // matrix[0,1] in 16.16 fixed-point
  if (a === 0x00010000 && b === 0x00000000) return 0;
  if (a === 0x00000000 && b === 0x00010000) return 90;
  if (a === 0xFFFF0000 && b === 0x00000000) return 180;
  if (a === 0x00000000 && b === 0xFFFF0000) return 270;
  return 0; // unrecognised — treat as identity
}

/** Returns the tkhd matrix offset within the supplied byte chunk, or -1. */
function matrixOffsetInChunk(bytes: Uint8Array): number {
  const moov = findBox(bytes, 0, bytes.length, 'moov');
  if (moov < 0) return -1;
  const moovEnd = Math.min(moov + r32(bytes, moov), bytes.length);
  const trak = findBox(bytes, moov + 8, moovEnd, 'trak');
  if (trak < 0) return -1;
  const trakEnd = Math.min(trak + r32(bytes, trak), bytes.length);
  const tkhd = findBox(bytes, trak + 8, trakEnd, 'tkhd');
  if (tkhd < 0) return -1;
  const version = bytes[tkhd + 8];
  const bodyOffset = version === 0
    ? 4 + 4 + 4 + 4 + 4 + 4 + 8 + 2 + 2 + 2 + 2  // = 40
    : 4 + 8 + 8 + 4 + 4 + 8 + 8 + 2 + 2 + 2 + 2; // = 52
  return tkhd + 8 + bodyOffset;
}

// ── base64 helpers ────────────────────────────────────────────────────────────

/** Decode a (possibly unpadded) base64 string to bytes. */
function b64ToBytes(b64: string): Uint8Array {
  const pad = (4 - (b64.length % 4)) % 4;
  const raw = atob(b64 + '==='.slice(0, pad));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// ── public API ────────────────────────────────────────────────────────────────

export async function applyVideoRotationForExport(
  sourceUri: string,
  rotation: number,
  destUri: string,
): Promise<void> {
  if (!rotation) {
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    return;
  }

  // Read entire source file as base64 — one native I/O, no JS data processing yet.
  const fullB64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Approximate byte size from base64 length.
  const approxSize = Math.floor(fullB64.length / 4) * 3;

  // Scan first 100 KB to find the matrix offset (iOS / faststart MP4: moov at start).
  const firstChunkChars = Math.floor(CHUNK / 3) * 4;
  const firstChunk = b64ToBytes(fullB64.slice(0, Math.min(firstChunkChars, fullB64.length)));
  let matrixOffset = matrixOffsetInChunk(firstChunk);

  if (matrixOffset < 0 && approxSize > CHUNK) {
    // moov at end — typical Android MediaRecorder output.
    const lastByteStart = approxSize - CHUNK;
    const lastB64Start = Math.floor(lastByteStart / 3) * 4;
    const lastChunk = b64ToBytes(fullB64.slice(lastB64Start));
    const offsetInChunk = matrixOffsetInChunk(lastChunk);
    if (offsetInChunk >= 0) matrixOffset = lastByteStart + offsetInChunk;
  }

  if (matrixOffset < 0) {
    // tkhd not found — copy as-is.
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    return;
  }

  // Find the 3-byte-aligned window. We need the 36-byte matrix AND the following 8 bytes
  // (width and height), so we target 44 bytes from the matrix offset.
  const alignedStart = Math.floor(matrixOffset / 3) * 3;
  const alignedEnd   = Math.ceil((matrixOffset + 44) / 3) * 3;
  const b64Start = (alignedStart / 3) * 4;
  const b64End   = (alignedEnd   / 3) * 4;

  // Decode only the small window around the matrix.
  const window = b64ToBytes(fullB64.slice(b64Start, b64End));
  const offsetInWindow = matrixOffset - alignedStart;

  // Read the file's existing tkhd rotation and COMPOSE it with the user's
  // requested rotation rather than replacing it outright.
  // This ensures that a portrait-recorded video (native tkhd = 90°) plus a
  // user rotation of 90° produces a final tkhd of 180°, not 90°.
  const existingRotation = matrixToRotation(window, offsetInWindow);
  const totalRotation = (existingRotation + rotation) % 360;

  // Also read the track width and height from immediately after the matrix
  // so we can properly translate the video back into the visible coordinate space.
  const trackWidth = r32(window, offsetInWindow + 36);
  const trackHeight = r32(window, offsetInWindow + 40);

  const matrix = [...(TKHD_MATRICES[totalRotation] ?? TKHD_MATRICES[0])];
  if (totalRotation === 90) {
    matrix[6] = trackHeight;
  } else if (totalRotation === 180) {
    matrix[6] = trackWidth;
    matrix[7] = trackHeight;
  } else if (totalRotation === 270) {
    matrix[7] = trackWidth;
  }

  for (let i = 0; i < 9; i++) w32(window, offsetInWindow + i * 4, matrix[i]);

  // Splice patched window back — native string concat, no full-file JS loop.
  const patchedB64 = fullB64.slice(0, b64Start) + bytesToB64(window) + fullB64.slice(b64End);

  await FileSystem.writeAsStringAsync(destUri, patchedB64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
