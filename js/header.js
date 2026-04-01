const MAGIC = new Uint8Array([0x50, 0x58, 0x50, 0x43]);
const HEADER_VERSION = 2;
const MAX_STRING_LEN = 255;
const SESSION_ID_LEN = 8;

function generateSessionId() {
  const id = new Uint8Array(SESSION_ID_LEN);
  crypto.getRandomValues(id);
  return id;
}

function packHeader(filename, mimeType, totalFileSize, chunkIndex, totalChunks, sessionId, chunkDataSize) {
  const encoder = new TextEncoder();

  let safeName = filename || "audio";
  let safeMime = mimeType || "application/octet-stream";

  const nameBytes = encoder.encode(safeName);
  const mimeBytes = encoder.encode(safeMime);

  const nameLen = Math.min(nameBytes.length, MAX_STRING_LEN);
  const mimeLen = Math.min(mimeBytes.length, MAX_STRING_LEN);

  const headerSize = 4 + 1 + 4 + 2 + 2 + SESSION_ID_LEN + 1 + mimeLen + 1 + nameLen + 4;
  const header = new Uint8Array(headerSize);
  const view = new DataView(header.buffer);
  let offset = 0;

  header.set(MAGIC, offset);
  offset += 4;

  header[offset] = HEADER_VERSION;
  offset += 1;

  view.setUint32(offset, totalFileSize, false);
  offset += 4;

  view.setUint16(offset, chunkIndex, false);
  offset += 2;

  view.setUint16(offset, totalChunks, false);
  offset += 2;

  header.set(sessionId.slice(0, SESSION_ID_LEN), offset);
  offset += SESSION_ID_LEN;

  header[offset] = mimeLen;
  offset += 1;
  header.set(mimeBytes.slice(0, mimeLen), offset);
  offset += mimeLen;

  header[offset] = nameLen;
  offset += 1;
  header.set(nameBytes.slice(0, nameLen), offset);
  offset += nameLen;

  view.setUint32(offset, chunkDataSize, false);
  offset += 4;

  return header;
}

function unpackHeader(dataArray) {
  if (dataArray.length < 4) {
    throw new Error("Data too short to contain a PixelPitch header");
  }

  for (let i = 0; i < 4; i++) {
    if (dataArray[i] !== MAGIC[i]) {
      throw new Error("Not a PixelPitch image — magic bytes mismatch");
    }
  }

  const view = new DataView(dataArray.buffer, dataArray.byteOffset, dataArray.byteLength);
  const decoder = new TextDecoder();
  let offset = 4;

  const version = dataArray[offset];
  offset += 1;

  if (version < 1 || version > 2) {
    throw new Error(`Unsupported header version: ${version}`);
  }

  const totalFileSize = view.getUint32(offset, false);
  offset += 4;

  let chunkIndex = 0;
  let totalChunks = 1;
  let sessionId = new Uint8Array(SESSION_ID_LEN);

  if (version >= 2) {
    chunkIndex = view.getUint16(offset, false);
    offset += 2;

    totalChunks = view.getUint16(offset, false);
    offset += 2;

    sessionId = dataArray.slice(offset, offset + SESSION_ID_LEN);
    offset += SESSION_ID_LEN;
  }

  const mimeLen = dataArray[offset];
  offset += 1;
  const mimeType = decoder.decode(dataArray.slice(offset, offset + mimeLen));
  offset += mimeLen;

  const nameLen = dataArray[offset];
  offset += 1;
  const filename = decoder.decode(dataArray.slice(offset, offset + nameLen));
  offset += nameLen;

  let chunkDataSize = totalFileSize;
  if (version >= 2) {
    chunkDataSize = view.getUint32(offset, false);
    offset += 4;
  }

  return {
    version,
    totalFileSize,
    chunkIndex,
    totalChunks,
    sessionId,
    mimeType,
    filename,
    chunkDataSize,
    headerLength: offset
  };
}

function sessionIdToHex(sessionId) {
  return Array.from(sessionId)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export {
  packHeader,
  unpackHeader,
  generateSessionId,
  sessionIdToHex,
  SESSION_ID_LEN
};
