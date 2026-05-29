import os from "node:os";

/** Address dev servers bind to when serving the LAN (`crbn up --lan`). */
export const DEV_BIND_ALL = "0.0.0.0";

/** Loopback bind for normal local-only dev. */
export const DEV_BIND_LOCAL = "127.0.0.1";

/**
 * True when LAN mode is requested via CLI, env, or an explicit host override.
 * `CARBON_DEV_HOST` alone enables LAN mode (host is used for URLs + bind).
 */
export function isLanMode(opts?: { lan?: boolean }): boolean {
  if (opts?.lan === true) return true;
  if (process.env.CARBON_DEV_LAN === "1") return true;
  return Boolean(process.env.CARBON_DEV_HOST?.trim());
}

/**
 * Hostname or IPv4 written into ERP_URL / MES_URL / SUPABASE_URL for other
 * devices on the network. Uses `CARBON_DEV_HOST` when set; otherwise picks the
 * first non-internal IPv4 (preferring RFC1918 ranges).
 */
export function resolveDevHost(explicit?: string): string | undefined {
  const fromEnv = explicit?.trim() || process.env.CARBON_DEV_HOST?.trim();
  if (fromEnv) return fromEnv;
  return detectLanIPv4();
}

function isIPv4Family(family: string | number): boolean {
  return family === "IPv4" || family === 4;
}

/** Best-effort primary LAN IPv4 for this machine. */
export function detectLanIPv4(): string | undefined {
  const candidates: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    if (!entries) continue;
    for (const addr of entries) {
      if (!isIPv4Family(addr.family)) continue;
      if (addr.internal) continue;
      candidates.push(addr.address);
    }
  }
  const rank = (ip: string) => {
    if (ip.startsWith("192.168.")) return 3;
    if (ip.startsWith("10.")) return 2;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    return 1;
  };
  candidates.sort((a, b) => rank(b) - rank(a));
  return candidates[0];
}
