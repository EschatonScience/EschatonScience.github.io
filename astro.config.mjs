import { defineConfig } from "astro/config";

const isBuild =
  process.env.npm_lifecycle_event === "build" || process.argv.includes("build");

export default defineConfig({
  site: "https://eschatonscience.github.io",
  output: "static",
  vite: {
    base: isBuild ? "" : "/",
  },
});
