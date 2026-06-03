import type { SelectProps } from "@carbon/form";
import { SelectControlled } from "@carbon/form";
import { factorUnitsForTimeBasis } from "@carbon/utils";
import { useLingui } from "@lingui/react/macro";

export type StandardFactorSelectProps = Omit<SelectProps, "options"> & {
  hint?: string;
  timeBasis?: string;
};

const StandardFactor = ({
  label,
  hint,
  timeBasis = "Piece",
  ...props
}: StandardFactorSelectProps) => {
  const { t } = useLingui();

  const translateStandardFactorType = (v: string) => {
    switch (v) {
      case "Hours/Piece":
        return t`Hours/Piece`;
      case "Hours/100 Pieces":
        return t`Hours/100 Pieces`;
      case "Hours/1000 Pieces":
        return t`Hours/1000 Pieces`;
      case "Minutes/Piece":
        return t`Minutes/Piece`;
      case "Minutes/100 Pieces":
        return t`Minutes/100 Pieces`;
      case "Minutes/1000 Pieces":
        return t`Minutes/1000 Pieces`;
      case "Pieces/Hour":
        return t`Pieces/Hour`;
      case "Pieces/Minute":
        return t`Pieces/Minute`;
      case "Seconds/Piece":
        return t`Seconds/Piece`;
      case "Hours/Cycle":
        return t`Hours/Cycle`;
      case "Hours/100 Cycles":
        return t`Hours/100 Cycles`;
      case "Hours/1000 Cycles":
        return t`Hours/1000 Cycles`;
      case "Minutes/Cycle":
        return t`Minutes/Cycle`;
      case "Minutes/100 Cycles":
        return t`Minutes/100 Cycles`;
      case "Minutes/1000 Cycles":
        return t`Minutes/1000 Cycles`;
      case "Cycles/Hour":
        return t`Cycles/Hour`;
      case "Cycles/Minute":
        return t`Cycles/Minute`;
      case "Seconds/Cycle":
        return t`Seconds/Cycle`;
      case "Total Hours":
        return t`Total Hours`;
      case "Total Minutes":
        return t`Total Minutes`;
      default:
        return v;
    }
  };

  const options = factorUnitsForTimeBasis(
    timeBasis,
    hint as "Fixed" | "Per Unit" | "Per Cycle" | undefined
  ).map((type) => ({
    value: type,
    label: translateStandardFactorType(type)
  }));

  return (
    <SelectControlled
      {...props}
      label={label ?? t`Default Unit`}
      options={options}
    />
  );
};

export default StandardFactor;
