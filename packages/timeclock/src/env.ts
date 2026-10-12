// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

export type TimeclockEnv = {
  companyId: string;
  host: string;
  port: number;
};

export function readTimeclockEnv(
  env: NodeJS.ProcessEnv = process.env
): TimeclockEnv | { error: string } {
  const companyId = env.TIMECLOCK_COMPANY_ID?.trim();
  if (!companyId) {
    return {
      error: "TIMECLOCK_COMPANY_ID is required to start the timeclock gateway"
    };
  }

  const host = env.TIMECLOCK_HOST?.trim() || "0.0.0.0";
  const portRaw = env.TIMECLOCK_PORT?.trim() || "7788";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: `Invalid TIMECLOCK_PORT: ${portRaw}` };
  }

  return { companyId, host, port };
}
