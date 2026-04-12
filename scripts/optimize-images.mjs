// Batch-optimize public/photos, public/hero, public/logo to WebP.
// Keeps originals. Outputs next to them as *.webp.
// Also creates optimized logo at /public/logo/logo-64.webp and /public/logo/logo-128.webp

import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(".");
const dirs = [
  { dir: "public/photos", maxWidth: 1600, quality: 78 },
  { dir: "public/hero",   maxWidth: 1800, quality: 80 },
  { dir: "public/logo",   maxWidth: 512,  quality: 85 },
];

async function processDir({ dir, maxWidth, quality }) {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return;
  const files = await readdir(abs);
  for (const f of files) {
    if (!/\.(jpe?g|png)$/i.test(f)) continue;
    const src = path.join(abs, f);
    const webp = src.replace(/\.(jpe?g|png)$/i, ".webp");
    if (existsSync(webp)) continue;
    try {
      const info = await sharp(src).metadata();
      const s = sharp(src);
      if ((info.width ?? 0) > maxWidth) s.resize({ width: maxWidth });
      await s.webp({ quality }).toFile(webp);
      const [a, b] = await Promise.all([stat(src), stat(webp)]);
      console.log(`${dir}/${f}: ${(a.size / 1024).toFixed(0)}K → ${(b.size / 1024).toFixed(0)}K`);
    } catch (e) {
      console.warn(`skip ${f}:`, e.message);
    }
  }
}

// Generate small logo variants
async function logoVariants() {
  const src = path.join(ROOT, "public/logo/1-logo.png");
  if (!existsSync(src)) return;
  for (const size of [64, 128, 256]) {
    const out = path.join(ROOT, `public/logo/logo-${size}.webp`);
    if (existsSync(out)) continue;
    await sharp(src).resize({ width: size }).webp({ quality: 90 }).toFile(out);
    const s = await stat(out);
    console.log(`logo-${size}.webp: ${(s.size / 1024).toFixed(1)}K`);
  }
}

for (const d of dirs) await processDir(d);
await logoVariants();
console.log("\nDone.");
