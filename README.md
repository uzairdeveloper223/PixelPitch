# PixelPitch

Turns audio files into PNG images. Turn them back into audio whenever you want.

The whole thing runs in your browser. No server, no uploads, no accounts. You drop a file in, you get a picture out. Send that picture to someone, they open PixelPitch, drop the picture in, and get the audio back. That's it.

## Why

Sometimes you just want to send audio in a place that doesn't accept audio. Or you want to store it in a format nobody expects. Or you're curious what 3 minutes of music looks like as a square of colored pixels.

PixelPitch packs every byte of your audio file directly into pixel color values — red, green, blue channels, 3 bytes per pixel. The resulting PNG is a mess of random-looking colors, and that's exactly what it should be. PNG is lossless, so nothing gets lost in the round-trip.

## How it works

**Encoding:**
Your audio file gets read as raw binary. A small header is prepended (original filename, MIME type, file size, chunk info), then the whole byte stream is mapped into pixel RGB values on a square canvas. The image is written out as a PNG file directly — no browser canvas rendering, no color management, no rounding errors.

**Decoding:**
The PNG is parsed byte-by-byte, pixel data is extracted, the header is read to figure out the original file's name and format, and the audio is reconstructed as a downloadable blob. There's an audio player on the page so you can preview it before downloading.

**Chunking:**
Files that would produce an image larger than 25MB get split into multiple numbered PNGs. Each image carries a session ID and a sequence number, so even if you upload them out of order, PixelPitch reassembles them correctly. You need all parts to decode — it'll tell you if something's missing.

## What formats work

Any audio format your OS can name: mp3, wav, ogg, opus, webm, m4a, flac, aac, wma, amr — whatever. PixelPitch doesn't care about the audio content. It treats the file as raw bytes. If your system can produce the file, PixelPitch can encode it.

## Where you can share the images

PNG must stay PNG. If a platform re-compresses your image to JPEG (looking at you, WhatsApp and Twitter), the pixel data gets destroyed and the audio is gone.

**Works:** Discord, Telegram, email, AirDrop, USB drives, any direct file transfer.

**Doesn't work:** WhatsApp, Twitter/X, Instagram — these convert to JPEG.

## Running it

It's a static site. No build step, no dependencies, no npm.

visit [PixelPitch](https://uzairdeveloper223.github.io/PixelPitch/)
 
or 

Open `index.html` in a browser. Done.

If you want to serve it locally:

```
python3 -m http.server 8765
```

Then go to `http://localhost:8765`.

## Project structure

```
index.html      - single page app
style.css       - dark theme, minimal
js/
  app.js        - UI logic, drag-drop, tabs
  encoder.js    - audio to PNG encoding, chunking
  decoder.js    - PNG to audio decoding, reassembly
  header.js     - binary header format (pack/unpack)
  png.js        - manual PNG encoder/decoder (bypasses canvas)
favicon.svg     - pixel grid icon
```

## The PNG encoder

Browsers apply color space corrections when you use the Canvas API to read/write pixel data. That silently rounds some byte values by +/- 1, which corrupts the audio. PixelPitch avoids this entirely by building PNG files from scratch — writing the signature, IHDR, IDAT (zlib-compressed via CompressionStream), and IEND chunks directly. Decoding does the same in reverse: parse chunks, decompress, un-filter rows, extract raw bytes. Zero canvas involvement.

## Limitations

- Output PNGs are roughly the same size as the input audio (plus PNG overhead and a small header). Don't expect compression.
- Very large files work but will take a few seconds to encode. The browser's doing real work.
- Mobile browsers handle this fine for typical audio files. Multi-hundred-megabyte files might be rough on phones.

## License

BSD 2-Clause. See [LICENSE](LICENSE) for details.

## Author

Uzair Mughal
- [uzair.is-a.dev](https://uzair.is-a.dev)
- [github.com/uzairdeveloper223](https://github.com/uzairdeveloper223)
- contact@uzair.is-a.dev
