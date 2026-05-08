import { cn } from "@carbon/react";
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
};

export function ContractCustomerPartLabel({
  internalReadableId,
  contractCustomer,
  customerParts,
  itemId,
  className,
  internalClassName
}: ContractCustomerPartLabelProps) {
  const resolved = resolveContractCustomerPartLabel(internalReadableId, {
    contractCustomer,
    customerParts,
    itemId
  });
  if (!resolved) return null;
  if (resolved.kind === "plain") {
    return <span className={className}>{resolved.text}</span>;
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
