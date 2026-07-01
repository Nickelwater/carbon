import { afterEach, describe, expect, it, vi } from "vitest";
import { devServerLanOptions, devServerLanServerConfig } from "../vite.js";

describe("devServerLanServerConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns empty config outside LAN mode", () => {
    expect(devServerLanServerConfig()).toEqual({});
  });

  it("enables allowedHosts and Supabase proxy without pinning HMR host", () => {
    vi.stubEnv("CARBON_DEV_LAN", "1");
    vi.stubEnv("CARBON_DEV_HOST", "192.168.218.1");
    vi.stubEnv("PORT", "3000");
    vi.stubEnv("PORT_API", "54321");

    const config = devServerLanServerConfig();

    expect(config.allowedHosts).toBe(true);
    expect(config.hmr).toBeUndefined();
    expect(config.proxy?.["/realtime"]).toMatchObject({
      target: "http://127.0.0.1:54321",
      ws: true
    });
  });

  it("deprecated devServerLanOptions omits hmr", () => {
    vi.stubEnv("CARBON_DEV_LAN", "1");
    vi.stubEnv("CARBON_DEV_HOST", "10.66.77.77");

    expect(devServerLanOptions()).toEqual({ allowedHosts: true });
  });
});
