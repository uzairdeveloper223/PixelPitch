import { unpackHeader, sessionIdToHex } from "./header.js";
import { decodePNG } from "./png.js";

async function parseChunkFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pngData = new Uint8Array(arrayBuffer);
  const { rgbBytes } = await decodePNG(pngData);
  const header = unpackHeader(rgbBytes);

  const audioStart = header.headerLength;
  const audioEnd = audioStart + header.chunkDataSize;
  const chunkAudio = rgbBytes.slice(audioStart, audioEnd);

  return {
    header,
    audioData: chunkAudio,
    sessionHex: sessionIdToHex(header.sessionId)
  };
}

async function decodeImagesToAudio(files) {
  const chunks = [];

  for (const file of files) {
    const parsed = await parseChunkFromFile(file);
    chunks.push(parsed);
  }

  if (chunks.length === 0) {
    throw new Error("No valid PixelPitch images found");
  }

  const sessionGroups = new Map();
  for (const chunk of chunks) {
    const key = chunk.sessionHex;
    if (!sessionGroups.has(key)) {
      sessionGroups.set(key, []);
    }
    sessionGroups.get(key).push(chunk);
  }

  if (sessionGroups.size > 1) {
    throw new Error(
      "Multiple sessions detected. Upload images from the same encoding session only."
    );
  }

  const group = chunks;
  const firstHeader = group[0].header;
  const expectedTotal = firstHeader.totalChunks;

  if (group.length !== expectedTotal) {
    throw new Error(
      `Expected ${expectedTotal} image(s) but received ${group.length}. Upload all parts.`
    );
  }

  group.sort((a, b) => a.header.chunkIndex - b.header.chunkIndex);

  for (let i = 0; i < group.length; i++) {
    if (group[i].header.chunkIndex !== i) {
      throw new Error(
        `Missing chunk ${i}. Upload all ${expectedTotal} parts.`
      );
    }
  }

  let totalAudioLen = 0;
  for (const chunk of group) {
    totalAudioLen += chunk.audioData.length;
  }

  const totalExpected = firstHeader.totalFileSize;
  if (totalAudioLen !== totalExpected) {
    throw new Error(
      `Reconstructed size (${totalAudioLen}) doesn't match expected (${totalExpected}). Images may be corrupted.`
    );
  }

  const fullAudio = new Uint8Array(totalAudioLen);
  let writeOffset = 0;
  for (const chunk of group) {
    fullAudio.set(chunk.audioData, writeOffset);
    writeOffset += chunk.audioData.length;
  }

  const blob = new Blob([fullAudio], { type: firstHeader.mimeType });

  return {
    blob,
    filename: firstHeader.filename,
    mimeType: firstHeader.mimeType,
    totalSize: totalExpected,
    chunkCount: expectedTotal
  };
}

export { decodeImagesToAudio, parseChunkFromFile };
