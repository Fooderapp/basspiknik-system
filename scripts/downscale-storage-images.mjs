/**
 * One-off: downscale oversized images already sitting in Supabase Storage.
 *
 * The serving fix (Next image optimizer) stops re-downloading originals on every
 * view, but the originals themselves are still multi-MB. Shrinking them cuts
 * storage AND the one cold-cache fetch per size.
 *
 * Safety:
 *  - DRY RUN by default. Pass --apply to actually overwrite.
 *  - Backs up each original to `<bucket>/_orig/<path>` before overwriting
 *    (unless --no-backup).
 *  - Skips SVG/GIF, small files, and anything that doesn't get smaller.
 *  - Overwrites in place so existing DB URLs keep working.
 *
 * Usage:
 *   node scripts/downscale-storage-images.mjs                 # dry run
 *   node scripts/downscale-storage-images.mjs --apply         # do it
 *   node scripts/downscale-storage-images.mjs --apply --bucket event-covers
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const sharp = require(path.join(repoRoot, "node_modules/.pnpm/sharp@0.34.5/node_modules/sharp"));
const { createClient } = require(path.join(repoRoot, "apps/web/node_modules/@supabase/supabase-js"));

// ── config ────────────────────────────────────────────────────────────────────
const MAX_EDGE = 2000;      // longest side kept
const JPEG_QUALITY = 82;
const MIN_BYTES = 200 * 1024; // ignore anything already under 200KB

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const NO_BACKUP = args.includes("--no-backup");
const bucketArg = args.indexOf("--bucket");
const ONLY_BUCKET = bucketArg !== -1 ? args[bucketArg + 1] : null;

// ── env ───────────────────────────────────────────────────────────────────────
function readEnv() {
  const raw = readFileSync(path.join(repoRoot, "apps/web/.env.local"), "utf8");
  const get = (k) => (raw.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SERVICE_ROLE_KEY") };
}
const { url, key } = readEnv();
if (!url || !key) { console.error("Missing Supabase env in apps/web/.env.local"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const fmt = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)}MB` : `${(b / 1024).toFixed(0)}KB`);

/** Recursively list every object under a prefix. */
async function listAll(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...await listAll(bucket, full)); // folder
      else out.push({ path: full, size: entry.metadata?.size ?? 0, mime: entry.metadata?.mimetype ?? "" });
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

async function main() {
  console.log(APPLY ? "MODE: APPLY (will overwrite)\n" : "MODE: DRY RUN (nothing written)\n");

  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  const targets = buckets.filter((b) => !ONLY_BUCKET || b.name === ONLY_BUCKET);

  let totalBefore = 0, totalAfter = 0, changed = 0, skipped = 0, failed = 0;

  for (const bucket of targets) {
    const files = (await listAll(bucket.name)).filter((f) => !f.path.startsWith("_orig/"));
    const images = files.filter((f) =>
      /\.(jpe?g|png|webp|avif)$/i.test(f.path) && f.size >= MIN_BYTES);

    console.log(`\n=== ${bucket.name} — ${files.length} objects, ${images.length} candidate images ===`);

    for (const f of images) {
      try {
        const { data: blob, error: dlErr } = await sb.storage.from(bucket.name).download(f.path);
        if (dlErr) throw new Error(dlErr.message);
        const input = Buffer.from(await blob.arrayBuffer());

        const meta = await sharp(input).metadata();
        const longest = Math.max(meta.width ?? 0, meta.height ?? 0);

        let pipeline = sharp(input).rotate(); // respect EXIF orientation
        if (longest > MAX_EDGE) {
          pipeline = pipeline.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
        }
        const hasAlpha = meta.hasAlpha && /\.png$/i.test(f.path);
        const output = hasAlpha
          ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
          : await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();

        if (output.length >= input.length) {
          skipped++;
          console.log(`  skip  ${f.path}  (${fmt(input.length)}, no gain)`);
          continue;
        }

        totalBefore += input.length;
        totalAfter += output.length;
        changed++;
        const pct = Math.round((1 - output.length / input.length) * 100);
        console.log(`  ${APPLY ? "SHRINK" : "would"} ${f.path}  ${longest}px ${fmt(input.length)} → ${fmt(output.length)}  (-${pct}%)`);

        if (APPLY) {
          if (!NO_BACKUP) {
            const { error: bErr } = await sb.storage.from(bucket.name)
              .upload(`_orig/${f.path}`, input, { contentType: f.mime || "application/octet-stream", upsert: true });
            if (bErr) throw new Error(`backup failed: ${bErr.message}`);
          }
          const { error: upErr } = await sb.storage.from(bucket.name)
            .upload(f.path, output, {
              contentType: hasAlpha ? "image/png" : "image/jpeg",
              upsert: true,
              cacheControl: "31536000",
            });
          if (upErr) throw new Error(upErr.message);
        }
      } catch (e) {
        failed++;
        console.log(`  FAIL  ${f.path}: ${e.message}`);
      }
    }
  }

  console.log("\n────────────────────────────────");
  console.log(`changed: ${changed}   skipped: ${skipped}   failed: ${failed}`);
  console.log(`size: ${fmt(totalBefore)} → ${fmt(totalAfter)}  (saves ${fmt(totalBefore - totalAfter)})`);
  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write.");
}

main().catch((e) => { console.error(e); process.exit(1); });
