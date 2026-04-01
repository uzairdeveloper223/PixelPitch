const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBytes = new Uint8Array([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3)
  ]);
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);

  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput), false);

  return chunk;
}

function makeIHDR(width, height) {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  data[8] = 8;
  data[9] = 2;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return makeChunk("IHDR", data);
}

async function deflateCompress(raw) {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(raw);
  writer.close();

  const parts = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }

  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

async function deflateDecompress(compressed) {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  writer.write(compressed);
  writer.close();

  const parts = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }

  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

async function encodePNG(rgbBytes, width, height) {
  const rowStride = 1 + width * 3;
  const rawPixels = new Uint8Array(height * rowStride);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawPixels[rowOffset] = 0;

    for (let x = 0; x < width; x++) {
      const pixelIdx = y * width + x;
      const srcOffset = pixelIdx * 3;
      const dstOffset = rowOffset + 1 + x * 3;

      rawPixels[dstOffset] = srcOffset < rgbBytes.length
        ? rgbBytes[srcOffset] : 0;
      rawPixels[dstOffset + 1] = srcOffset + 1 < rgbBytes.length
        ? rgbBytes[srcOffset + 1] : 0;
      rawPixels[dstOffset + 2] = srcOffset + 2 < rgbBytes.length
        ? rgbBytes[srcOffset + 2] : 0;
    }
  }

  const compressed = await deflateCompress(rawPixels);

  const ihdr = makeIHDR(width, height);
  const idat = makeChunk("IDAT", compressed);
  const iend = makeChunk("IEND", new Uint8Array(0));

  const totalLen = PNG_SIGNATURE.length + ihdr.length
    + idat.length + iend.length;
  const png = new Uint8Array(totalLen);
  let offset = 0;
  png.set(PNG_SIGNATURE, offset); offset += PNG_SIGNATURE.length;
  png.set(ihdr, offset); offset += ihdr.length;
  png.set(idat, offset); offset += idat.length;
  png.set(iend, offset);

  return png;
}

function parseChunks(pngData) {
  for (let i = 0; i < 8; i++) {
    if (pngData[i] !== PNG_SIGNATURE[i]) {
      throw new Error("Invalid PNG signature");
    }
  }

  const chunks = [];
  let offset = 8;
  const view = new DataView(
    pngData.buffer, pngData.byteOffset, pngData.byteLength
  );

  while (offset < pngData.length) {
    const length = view.getUint32(offset, false);
    offset += 4;

    const type = String.fromCharCode(
      pngData[offset], pngData[offset + 1],
      pngData[offset + 2], pngData[offset + 3]
    );
    offset += 4;

    const data = pngData.slice(offset, offset + length);
    offset += length;

    offset += 4;

    chunks.push({ type, data });
    if (type === "IEND") break;
  }

  return chunks;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterRow(filterType, current, previous, bpp) {
  const result = new Uint8Array(current.length);

  switch (filterType) {
    case 0:
      result.set(current);
      break;

    case 1:
      for (let i = 0; i < current.length; i++) {
        const left = i >= bpp ? result[i - bpp] : 0;
        result[i] = (current[i] + left) & 0xFF;
      }
      break;

    case 2:
      for (let i = 0; i < current.length; i++) {
        const above = previous ? previous[i] : 0;
        result[i] = (current[i] + above) & 0xFF;
      }
      break;

    case 3:
      for (let i = 0; i < current.length; i++) {
        const left = i >= bpp ? result[i - bpp] : 0;
        const above = previous ? previous[i] : 0;
        result[i] = (current[i] + Math.floor((left + above) / 2)) & 0xFF;
      }
      break;

    case 4:
      for (let i = 0; i < current.length; i++) {
        const left = i >= bpp ? result[i - bpp] : 0;
        const above = previous ? previous[i] : 0;
        const upperLeft = (i >= bpp && previous)
          ? previous[i - bpp] : 0;
        result[i] = (current[i]
          + paethPredictor(left, above, upperLeft)) & 0xFF;
      }
      break;

    default:
      throw new Error(`Unknown PNG filter type: ${filterType}`);
  }

  return result;
}

async function decodePNG(pngData) {
  const bytes = pngData instanceof Uint8Array
    ? pngData : new Uint8Array(pngData);
  const chunks = parseChunks(bytes);

  const ihdrChunk = chunks.find(c => c.type === "IHDR");
  if (!ihdrChunk) throw new Error("PNG missing IHDR chunk");

  const ihdrView = new DataView(
    ihdrChunk.data.buffer,
    ihdrChunk.data.byteOffset,
    ihdrChunk.data.byteLength
  );
  const width = ihdrView.getUint32(0, false);
  const height = ihdrView.getUint32(4, false);
  const bitDepth = ihdrChunk.data[8];
  const colorType = ihdrChunk.data[9];

  if (bitDepth !== 8) {
    throw new Error(`Unsupported bit depth: ${bitDepth}`);
  }

  let channelsPerPixel;
  switch (colorType) {
    case 0: channelsPerPixel = 1; break;
    case 2: channelsPerPixel = 3; break;
    case 4: channelsPerPixel = 2; break;
    case 6: channelsPerPixel = 4; break;
    default: throw new Error(`Unsupported color type: ${colorType}`);
  }

  const idatChunks = chunks.filter(c => c.type === "IDAT");
  let compressedLen = 0;
  for (const c of idatChunks) compressedLen += c.data.length;

  const compressed = new Uint8Array(compressedLen);
  let compOffset = 0;
  for (const c of idatChunks) {
    compressed.set(c.data, compOffset);
    compOffset += c.data.length;
  }

  const decompressed = await deflateDecompress(compressed);

  const bpp = channelsPerPixel;
  const rowDataLen = width * bpp;
  const rowStride = 1 + rowDataLen;

  const pixelData = new Uint8Array(width * height * bpp);
  let previousRow = null;

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowStride;
    const filterType = decompressed[rowStart];
    const rawRow = decompressed.slice(rowStart + 1, rowStart + rowStride);
    const unfilteredRow = unfilterRow(
      filterType, rawRow, previousRow, bpp
    );

    pixelData.set(unfilteredRow, y * rowDataLen);
    previousRow = unfilteredRow;
  }

  const rgbBytes = new Uint8Array(width * height * 3);

  if (colorType === 2) {
    rgbBytes.set(pixelData);
  } else if (colorType === 6) {
    for (let i = 0; i < width * height; i++) {
      rgbBytes[i * 3] = pixelData[i * 4];
      rgbBytes[i * 3 + 1] = pixelData[i * 4 + 1];
      rgbBytes[i * 3 + 2] = pixelData[i * 4 + 2];
    }
  } else if (colorType === 0) {
    for (let i = 0; i < width * height; i++) {
      rgbBytes[i * 3] = pixelData[i];
      rgbBytes[i * 3 + 1] = pixelData[i];
      rgbBytes[i * 3 + 2] = pixelData[i];
    }
  } else if (colorType === 4) {
    for (let i = 0; i < width * height; i++) {
      rgbBytes[i * 3] = pixelData[i * 2];
      rgbBytes[i * 3 + 1] = pixelData[i * 2];
      rgbBytes[i * 3 + 2] = pixelData[i * 2];
    }
  }

  return { rgbBytes, width, height };
}

export { encodePNG, decodePNG };
