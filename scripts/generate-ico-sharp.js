import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const src = path.resolve(process.cwd(), 'public', 'icon.png');
const outDir = path.resolve(process.cwd(), 'src-tauri', 'icons');
const tmpPng = path.resolve(process.cwd(), 'scripts', 'icon-square-sharp.png');
const out = path.join(outDir, 'icon.ico');

try {
  if (!fs.existsSync(src)) {
    console.error('Source icon not found:', src);
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  await sharp(src)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(tmpPng);
  const buf = await pngToIco(tmpPng);
  fs.writeFileSync(out, buf);
  console.log('Wrote', out);
} catch (e) {
  console.error('Error:', e && e.message);
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
}
