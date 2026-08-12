import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const output = join(tmpdir(), `wavelength-calibration-smoke-${process.pid}.mjs`);
try {
  await build({
    entryPoints: [new URL("./calibration-smoke.ts", import.meta.url).pathname],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: output,
    loader: { ".txt": "text" },
    logLevel: "warning",
  });
  await import(`${pathToFileURL(output).href}?v=${Date.now()}`);
} finally {
  await unlink(output).catch(() => undefined);
}
