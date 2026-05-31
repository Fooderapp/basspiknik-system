// Vercel's deployed @vercel/next builder still reads `.next/export-detail.json`
// during finalization, but Next.js 15.5.x no longer emits it (it writes
// `export-marker.json` instead). The missing file makes the builder lstat a
// non-existent path and the whole deploy fails with:
//   Error: ENOENT: no such file or directory, lstat '.../.next/export-detail.json'
//
// Vercel's currently-deployed @vercel/next builder unconditionally stats
// `.next/export-detail.json` during finalization. Next.js 15.5.x stopped
// emitting it, so a normal `next build` fails with:
//   Error: ENOENT ... lstat '.next/export-detail.json'
//
// The same builder treats a *version 1* detail file as a static `next export`
// (success:true -> deploys an empty export -> 404 everywhere; success:false ->
// "Export of Next.js app failed"). Both are wrong for our SSR app.
//
// The builder's getExportIntent/getExportStatus only recognise `version: 1`
// and fall through to "no export" for any other version. So we write the file
// with `version: 2`: the stat succeeds (no ENOENT) and the builder does NOT
// treat the build as a static export, leaving the normal serverless/SSR
// deployment intact.
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".next");
if (existsSync(dir)) {
  const file = join(dir, "export-detail.json");
  writeFileSync(
    file,
    JSON.stringify({ version: 2, success: false, outDirectory: join(dir, "export") }),
  );
  console.log("[write-export-detail] wrote", file);
}
