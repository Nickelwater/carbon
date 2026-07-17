import { path } from "~/utils/path";

export type InspectionSourceType = "Receipt" | "Job";

/** Route family for inbound (Receipt) vs lot (Job) inspection URLs. */
export function inspectionRouteFamily(
  sourceType: InspectionSourceType | string | null | undefined
) {
  if (sourceType === "Job") {
    return {
      list: path.to.lotInspections,
      detail: path.to.lotInspection,
      savedViewTable: "lotInspection" as const
    };
  }
  return {
    list: path.to.inboundInspections,
    detail: path.to.inboundInspection,
    savedViewTable: "inboundInspection" as const
  };
}
