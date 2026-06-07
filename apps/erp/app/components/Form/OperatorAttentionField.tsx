import { Hidden, NumberControlled } from "@carbon/form";
import { FormHelperText } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";

type OperatorAttentionFieldProps = {
  name?: string;
  value: number;
  onChange: (value: number) => void;
  isOptional?: boolean;
};

export function OperatorAttentionField({
  name = "operatorAttention",
  value,
  onChange,
  isOptional = false
}: OperatorAttentionFieldProps) {
  const { t } = useLingui();

  return (
    <div className="flex flex-col gap-1">
      <Hidden name={name} value={String(value)} />
      <NumberControlled
        name={`${name}Display`}
        label={t`Operator attention`}
        isOptional={isOptional}
        minValue={0}
        value={value}
        onChange={onChange}
      />
      <FormHelperText>
        <Trans>
          1 = full operator per run hour; 0 = unattended; 2 = two operators
        </Trans>
      </FormHelperText>
    </div>
  );
}
