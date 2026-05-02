import fs from 'fs';
import path from 'path';
import pngToIco from 'png-to-ico';
const JimpModule = await import('jimp');
const Jimp = JimpModule.Jimp || JimpModule.default || JimpModule;
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '..', 'public', 'icon.png');
const outDir = path.resolve(__dirname, '..', 'src-tauri', 'icons');
const out = path.join(outDir, 'icon.ico');

try {
  if (!fs.existsSync(src)) {
    console.error('Source icon not found:', src);
    process.exit(1);
  }
  // ensure square PNG for png-to-ico
  const tmpPng = path.join(__dirname, 'icon-square.png');
  console.log('Jimp keys:', Object.keys(Jimp));
  const image = await Jimp.read(src);
  const size = Math.max(image.bitmap.width, image.bitmap.height);
  const square = new Jimp(size, size, 0x00000000);
  const x = Math.floor((size - image.bitmap.width) / 2);
  const y = Math.floor((size - image.bitmap.height) / 2);
  square.composite(image, x, y);
  await square.writeAsync(tmpPng);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const buf = await pngToIco(tmpPng);
  fs.writeFileSync(out, buf);
  console.log('Wrote', out);
} catch (e) {
  console.error('Error:', e && e.message);
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
}
