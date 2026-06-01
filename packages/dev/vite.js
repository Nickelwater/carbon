import path from "node:path";
import { loadEnv } from "vite";

/**
 * Merge `.env*` files into `process.env` so SSR code that reads `process.env`
 * (e.g. `@carbon/auth`, `@carbon/env`) sees the same values as Vite's
 * `import.meta.env`.
 *
 * App-local files are loaded first, then repo-root files (last wins) so
 * `crbn up`–written root `.env.local` overrides stale app-level copies.
 *
 * In non-production modes, file values **overwrite** existing `process.env`
 * keys — `react-router dev` can invoke the vite config with modes other than
 * `"development"` during startup, which previously left stale shell values
 * (e.g. `SUPABASE_URL=127.0.0.1:54321`) in place.
 */
/**
 * Vite `server` options for `crbn up --lan`: HMR on the LAN IP, and a proxy so
 * phones/tablets hit Supabase API paths on the ERP port (3000) instead of :54321.
 */
export function devServerLanServerConfig() {
  if (process.env.CARBON_DEV_LAN !== "1") return {};

  const host = process.env.CARBON_DEV_HOST?.trim();
  const port = Number(process.env.PORT) || 3000;
  const apiPort = process.env.PORT_API || "54321";
  const target = `http://127.0.0.1:${apiPort}`;
  const proxyEntry = { target, changeOrigin: true, secure: false };

  return {
    allowedHosts: true,
    ...(host
      ? {
          hmr: {
            host,
            port,
            clientPort: port,
          },
        }
      : {}),
    // Magic links use API_EXTERNAL_URL (= SUPABASE_URL = http://<lan>:3000).
    // Proxy to Kong on the host loopback so LAN devices never need :54321 open.
    proxy: {
      "/auth": proxyEntry,
      "/rest": proxyEntry,
      "/storage": proxyEntry,
      "/realtime": { ...proxyEntry, ws: true },
      "/functions": proxyEntry,
      "/pg": proxyEntry,
    },
  };
}

/** @deprecated Use devServerLanServerConfig */
export function devServerLanOptions() {
  const { allowedHosts, hmr } = devServerLanServerConfig();
  return { allowedHosts, ...(hmr ? { hmr } : {}) };
}

export function applyDotenvToProcessEnv(mode, appDir) {
  const repoRoot = path.resolve(appDir, "../..");
  const fromFiles = {
    ...loadEnv(mode, appDir, ""),
    ...loadEnv(mode, repoRoot, ""),
  };
  const devOverwrite = mode !== "production";
  for (const [key, value] of Object.entries(fromFiles)) {
    if (value === undefined || value === "") continue;
    if (devOverwrite || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
