// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { computeOperationDurations } from "@carbon/utils";

export function makeDurations<
  T extends {
    setupTime?: number;
    setupUnit: string;
    laborTime?: number;
    laborUnit: string;
    machineTime?: number;
    machineUnit: string;
    operationQuantity: number | null;
    partsPerCycle?: unknown;
    timeBasis?: unknown;
  }
>(operation: T) {
  return computeOperationDurations(operation);
}
