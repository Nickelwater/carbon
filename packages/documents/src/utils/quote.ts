import type { Database } from "@carbon/database";

export function getLineDescription(
  line: Database["public"]["Views"]["quoteLines"]["Row"]
) {
  if (line.customerPartId) {
    return line.customerPartRevision
      ? `${line.customerPartId} (Rev: ${line.customerPartRevision})`
      : line.customerPartId;
  }
  return line?.itemReadableId ?? "";
}

export function getLineDescriptionDetails(
  line: Database["public"]["Views"]["quoteLines"]["Row"]
) {
  return line?.description ? `${line.description}` : "";
}
