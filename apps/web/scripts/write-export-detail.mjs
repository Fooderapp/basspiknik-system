// Vercel's deployed @vercel/next builder still reads `.next/export-detail.json`
// during finalization, but Next.js 15.5.x no longer emits it (it writes
// `export-marker.json` instead). The missing file makes the builder lstat a
// non-existent path and the whole deploy fails with:
//   Error: ENOENT: no such file or directory, lstat '.../.next/export-detail.json'
//
// Next.js historically always wrote this file with `success: true` to signal
// that the build/export step completed; the builder treats a missing file or
// `success: false` as a failed export and aborts. Routing (SSR vs static) is
// driven by routes-manifest.json / export-marker.json, not this flag, so
// `success: true` is safe for our normal SSR app.
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".next");
if (existsSync(dir)) {
  const file = join(dir, "export-detail.json");
  writeFileSync(
    file,
    JSON.stringify({ version: 1, success: true, outDirectory: join(dir, "export") }),
  );
  console.log("[write-export-detail] wrote", file);
}
