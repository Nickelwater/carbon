import {
  getKanbanOperationQuantities,
  type KanbanOperationQuantityInput
} from "@carbon/utils";
import { Trans } from "@lingui/react/macro";
import { Heading } from "./Heading";
import { cn } from "./utils/cn";

type KanbanOperationQuantityProps = KanbanOperationQuantityInput & {
  className?: string;
  headingClassName?: string;
  subtitleClassName?: string;
  /** Target qty in header (default) vs completed/target progress */
  mode?: "target" | "progress";
};

/** Schedule kanban: cycles primary with parts subtitle when operation uses cycle time basis. */
export function KanbanOperationQuantity({
  className,
  headingClassName,
  subtitleClassName,
  mode = "target",
  ...input
}: KanbanOperationQuantityProps) {
  const qty = getKanbanOperationQuantities(input);
  const hasTarget = qty.progressMax > 0 || qty.targetParts > 0;

  if (!hasTarget) {
    return null;
  }

  return (
    <div
      className={cn("flex flex-col items-end text-right shrink-0", className)}
    >
      <Heading
        size="h4"
        className={cn("text-foreground leading-tight", headingClassName)}
      >
        {mode === "progress" ? (
          qty.trackCycles ? (
            <Trans>
              {qty.completedCycleCount} / {qty.targetCycleCount} cycles
            </Trans>
          ) : (
            <Trans>
              {qty.completedParts} / {qty.targetParts}
            </Trans>
          )
        ) : qty.trackCycles ? (
          <Trans>{qty.targetCycleCount} cycles</Trans>
        ) : (
          <Trans>{qty.targetParts}</Trans>
        )}
      </Heading>
      {qty.trackCycles && (
        <p
          className={cn(
            "text-xs text-muted-foreground leading-tight mt-0.5",
            subtitleClassName
          )}
        >
          {mode === "progress" ? (
            <Trans>
              {qty.completedParts} / {qty.targetParts} parts (
              {qty.partsPerCycle} per cycle)
            </Trans>
          ) : (
            <Trans>
              {qty.targetParts} parts ({qty.partsPerCycle} per cycle)
            </Trans>
          )}
        </p>
      )}
    </div>
  );
}
