// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

export { readTimeclockEnv, type TimeclockEnv } from "./env";
export {
  decideToggleAction,
  type PunchStatus,
  propunchTimeToIso,
  punchIdempotencyKey,
  type ToggleDecision
} from "./ingest";
export {
  getPayPeriodContaining,
  type PairedSegment,
  type PairResult,
  type PayPeriodBounds,
  type PunchLike,
  pairPunches,
  pairPunchesByDay,
  shiftPayPeriod
} from "./pair";
export {
  ackReg,
  ackSendlog,
  type ClockMessage,
  type CollectLogCommand,
  type CollectLogMode,
  type CollectLogReply,
  collectLogHasMorePages,
  formatCloudtime,
  getAllLogCommand,
  getCollectLogCommand,
  getNewLogCommand,
  isCollectLogReply,
  normalizeProtocolName,
  parseClockMessage,
  type RegMessage,
  type SendlogMessage,
  type SendlogRecord
} from "./protocol";
