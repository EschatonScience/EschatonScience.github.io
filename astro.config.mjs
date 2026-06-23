import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://eschatonscience.github.io",
  output: "static",
  vite: {
    base: "./"
  }
});
