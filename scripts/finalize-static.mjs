import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const distIndex = join(dist, "index.html");
const rootIndex = join(root, "index.html");
const distAstro = join(dist, "_astro");
const rootAstro = join(root, "_astro");

const makeLocalAssetPaths = (html) =>
  html.replaceAll('="/_astro/', '="./_astro/').replaceAll("='/_astro/", "='./_astro/");

const html = makeLocalAssetPaths(await readFile(distIndex, "utf8"));
await writeFile(distIndex, html);
await writeFile(rootIndex, html);

await rm(rootAstro, { force: true, recursive: true });
await mkdir(rootAstro, { recursive: true });
await cp(distAstro, rootAstro, { force: true, recursive: true });
await writeFile(join(root, ".nojekyll"), "");
