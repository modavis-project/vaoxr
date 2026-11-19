import vinext from "vinext";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const plugins: PluginOption[] = [vinext()];
  if (process.env.VAOXR_BUILD_TARGET === "worker") {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: {
        main: "./worker/index.ts",
        compatibility_flags: ["nodejs_compat"],
      },
    }));
  }

  return {
    server: process.env.VITE_USE_POLLING === "true"
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins,
  };
});
