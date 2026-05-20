// Generate PWA icons from public/_master-icon.png
// - icon-192.png: 192x192, #0E0E0C bg + white logo (via alpha mask, no rectangle)
// - icon-512.png: 512x512, same with maskable safe area
// - icon-mono.png: 96x96, white "d" silhouette on transparent bg
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const master = path.join(root, "public", "_master-icon.png");
const out = (n) => path.join(root, "public", n);
const BG = { r: 14, g: 14, b: 12, alpha: 1 }; // #0E0E0C
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// Build a white-RGB + alpha-from-darkness PNG from a source buffer.
// Dark pixels in source -> opaque white. Bright pixels -> transparent.
async function darknessToWhiteAlpha(srcBuf) {
  // Read raw greyscale pixels and synthesize RGBA where alpha = 255 - grey.
  const { data, info } = await sharp(srcBuf)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
    const grey = data[i]; // greyscale: all channels equal, take first
    rgba[j] = 255;
    rgba[j + 1] = 255;
    rgba[j + 2] = 255;
    rgba[j + 3] = 255 - grey; // dark source -> opaque white
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function makeLogoIcon(canvasSize, logoSize) {
  const trimmed = await sharp(master)
    .flatten({ background: "#ffffff" })
    .trim({ threshold: 10 })
    .toBuffer();
  const whiteLogo = await darknessToWhiteAlpha(trimmed);
  const fitted = await sharp(whiteLogo)
    .resize(logoSize, logoSize, { fit: "inside", background: TRANSPARENT })
    .toBuffer();
  return sharp({
    create: { width: canvasSize, height: canvasSize, channels: 4, background: BG },
  })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toBuffer();
}

async function makeMono() {
  const trimmed = await sharp(master)
    .flatten({ background: "#ffffff" })
    .trim({ threshold: 10 })
    .toBuffer();
  const meta = await sharp(trimmed).metadata();
  // Crop the leftmost ~28% which contains the "d" glyph (with apostrophe).
  // Then re-trim tightly.
  const cropW = Math.max(1, Math.round(meta.width * 0.28));
  const dCrop = await sharp(trimmed)
    .extract({ left: 0, top: 0, width: cropW, height: meta.height })
    .trim({ threshold: 10 })
    .toBuffer();
  const whiteD = await darknessToWhiteAlpha(dCrop);
  // Fit into 84x84 inside 96x96 transparent canvas.
  const fitted = await sharp(whiteD)
    .resize(84, 84, { fit: "inside", background: TRANSPARENT })
    .toBuffer();
  return sharp({
    create: { width: 96, height: 96, channels: 4, background: TRANSPARENT },
  })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  await sharp(await makeLogoIcon(192, 160)).toFile(out("icon-192.png"));
  console.log("wrote icon-192.png");
  await sharp(await makeLogoIcon(512, 412)).toFile(out("icon-512.png"));
  console.log("wrote icon-512.png");
  await sharp(await makeMono()).toFile(out("icon-mono.png"));
  console.log("wrote icon-mono.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
