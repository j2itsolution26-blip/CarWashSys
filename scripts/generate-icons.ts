/**
 * Application icon generator — `npm run icons`.
 *
 * Renders every PWA/favicon size from ONE vector source so the branding lives in
 * a single place. To rebrand, edit `mark()` below and re-run; do not hand-edit
 * the PNGs in public/icons, they are build output.
 *
 * Two variants are produced:
 *  * `any`      — the mark on its rounded tile, used for favicons and iOS.
 *  * `maskable` — the same mark inset to ~60% so Android can crop it to a
 *                 circle/squircle without clipping the glyph. Android applies its
 *                 own mask, so a full-bleed background is required here.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const OUT_DIR = join(process.cwd(), "public", "icons");

const BRAND = "#1e63d8";
const BRAND_DARK = "#123f8c";
const FOAM = "#eaf1ff";

/**
 * A car silhouette under a wash arch — recognisable at 48px on a home screen,
 * which rules out fine detail or lettering below ~96px.
 */
function mark(size: number, maskable: boolean): string {
  // Maskable icons must survive an aggressive circular crop: keep the artwork
  // inside the middle 60% and let the background bleed to the edges.
  const pad = maskable ? size * 0.2 : size * 0.08;
  const inner = size - pad * 2;
  const radius = maskable ? 0 : size * 0.22;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BRAND}"/>
      <stop offset="1" stop-color="${BRAND_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${pad} ${pad}) scale(${inner / 100})">
    <!-- wash arch -->
    <path d="M12 46 A38 38 0 0 1 88 46" fill="none" stroke="${FOAM}" stroke-width="6"
          stroke-linecap="round" opacity="0.9"/>
    <!-- water droplets falling from the arch -->
    <circle cx="22" cy="30" r="3.4" fill="${FOAM}" opacity="0.75"/>
    <circle cx="50" cy="20" r="3.4" fill="${FOAM}" opacity="0.75"/>
    <circle cx="78" cy="30" r="3.4" fill="${FOAM}" opacity="0.75"/>
    <!-- car body -->
    <path d="M18 74 L24 58 Q26 53 32 53 L68 53 Q74 53 76 58 L82 74 Z" fill="${FOAM}"/>
    <!-- windscreen split -->
    <path d="M48 53 L48 74" stroke="${BRAND}" stroke-width="2.5" opacity="0.35"/>
    <!-- wheels -->
    <circle cx="32" cy="76" r="8" fill="${FOAM}"/>
    <circle cx="32" cy="76" r="3.4" fill="${BRAND_DARK}"/>
    <circle cx="68" cy="76" r="8" fill="${FOAM}"/>
    <circle cx="68" cy="76" r="3.4" fill="${BRAND_DARK}"/>
  </g>
</svg>`;
}

interface Target {
  file: string;
  size: number;
  maskable: boolean;
}

const TARGETS: Target[] = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "maskable-192.png", size: 192, maskable: true },
  { file: "maskable-512.png", size: 512, maskable: true },
  // iOS ignores the manifest and reads apple-touch-icon; it also does not honour
  // transparency, so this one is deliberately opaque.
  { file: "apple-touch-icon.png", size: 180, maskable: false },
  // Manifest shortcut tiles.
  { file: "shortcut-96.png", size: 96, maskable: false },
];

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  for (const target of TARGETS) {
    const svg = Buffer.from(mark(target.size, target.maskable));
    const png = await sharp(svg).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(join(OUT_DIR, target.file), png);
    console.log(`  ${target.file.padEnd(24)} ${target.size}x${target.size}${target.maskable ? " (maskable)" : ""}`);
  }

  // favicon.ico is read from the app directory by Next's metadata convention.
  const favicon = await sharp(Buffer.from(mark(48, false))).png().toBuffer();
  await writeFile(join(process.cwd(), "src", "app", "icon.png"), favicon);
  console.log(`  src/app/icon.png         48x48 (favicon)`);

  console.log(`\nWrote ${TARGETS.length + 1} icons.`);
}

main().catch((error) => {
  console.error("Icon generation failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
