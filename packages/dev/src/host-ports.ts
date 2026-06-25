import net from "node:net";
import { execa } from "execa";

export type PortRange = { start: number; end: number };

let cachedWindowsExclusions: PortRange[] | null | undefined;

export function isPortInExcludedRange(
  port: number,
  ranges: PortRange[]
): boolean {
  return ranges.some((range) => port >= range.start && port <= range.end);
}

export function parseWindowsExcludedPortRanges(output: string): PortRange[] {
  const ranges: PortRange[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s+(\d+)\s+(\d+)\s*$/);
    if (!match) continue;
    ranges.push({
      start: Number(match[1]),
      end: Number(match[2])
    });
  }
  return ranges;
}

export async function getWindowsExcludedPortRanges(): Promise<PortRange[]> {
  if (process.platform !== "win32") return [];
  if (cachedWindowsExclusions !== undefined) {
    return cachedWindowsExclusions ?? [];
  }

  const result = await execa(
    "netsh",
    ["interface", "ipv4", "show", "excludedportrange", "protocol=tcp"],
    { reject: false }
  );

  cachedWindowsExclusions =
    result.exitCode === 0 ? parseWindowsExcludedPortRanges(result.stdout) : [];
  return cachedWindowsExclusions;
}

/** Docker publishes host ports on 0.0.0.0 — match that, not loopback-only. */
export function canBindPort(port: number, host = "0.0.0.0"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function isDockerPublishPortUsable(
  port: number
): Promise<boolean> {
  const exclusions = await getWindowsExcludedPortRanges();
  if (isPortInExcludedRange(port, exclusions)) return false;
  return canBindPort(port, "0.0.0.0");
}
