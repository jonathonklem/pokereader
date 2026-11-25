// Regenerates the PNG app icons from public/icon.svg. Run: node scripts/make-icons.mjs
import sharp from 'sharp';
for (const size of [192, 512]) {
  await sharp('public/icon.svg', { density: 300 }).resize(size, size).png().toFile(`public/icon-${size}.png`);
}
console.log('icons written');
