// @ts-check
/**
 * Rasterises the brand SVGs in `src/assets/brand/` into the PNGs `app.json` points at.
 *
 * The SVGs are the source of truth — they are what the design system exports, and they
 * are the only place Nox's geometry is defined outside `src/shared/components/Nox.tsx`.
 * The PNGs beside them are build output that happens to be committed, because Expo's
 * `icon`, `adaptiveIcon`, `favicon` and `splash` fields take raster paths and nothing
 * else. Re-run `npm run assets:brand` after any SVG edit rather than hand-exporting.
 *
 * Alpha is the part that is easy to get wrong, so each target states what it needs:
 *
 *  - The iOS app icon must be fully opaque. A PNG with an alpha channel is rejected at
 *    submission, and iOS applies its own superellipse mask, so the artwork must be
 *    full-bleed square with no rounding of its own.
 *  - The Android adaptive foreground must keep its alpha — the launcher composites it
 *    over the background layer and masks the pair.
 *  - The Android notification icon is read as a *silhouette from the alpha channel*
 *    alone. Every opaque pixel renders solid white in the status bar, which is why a
 *    full-colour icon there shows up as a white square.
 *  - The launch image is a *logo*, not a poster. `expo-splash-screen` centres it on
 *    `backgroundColor` at `imageWidth` points, and Android 12+ masks it to a circle —
 *    so a full-bleed composition handed to it is squashed into a small square and its
 *    lettering is clipped away. Only Nox is exported here, inside the mask's safe
 *    zone; the full screen in `splash-screen.svg` is the design reference for
 *    `BrandSplash`, which draws it at runtime.
 */

import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import opentype from 'opentype.js';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'src', 'assets', 'brand');
const outDir = path.join(root, 'src', 'assets');

/**
 * The splash sets its wordmark in Fraunces and its subtitle in Manrope. Neither is a
 * system font, and sharp's bundled libvips ignores `FONTCONFIG_FILE`, so librsvg
 * silently falls through the SVG's own stack to Georgia — close enough to pass a
 * glance, and wrong on the one screen every user sees first.
 *
 * So the text is converted to outlines before rasterising, from the TTFs already
 * vendored under `@expo-google-fonts`. That fixes the typeface *and* makes the export
 * reproducible: it no longer depends on what happens to be installed on the machine
 * running it, which matters the moment this runs anywhere but one laptop.
 */
const FONT_FILES = {
  'Fraunces/500': '@expo-google-fonts/fraunces/500Medium/Fraunces_500Medium.ttf',
  'Manrope/400': '@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf',
};

const fontCache = new Map();

function loadFont(family, weight) {
  const key = `${family}/${weight}`;
  const file = FONT_FILES[key];
  if (!file) throw new Error(`No vendored font for ${key}; add it to FONT_FILES.`);
  if (!fontCache.has(key)) {
    const ttf = readFileSync(path.join(root, 'node_modules', file));
    // opentype.parse wants a plain ArrayBuffer; a Node Buffer is a view into a larger
    // pooled one, so it has to be sliced to its own bytes first.
    fontCache.set(
      key,
      opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength))
    );
  }
  return fontCache.get(key);
}

/**
 * Lays a string out glyph by glyph so `letter-spacing` is honoured — opentype's own
 * `getPath` advances by the font's metrics alone and would collapse the tracking the
 * design puts under the wordmark.
 */
function textToPath({ text, font, size, x, y, anchor, spacing }) {
  const scale = size / font.unitsPerEm;
  const chars = [...text];
  const width = chars.reduce(
    (sum, ch) => sum + font.charToGlyph(ch).advanceWidth * scale + spacing,
    -spacing
  );
  let cursor = anchor === 'middle' ? x - width / 2 : x;

  const path = new opentype.Path();
  for (const ch of chars) {
    const glyph = font.charToGlyph(ch);
    path.extend(glyph.getPath(cursor, y, size));
    cursor += glyph.advanceWidth * scale + spacing;
  }
  return path.toPathData(3);
}

/** Replaces every `<text>` in an SVG with an equivalent `<path>`. */
function outlineText(svg) {
  return svg.replace(/<text\b([^>]*)>([^<]*)<\/text>/g, (_match, rawAttrs, text) => {
    const attr = name => {
      const found = new RegExp(`${name}="([^"]*)"`).exec(rawAttrs);
      return found?.[1];
    };
    const family = (attr('font-family') ?? '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    const weight = attr('font-weight') ?? '400';
    const d = textToPath({
      text,
      font: loadFont(family, weight),
      size: Number(attr('font-size')),
      x: Number(attr('x')),
      y: Number(attr('y')),
      anchor: attr('text-anchor'),
      spacing: Number(attr('letter-spacing') ?? 0),
    });
    return `<path d="${d}" fill="${attr('fill') ?? '#000'}"/>`;
  });
}

/** The night ground every opaque target is flattened onto — `palette.night900`. */
const NIGHT = '#0d0d1a';

/**
 * @type {{ source: string, out: string, width: number, height?: number,
 *          flattenOnto?: string, note: string }[]}
 */
const TARGETS = [
  {
    source: 'icon-app-1024.svg',
    out: 'icon.png',
    width: 1024,
    flattenOnto: NIGHT,
    note: 'iOS + Play Store icon — opaque, full-bleed, unrounded',
  },
  {
    source: 'nox-adaptive-foreground.svg',
    out: 'adaptive-icon.png',
    width: 1024,
    note: 'Android adaptive foreground — alpha preserved, 66dp safe zone',
  },
  {
    source: 'nox-adaptive-background.svg',
    out: 'adaptive-icon-background.png',
    width: 1024,
    flattenOnto: NIGHT,
    note: 'Android adaptive background — the nocturnal radial, not a flat colour',
  },
  {
    source: 'icon-favicon-48.svg',
    out: 'favicon.png',
    width: 96,
    note: 'Web favicon at 2x — alpha kept for the rounded corners',
  },
  {
    source: 'icon-notification.svg',
    out: 'notification-icon.png',
    width: 96,
    note: 'Android status bar — white on transparent, silhouetted from alpha',
  },
  {
    source: 'splash-icon.svg',
    out: 'splash-icon.png',
    width: 1024,
    note: 'Launch icon — Nox alone, alpha kept, sized inside the circular mask',
  },
];

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const target of TARGETS) {
    const source = await readFile(path.join(brandDir, target.source), 'utf8');
    const svg = Buffer.from(outlineText(source));

    let pipeline = sharp(svg, { density: 384 }).resize({
      width: target.width,
      height: target.height ?? target.width,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

    if (target.flattenOnto) pipeline = pipeline.flatten({ background: target.flattenOnto });

    const png = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    await writeFile(path.join(outDir, target.out), png);

    const { width, height, channels } = await sharp(png).metadata();
    const alpha = channels === 4 ? 'alpha' : 'opaque';
    console.log(
      `${target.out.padEnd(30)} ${String(width).padStart(4)}x${String(height).padEnd(5)} ` +
        `${alpha.padEnd(7)} ${target.note}`
    );
  }
}

main().catch(err => {
  console.error('Brand asset export failed:', err);
  process.exitCode = 1;
});
