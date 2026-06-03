import { useField } from "@carbon/form";
import { FormControl, FormHelperText, FormLabel } from "@carbon/react";
import {
  defaultVariableFactorUnit,
  getUnitHint as getUnitHintFromUtils,
  isCycleTimeBasis
} from "@carbon/utils";
import { useLingui } from "@lingui/react/macro";

import { Select } from "~/components";
import type { SelectProps } from "~/components/Select";
import type { StandardFactor } from "~/modules/shared";

export type UnitHintProps = Omit<SelectProps, "onChange" | "options"> & {
  name: string;
  defaultUnit?: StandardFactor;
  label?: string;
  helperText?: string;
  isOptional?: boolean;
  isConfigured?: boolean;
  timeBasis?: string;
  value: string;
  onChange: (newValue: string) => void;
  onConfigure?: () => void;
};

export const getUnitHint = (u?: string, timeBasis?: string) =>
  getUnitHintFromUtils(u, timeBasis);

const UnitHint = ({
  defaultUnit,
  name,
  label,
  helperText,
  isOptional,
  isConfigured,
  timeBasis = "Piece",
  value = getUnitHint(defaultUnit, timeBasis),
  onConfigure,
  ...props
}: UnitHintProps) => {
  const { t } = useLingui();
  const { isOptional: fieldIsOptional } = useField(name);
  const resolvedIsOptional = isOptional ?? fieldIsOptional ?? false;
  const cycleMode = isCycleTimeBasis(timeBasis);

  const hintOptions = cycleMode
    ? (["Fixed", "Per Cycle"] as const)
    : (["Fixed", "Per Unit"] as const);

  const translateUnitHint = (v: string) => {
    if (v === "Fixed") return t`Fixed`;
    if (v === "Per Cycle") return t`Per Cycle`;
    return t`Per Piece`;
  };

  const onChange = (hint: string) => {
    props?.onChange?.(hint);
  };

  return (
    <FormControl className={props.className}>
      {label && (
        <FormLabel
          htmlFor={name}
          isConfigured={isConfigured}
          isOptional={resolvedIsOptional}
          onConfigure={onConfigure}
        >
          {label}
        </FormLabel>
      )}

      <Select
        {...props}
        value={value}
        onChange={onChange}
        className="w-full"
        options={hintOptions.map((u) => ({
          value: u,
          label: translateUnitHint(u)
        }))}
      />

      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};

UnitHint.displayName = "UnitHint";

export default UnitHint;

export function unitForHint(hint: string, timeBasis: string): StandardFactor {
  if (hint === "Fixed") {
    return "Total Minutes";
  }
  return defaultVariableFactorUnit(timeBasis);
}
