import { cn, VStack } from "@carbon/react";
import type { CustomerPartMapping } from "./contractCustomerPartLabelLogic";
import { resolveContractCustomerPartLabel } from "./contractCustomerPartLabelLogic";

type ContractCustomerPartLabelProps = {
  internalReadableId: string | undefined;
  contractCustomer: boolean;
  customerParts: CustomerPartMapping[] | null | undefined;
  itemId: string | null | undefined;
  className?: string;
  /** Applied to the parenthesized internal part only (dual mode). */
  internalClassName?: string;
  variant?: "inline" | "stacked";
};

export function ContractCustomerPartLabel({
  internalReadableId,
  contractCustomer,
  customerParts,
  itemId,
  className,
  internalClassName,
  variant = "inline"
}: ContractCustomerPartLabelProps) {
  const resolved = resolveContractCustomerPartLabel(internalReadableId, {
    contractCustomer,
    customerParts,
    itemId
  });
  if (!resolved) return null;
  if (resolved.kind === "plain") {
    return (
      <span className={cn("font-semibold line-clamp-1", className)}>
        {resolved.text}
      </span>
    );
  }
  if (variant === "stacked") {
    return (
      <VStack spacing={0} className={cn("min-w-0", className)}>
        <span className="font-semibold line-clamp-1">
          {resolved.customerPn}
        </span>
        <span
          className={cn(
            "text-muted-foreground text-xs font-normal line-clamp-1 tabular-nums",
            internalClassName
          )}
        >
          {resolved.internalPn}
        </span>
      </VStack>
    );
  }
  return (
    <span className={className}>
      {resolved.customerPn}{" "}
      <span
        className={cn(
          "text-muted-foreground font-normal tabular-nums",
          internalClassName
        )}
      >
        ({resolved.internalPn})
      </span>
    </span>
  );
}
