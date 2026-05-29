import os from "node:os";
import { describe, expect, it, vi } from "vitest";
import { detectLanIPv4, isLanMode, resolveDevHost } from "./network.js";

describe("isLanMode", () => {
  it("is true for --lan", () => {
    expect(isLanMode({ lan: true })).toBe(true);
  });

  it("is true when CARBON_DEV_LAN=1", () => {
    vi.stubEnv("CARBON_DEV_LAN", "1");
    vi.stubEnv("CARBON_DEV_HOST", "");
    expect(isLanMode()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("is true when CARBON_DEV_HOST is set", () => {
    vi.stubEnv("CARBON_DEV_HOST", "192.168.1.10");
    vi.stubEnv("CARBON_DEV_LAN", "");
    expect(isLanMode()).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("resolveDevHost", () => {
  it("prefers explicit argument over env", () => {
    vi.stubEnv("CARBON_DEV_HOST", "10.0.0.1");
    expect(resolveDevHost("192.168.5.2")).toBe("192.168.5.2");
    vi.unstubAllEnvs();
  });

  it("uses CARBON_DEV_HOST when set", () => {
    vi.stubEnv("CARBON_DEV_HOST", "192.168.1.42");
    expect(resolveDevHost()).toBe("192.168.1.42");
    vi.unstubAllEnvs();
  });
});

describe("detectLanIPv4", () => {
  it("prefers 192.168.x addresses", () => {
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      eth0: [
        {
          address: "10.0.0.5",
          family: "IPv4",
          internal: false,
          netmask: "",
          mac: "",
          cidr: "",
          scopeid: 0
        },
        {
          address: "192.168.1.42",
          family: "IPv4",
          internal: false,
          netmask: "",
          mac: "",
          cidr: "",
          scopeid: 0
        }
      ]
    });
    expect(detectLanIPv4()).toBe("192.168.1.42");
    vi.restoreAllMocks();
  });
});
