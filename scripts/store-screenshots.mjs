#!/usr/bin/env node
/* Turn real-device captures into files each store will accept.
 *
 * A phone that is not a store reference device produces a capture of the wrong
 * pixel size, and a store rejects that at the end of the upload rather than at
 * the start. This scales each capture to fit the target and pads the remainder
 * with the app's background colour, so the aspect ratio never changes and
 * nothing is cropped out of a screenshot someone framed deliberately.
 *
 * Uses sips, which ships with macOS. No new dependency: see the plan's Global
 * Constraints.
 *
 * Usage: node scripts/store-screenshots.mjs <input-dir> <output-dir>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

/* Sizes come from Apple's and Google's published specifications, confirmed
   2026-09-02. Both change without notice; re-check them alongside
   docs/store-assets.md, which carries the same table and the source URLs.

   Apple accepts several pixel sizes per display class. The two iPhone sizes
   are the ones the shot list is cut to; supplying 6.9" alone would satisfy
   Apple, but a 6.5" set stops Apple downscaling the tall shots itself, which
   softens the small type in a screenshot of a balance.

   The iPad set is here because the iOS target is still
   `TARGETED_DEVICE_FAMILY = "1,2"` (project.pbxproj lines 328 and 351) —
   iPhone AND iPad. While that holds, App Store Connect requires a 13" iPad
   set before the build can be submitted at all, and App Review runs the app on
   an iPad. Narrowing the target to "1" is a live decision, recorded as an open
   item in RELEASE-CHECKLIST.md; producing a set nobody ends up uploading costs
   a few seconds of sips, and not having one costs a refused upload at the end
   of an upload. */
const TARGETS = [
  { name: 'apple-6.9', width: 1290, height: 2796 },
  { name: 'apple-6.5', width: 1242, height: 2688 },
  { name: 'apple-ipad-13', width: 2064, height: 2752 },
  { name: 'play-phone', width: 1080, height: 1920 },
];

// The parent app's own surface — <meta name="theme-color"> in
// frontend-parent/index.html — so padding reads as part of the screenshot.
const PAD = 'FFFFFF';

const [, , inputDir, outputDir] = process.argv;

if (!inputDir || !outputDir) {
  console.error('Usage: node scripts/store-screenshots.mjs <input-dir> <output-dir>');
  process.exit(1);
}

if (!existsSync(inputDir)) {
  console.error(`No such directory: ${inputDir}`);
  process.exit(1);
}

const captures = readdirSync(inputDir)
  .filter((file) => /\.(png|jpe?g)$/i.test(file))
  .sort();

if (captures.length === 0) {
  console.error(`No PNG or JPEG captures in ${inputDir}`);
  process.exit(1);
}

/* sips prints one "  key: value" line per requested property after the file
   path, which is the only machine-readable output it offers. */
function readImage(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', file], {
    encoding: 'utf8',
  });
  const value = (key) => out.match(new RegExp(`^\\s*${key}:\\s*(\\S+)`, 'm'))?.[1];
  return {
    width: Number(value('pixelWidth')),
    height: Number(value('pixelHeight')),
    hasAlpha: value('hasAlpha') === 'yes',
  };
}

/* Read every capture before writing anything.

   Both problems this catches are ones that otherwise surface as a directory
   full of files that look finished: a store rejects the whole set at the end
   of an upload, or a shot the operator expected is quietly missing from it.
   Finding them here costs nothing and refuses the run instead. */
const sources = [];
const unreadable = [];
const transparent = [];

for (const capture of captures) {
  const source = resolve(inputDir, capture);
  const { width, height, hasAlpha } = readImage(source);

  /* sips answers a file it cannot decode - truncated, or a .png that is not
     one - with "<nil>" and an exit status of 0, so the numbers come back NaN
     and every later comparison against them is silently false. */
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    console.error(
      `Skipping ${capture}: sips cannot read its size. It is truncated, or named ` +
        'with an extension that is not its format.',
    );
    unreadable.push(capture);
    continue;
  }

  if (hasAlpha) transparent.push(capture);

  sources.push({ capture, source, width, height });
}

/* Neither store accepts an alpha channel, and sips carries one straight
   through from the source rather than flattening it - so every file made from
   a transparent capture is transparent too, and the whole set is refused. No
   flag on sips can strip it, so the only honest thing to do is stop. */
if (transparent.length > 0) {
  console.error(
    `Refusing to run: these captures carry an alpha channel, and so would every ` +
      `file made from them —\n  ${transparent.join('\n  ')}\n` +
      'Both stores reject transparency. Re-export each one flat ' +
      '(Preview: File > Export, uncheck Alpha) and run this again.',
  );
  process.exit(1);
}

if (sources.length === 0) {
  console.error('Nothing readable to convert.');
  process.exit(1);
}

for (const target of TARGETS) {
  const dir = join(outputDir, target.name);
  mkdirSync(dir, { recursive: true });

  for (const { capture, source, width, height } of sources) {
    const stem = basename(capture, extname(capture));
    const out = join(dir, `${stem}.png`);

    /* Two passes: scale to fit inside the box preserving aspect ratio, then
       pad out to the exact size.

       The scaling deliberately does NOT use --resampleHeightWidthMax. That
       flag pins the *longer* edge, which only fits a portrait image into a
       portrait box by luck: a 1920x1080 capture becomes 2796x1572 against the
       6.9" box, and the pad pass then silently crops 1506px of width away. So
       decide which edge binds first — the one where the source is relatively
       fatter than the target — and pin that edge instead. --resampleWidth and
       --resampleHeight each preserve the aspect ratio, so the free edge lands
       at or under the target and the pad pass never has to cut. */
    const boundByWidth = width * target.height > height * target.width;

    execFileSync(
      'sips',
      [
        '-s', 'format', 'png',
        ...(boundByWidth
          ? ['--resampleWidth', String(target.width)]
          : ['--resampleHeight', String(target.height)]),
        source,
        '--out', out,
      ],
      { stdio: 'ignore' },
    );

    execFileSync(
      'sips',
      ['--padToHeightWidth', String(target.height), String(target.width), '--padColor', PAD, out],
      { stdio: 'ignore' },
    );

    /* The whole point of this script is that the store does not get to be the
       one who discovers a wrong size, so check rather than assume. */
    const result = readImage(out);
    if (result.width !== target.width || result.height !== target.height) {
      console.error(
        `${target.name}/${stem}.png came out ${result.width}x${result.height}, ` +
          `wanted ${target.width}x${target.height}`,
      );
      process.exit(1);
    }

    console.log(`${target.name}/${stem}.png  ${target.width}x${target.height}`);
  }
}

console.log(`\n${sources.length} capture(s) -> ${TARGETS.length} store size(s) in ${outputDir}`);

/* A skipped capture is a missing screenshot, which nobody notices until the
   listing is one shot short. The files that did convert are good, so they are
   kept - but the run still fails. */
if (unreadable.length > 0) {
  console.error(`\nSkipped ${unreadable.length} unreadable file(s): ${unreadable.join(', ')}`);
  process.exit(1);
}
