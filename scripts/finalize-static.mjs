import { cp, lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(dirname(dirname(fileURLToPath(import.meta.url))));
const dist = join(root, "dist");
const distIndex = join(dist, "index.html");
const rootIndex = join(root, "index.html");
const distAstro = join(dist, "_astro");

async function removeOutput(name) {
  const target = resolve(root, name);
  if (dirname(target) !== root || !["_astro", "fonts", "dist"].includes(name)) {
    throw new Error(`Output must be a named directory inside this checkout: ${target}`);
  }
  const info = await lstat(target).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (info?.isSymbolicLink()) throw new Error(`Output cannot be a link: ${target}`);
  await rm(target, { force: true, recursive: true });
}

const makeLocalAssetPaths = (html) =>
  html.replaceAll('="/_astro/', '="./_astro/').replaceAll("='/_astro/", "='./_astro/");

const html = makeLocalAssetPaths(await readFile(distIndex, "utf8"));
await writeFile(rootIndex, html);

await removeOutput("_astro");
await cp(distAstro, join(root, "_astro"), { recursive: true });
await removeOutput("fonts");
await cp(join(dist, "fonts"), join(root, "fonts"), { force: true, recursive: true });
await writeFile(join(root, ".nojekyll"), "");
await removeOutput("dist");
