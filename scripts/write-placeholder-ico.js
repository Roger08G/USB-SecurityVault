import fs from 'fs';
import path from 'path';

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
const pngBuf = Buffer.from(pngBase64, 'base64');
const iconDir = Buffer.from([0x00,0x00,0x01,0x00,0x01,0x00]); // ICONDIR: reserved, type(1), count(1)
const width = 1;
const height = 1;
const colorCount = 0;
const reserved = 0;
const planes = 1;
const bitCount = 32;
const entry = Buffer.alloc(16);
entry.writeUInt8(width, 0);
entry.writeUInt8(height, 1);
entry.writeUInt8(colorCount, 2);
entry.writeUInt8(reserved, 3);
entry.writeUInt16LE(planes, 4);
entry.writeUInt16LE(bitCount, 6);
entry.writeUInt32LE(pngBuf.length, 8);
entry.writeUInt32LE(6 + 16, 12); // offset to image data

const ico = Buffer.concat([iconDir, entry, pngBuf]);

const outDir = path.join(process.cwd(), 'src-tauri', 'icons');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'icon.ico');
fs.writeFileSync(outPath, ico);
console.log('Wrote', outPath);
