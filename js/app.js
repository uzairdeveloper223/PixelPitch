import { encodeAudioToImages, estimateImageSize, calculateChunkCount } from "./encoder.js";
import { decodeImagesToAudio } from "./decoder.js";

const AUDIO_EXTENSIONS = [
  ".mp3", ".wav", ".ogg", ".opus", ".webm", ".m4a",
  ".flac", ".aac", ".wma", ".amr", ".3gp"
];
const IMAGE_EXTENSIONS = [".png"];
const MAX_OUTPUT_MB = 25;

let currentMode = "encode";
let encodeResults = null;
let decodeResult = null;
let decodeAudioUrl = null;

function $(id) {
  return document.getElementById(id);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAudioFile(file) {
  const name = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some(ext => name.endsWith(ext)) ||
    file.type.startsWith("audio/");
}

function isImageFile(file) {
  const name = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => name.endsWith(ext)) ||
    file.type === "image/png";
}

function showError(msg) {
  const el = $("status-message");
  el.textContent = msg;
  el.className = "status-message error";
  el.hidden = false;
}

function showSuccess(msg) {
  const el = $("status-message");
  el.textContent = msg;
  el.className = "status-message success";
  el.hidden = false;
}

function showInfo(msg) {
  const el = $("status-message");
  el.textContent = msg;
  el.className = "status-message info";
  el.hidden = false;
}

function clearStatus() {
  const el = $("status-message");
  el.hidden = true;
  el.textContent = "";
}

function clearResults() {
  $("result-area").hidden = true;
  $("encode-result").hidden = true;
  $("decode-result").hidden = true;
  $("estimate-area").hidden = true;
  $("progress-area").hidden = true;
  if (encodeResults) {
    for (const r of encodeResults) {
      URL.revokeObjectURL(r.dataUrl);
    }
  }
  encodeResults = null;
  decodeResult = null;
  if (decodeAudioUrl) {
    URL.revokeObjectURL(decodeAudioUrl);
    decodeAudioUrl = null;
  }
}

function switchMode(mode) {
  currentMode = mode;
  clearResults();
  clearStatus();

  $("tab-encode").classList.toggle("active", mode === "encode");
  $("tab-decode").classList.toggle("active", mode === "decode");

  const dropLabel = $("drop-label");
  const dropSub = $("drop-sublabel");
  const fileInput = $("file-input");

  if (mode === "encode") {
    dropLabel.textContent = "Drop audio file here";
    dropSub.textContent = "MP3, WAV, OGG, OPUS, WebM, FLAC, M4A, AAC";
    fileInput.accept = "audio/*";
    fileInput.multiple = false;
  } else {
    dropLabel.textContent = "Drop PixelPitch image(s) here";
    dropSub.textContent = "PNG — upload all parts if split into multiple";
    fileInput.accept = "image/png";
    fileInput.multiple = true;
  }
}

function showEstimate(file) {
  const estimate = estimateImageSize(file.size);
  const chunks = calculateChunkCount(file.size);
  const estimateArea = $("estimate-area");
  const estimateText = $("estimate-text");

  let msg = `File: ${file.name} (${formatBytes(file.size)})`;
  msg += `\nEstimated output: ${estimate.width}×${estimate.height} PNG`;
  msg += ` (~${formatBytes(estimate.estimatedPngBytes)})`;

  if (chunks > 1) {
    msg += `\n\nFile exceeds ${MAX_OUTPUT_MB}MB limit per image.`;
    msg += ` Will be split into ${chunks} images.`;
    msg += ` Upload all ${chunks} images together when decoding.`;
  }

  estimateText.textContent = msg;
  estimateArea.hidden = false;
  $("encode-btn").hidden = false;
  $("encode-btn").dataset.fileName = file.name;
}

async function handleEncode(file) {
  clearResults();
  clearStatus();

  if (!isAudioFile(file)) {
    showError("Not a supported audio format. Use MP3, WAV, OGG, OPUS, WebM, FLAC, M4A, or AAC.");
    return;
  }

  if (file.size === 0) {
    showError("File is empty.");
    return;
  }

  showEstimate(file);

  $("encode-btn").onclick = async () => {
    $("encode-btn").hidden = true;
    $("estimate-area").hidden = true;
    $("progress-area").hidden = false;

    const progressBar = $("progress-fill");
    const progressText = $("progress-text");
    progressBar.style.width = "0%";
    progressText.textContent = "Encoding...";

    try {
      encodeResults = await encodeAudioToImages(file, (pct) => {
        const percent = Math.round(pct * 100);
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `Encoding chunk ${Math.ceil(pct * calculateChunkCount(file.size))} of ${calculateChunkCount(file.size)}...`;
      });

      $("progress-area").hidden = true;
      displayEncodeResults();
    } catch (err) {
      $("progress-area").hidden = true;
      showError(`Encoding failed: ${err.message}`);
    }
  };
}

function displayEncodeResults() {
  const container = $("encode-result");
  container.innerHTML = "";
  container.hidden = false;
  $("result-area").hidden = false;

  const totalChunks = encodeResults.length;

  if (totalChunks > 1) {
    const notice = document.createElement("div");
    notice.className = "chunk-notice";
    notice.textContent = `Split into ${totalChunks} images. Download all of them — you'll need all ${totalChunks} to decode.`;
    container.appendChild(notice);
  }

  encodeResults.forEach((result, idx) => {
    const card = document.createElement("div");
    card.className = "image-card";

    const img = document.createElement("img");
    img.src = result.dataUrl;
    img.alt = `PixelPitch encoded image ${idx + 1} of ${totalChunks}`;
    img.className = "encoded-image";
    card.appendChild(img);

    const info = document.createElement("div");
    info.className = "image-info";
    info.textContent = `Part ${idx + 1}/${totalChunks} — ${result.width}×${result.height}px`;
    card.appendChild(info);

    const dl = document.createElement("a");
    dl.href = result.dataUrl;
    const baseName = $("encode-btn").dataset.fileName.replace(/\.[^.]+$/, "");
    dl.download = totalChunks > 1
      ? `${baseName}_part${idx + 1}of${totalChunks}.png`
      : `${baseName}.pixelpitch.png`;
    dl.className = "download-btn";
    dl.textContent = totalChunks > 1
      ? `Download Part ${idx + 1}`
      : "Download Image";
    card.appendChild(dl);

    container.appendChild(card);
  });

  if (totalChunks > 1) {
    const dlAll = document.createElement("button");
    dlAll.className = "download-btn download-all";
    dlAll.textContent = "Download All Parts";
    dlAll.onclick = () => downloadAll();
    container.appendChild(dlAll);
  }

  showSuccess(
    totalChunks > 1
      ? `Encoded into ${totalChunks} images. Download all parts.`
      : "Encoded successfully. Download your image."
  );
}

function downloadAll() {
  encodeResults.forEach((result, idx) => {
    const a = document.createElement("a");
    a.href = result.dataUrl;
    const baseName = $("encode-btn").dataset.fileName.replace(/\.[^.]+$/, "");
    a.download = `${baseName}_part${idx + 1}of${encodeResults.length}.png`;
    a.click();
  });
}

async function handleDecode(files) {
  clearResults();
  clearStatus();

  const pngFiles = Array.from(files).filter(f => isImageFile(f));

  if (pngFiles.length === 0) {
    showError("No PNG files found. PixelPitch images must be in PNG format.");
    return;
  }

  $("progress-area").hidden = false;
  const progressBar = $("progress-fill");
  const progressText = $("progress-text");
  progressBar.style.width = "0%";
  progressText.textContent = "Decoding...";

  try {
    decodeResult = await decodeImagesToAudio(pngFiles);
    progressBar.style.width = "100%";
    $("progress-area").hidden = true;
    displayDecodeResults();
  } catch (err) {
    $("progress-area").hidden = true;
    showError(`Decoding failed: ${err.message}`);
  }
}

function displayDecodeResults() {
  const container = $("decode-result");
  container.innerHTML = "";
  container.hidden = false;
  $("result-area").hidden = false;

  const fileInfo = document.createElement("div");
  fileInfo.className = "file-info";
  fileInfo.innerHTML = `
    <span class="file-name">${decodeResult.filename}</span>
    <span class="file-meta">${formatBytes(decodeResult.totalSize)} · ${decodeResult.mimeType}</span>
    ${decodeResult.chunkCount > 1 ? `<span class="file-meta">Reassembled from ${decodeResult.chunkCount} parts</span>` : ""}
  `;
  container.appendChild(fileInfo);

  if (decodeAudioUrl) {
    URL.revokeObjectURL(decodeAudioUrl);
  }
  decodeAudioUrl = URL.createObjectURL(decodeResult.blob);

  const audioPlayer = document.createElement("audio");
  audioPlayer.controls = true;
  audioPlayer.src = decodeAudioUrl;
  audioPlayer.className = "audio-player";
  container.appendChild(audioPlayer);

  const dl = document.createElement("a");
  dl.href = decodeAudioUrl;
  dl.download = decodeResult.filename;
  dl.className = "download-btn";
  dl.textContent = "Download Audio";
  container.appendChild(dl);

  showSuccess("Decoded successfully. Preview or download your audio.");
}

function setupDragDrop() {
  const dropZone = $("drop-zone");
  const fileInput = $("file-input");

  ["dragenter", "dragover"].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    if (currentMode === "encode") {
      handleEncode(files[0]);
    } else {
      handleDecode(files);
    }
  });

  dropZone.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const files = fileInput.files;
    if (files.length === 0) return;

    if (currentMode === "encode") {
      handleEncode(files[0]);
    } else {
      handleDecode(files);
    }

    fileInput.value = "";
  });
}

function setupTabs() {
  $("tab-encode").addEventListener("click", () => switchMode("encode"));
  $("tab-decode").addEventListener("click", () => switchMode("decode"));
}

function init() {
  setupTabs();
  setupDragDrop();
  switchMode("encode");
}

document.addEventListener("DOMContentLoaded", init);
