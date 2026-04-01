import { packHeader, generateSessionId } from "./header.js";
import { encodePNG } from "./png.js";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const BYTES_PER_PIXEL = 3;

function estimateImageSize(fileSize) {
  const headerOverhead = 80;
  const totalBytes = fileSize + headerOverhead;
  const pixelCount = Math.ceil(totalBytes / BYTES_PER_PIXEL);
  const side = Math.ceil(Math.sqrt(pixelCount));
  return {
    rawBytes: totalBytes,
    pixels: side * side,
    width: side,
    height: side,
    estimatedPngBytes: totalBytes + Math.ceil(totalBytes * 0.05) + 1024
  };
}

function calculateChunkCount(fileSize) {
  const headerOverhead = 80;
  const usablePerChunk = MAX_IMAGE_BYTES - headerOverhead;
  if (fileSize + headerOverhead <= MAX_IMAGE_BYTES) {
    return 1;
  }
  return Math.ceil(fileSize / usablePerChunk);
}

async function encodeAudioToImages(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBytes = new Uint8Array(arrayBuffer);
  const totalSize = audioBytes.length;
  const chunkCount = calculateChunkCount(totalSize);
  const sessionId = generateSessionId();
  const results = [];

  const chunkDataMax = Math.ceil(totalSize / chunkCount);

  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkDataMax;
    const end = Math.min(start + chunkDataMax, totalSize);
    const chunkData = audioBytes.slice(start, end);

    const header = packHeader(
      file.name,
      file.type,
      totalSize,
      i,
      chunkCount,
      sessionId,
      chunkData.length
    );

    const combined = new Uint8Array(header.length + chunkData.length);
    combined.set(header, 0);
    combined.set(chunkData, header.length);

    const pixelCount = Math.ceil(combined.length / BYTES_PER_PIXEL);
    const side = Math.ceil(Math.sqrt(pixelCount));

    const pngBytes = await encodePNG(combined, side, side);
    const blob = new Blob([pngBytes], { type: "image/png" });
    const dataUrl = URL.createObjectURL(blob);

    results.push({
      dataUrl,
      blob,
      width: side,
      height: side,
      chunkIndex: i,
      totalChunks: chunkCount,
      originalSize: totalSize,
      chunkSize: chunkData.length
    });

    if (onProgress) {
      onProgress((i + 1) / chunkCount);
    }
  }

  return results;
}

export { encodeAudioToImages, estimateImageSize, calculateChunkCount };
