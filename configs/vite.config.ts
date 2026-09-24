import { defineConfig } from "vite";
import { createViteConfig, prePaintPlugin } from "@brain-bbqs/config/vite";
// With the extension: Vite's native config loader (its future default) refuses extensionless
// imports between config files.
import { STORAGE_KEY, THEME_KEY } from "../src/lib/settings.ts";

export default defineConfig(
  createViteConfig({
    rootDir: new URL("..", import.meta.url),
    overrides: {
      plugins: [prePaintPlugin({ themeKey: THEME_KEY, settingsKey: STORAGE_KEY })],
    },
  }),
);
