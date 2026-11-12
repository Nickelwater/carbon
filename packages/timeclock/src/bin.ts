// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { getLogger } from "@carbon/logger";
import { ensureLoggingConfigured } from "@carbon/logger/config.server";
import { readTimeclockEnv } from "./env";
import { startTimeclockGateway } from "./gateway.server";

ensureLoggingConfigured();
const log = getLogger("timeclock");

const env = readTimeclockEnv();
if ("error" in env) {
  log.error(env.error);
  process.exit(1);
}

startTimeclockGateway(env);
