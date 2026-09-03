#!/usr/bin/env node
/* Render the Play feature graphic to a 1024x500 PNG.
 *
 * The source is HTML rather than a drawn image so the copy can change without
 * anyone reopening a design tool, and so the file that produced the graphic is
 * in the repo next to the graphic itself.
 *
 * Uses the headless Chrome already installed. No new dependency.
 *
 * Usage: node scripts/render-store-graphic.mjs [output.png]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* Resolved against this file rather than the working directory, so the script
   renders the repo's graphic wherever it is run from. */
const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, 'store-graphic/feature-graphic.html');
const output = resolve(process.argv[2] || resolve(here, 'store-graphic/feature-graphic.png'));

if (!existsSync(CHROME)) {
  console.error(`No Chrome at ${CHROME}. Install it, or point CHROME at another Chromium build.`);
  process.exit(1);
}

mkdirSync(dirname(output), { recursive: true });

execFileSync(
  CHROME,
  [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    /* Pins the render to 1 CSS pixel = 1 image pixel. Chrome 152 headless on
       this Retina Mac already emits 1024x500 without it, so this is not
       fixing an observed failure - it removes the dependency on that being
       true of whatever Chrome, display or --headless implementation runs it
       next. Play takes 1024x500 and nothing else. */
    '--force-device-scale-factor=1',
    /* Play rejects an alpha channel. The page's own gradient already covers
       all 1024x500, so the render comes back opaque without this - it is the
       second line of defence for the day someone gives the body a background
       that does not reach an edge. Chrome's own default here is transparent,
       which is the failure it guards against. */
    '--default-background-color=FFFFFFFF',
    '--window-size=1024,500',
    `--screenshot=${output}`,
    `file://${SOURCE}`,
  ],
  { stdio: 'inherit' },
);

/* The store is not the right place to find out the render came back the wrong
   size, so check here. */
const probe = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', output], {
  encoding: 'utf8',
});
const value = (key) => probe.match(new RegExp(`^\\s*${key}:\\s*(\\S+)`, 'm'))?.[1];
const width = Number(value('pixelWidth'));
const height = Number(value('pixelHeight'));

if (width !== 1024 || height !== 500) {
  console.error(`Rendered ${width}x${height}; Play requires exactly 1024x500.`);
  process.exit(1);
}

if (value('hasAlpha') === 'yes') {
  console.error('Rendered with an alpha channel; Play requires a 24-bit PNG with none.');
  process.exit(1);
}

console.log(`Wrote ${output}  ${width}x${height}`);
