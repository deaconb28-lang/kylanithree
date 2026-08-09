// TypeScript emits relative imports without a file extension, which Node's ESM loader rejects.
// Rewriting them after compilation keeps the source idiomatic (no .js suffixes littered through
// application code) while letting the offline tests import the built output directly.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = ".test-build";

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.name.endsWith(".js")) yield path;
  }
}

let patched = 0;
for await (const file of walk(ROOT)) {
  const src = await readFile(file, "utf8");
  const out = src.replace(/(from\s+["'])(\.[^"']*?)(["'])/g, (m, a, spec, z) =>
    /\.(js|json|mjs)$/.test(spec) ? m : `${a}${spec}.js${z}`,
  );
  if (out !== src) {
    await writeFile(file, out);
    patched++;
  }
}
console.log(`fix-test-esm: patched ${patched} file(s)`);
