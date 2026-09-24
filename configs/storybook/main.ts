import type { PluginOption } from "vite";
import { createStorybookMain } from "@brain-bbqs/config/storybook";
import { prePaintPlugin } from "@brain-bbqs/config/vite";

// Storybook's Vite builder loads configs/vite.config.ts, whose pre-paint plugin would otherwise
// inject the app's stored-theme/signed-in script into Storybook's own iframe.html. The stories pin
// their theme themselves and have no sign-in state, so keep that script out of Storybook.
const PRE_PAINT = prePaintPlugin({ themeKey: "" }).name;

function withoutPrePaint(plugins: PluginOption[]): PluginOption[] {
  return plugins
    .filter((plugin) => !(plugin && "name" in plugin && plugin.name === PRE_PAINT))
    .map((plugin) => (Array.isArray(plugin) ? withoutPrePaint(plugin) : plugin));
}

export default createStorybookMain({
  packageJson: new URL("../../package.json", import.meta.url),
  viteFinal: (config) => ({ ...config, plugins: withoutPrePaint(config.plugins ?? []) }),
});
