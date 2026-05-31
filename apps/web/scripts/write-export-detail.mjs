// Vercel's deployed @vercel/next builder still reads `.next/export-detail.json`
// during finalization, but Next.js 15.5.x no longer emits it (it writes
// `export-marker.json` instead). The missing file makes the builder lstat a
// non-existent path and the whole deploy fails with:
//   Error: ENOENT: no such file or directory, lstat '.../.next/export-detail.json'
//
// We are a normal SSR app (no `output: 'export'`), so write a valid v1 detail
// file with success:false — the builder reads it, sees it's not a full static
// export, and proceeds with the standard server deployment.
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".next");
if (existsSync(dir)) {
  const file = join(dir, "export-detail.json");
  writeFileSync(
    file,
    JSON.stringify({ version: 1, success: false, outDirectory: join(dir, "export") }),
  );
  console.log("[write-export-detail] wrote", file);
}
