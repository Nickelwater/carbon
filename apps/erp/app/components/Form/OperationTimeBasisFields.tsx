import { Hidden, NumberControlled } from "@carbon/form";
import { HStack, Label, Switch } from "@carbon/react";
import {
  convertFactorUnitForTimeBasis,
  getUnitHint,
  isCycleTimeBasis
} from "@carbon/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Dispatch, SetStateAction } from "react";

type TimeFields = {
  timeBasis: string;
  partsPerCycle: number;
  setupUnit: string;
  setupUnitHint: string;
  laborUnit: string;
  laborUnitHint: string;
  machineUnit: string;
  machineUnitHint: string;
};

type OperationTimeBasisFieldsProps = {
  processData: TimeFields;
  setProcessData: Dispatch<SetStateAction<TimeFields>>;
};

export function OperationTimeBasisFields({
  processData,
  setProcessData
}: OperationTimeBasisFieldsProps) {
  const { t } = useLingui();
  const cycleMode = isCycleTimeBasis(processData.timeBasis);

  const setTimeBasis = (cycle: boolean) => {
    const timeBasis = cycle ? "Cycle" : "Piece";
    setProcessData((d) => ({
      ...d,
      timeBasis,
      partsPerCycle: cycle ? Math.max(d.partsPerCycle, 1) : 1,
      setupUnit: convertFactorUnitForTimeBasis(d.setupUnit, timeBasis),
      setupUnitHint: getUnitHint(
        convertFactorUnitForTimeBasis(d.setupUnit, timeBasis),
        timeBasis
      ),
      laborUnit: convertFactorUnitForTimeBasis(d.laborUnit, timeBasis),
      laborUnitHint: getUnitHint(
        convertFactorUnitForTimeBasis(d.laborUnit, timeBasis),
        timeBasis
      ),
      machineUnit: convertFactorUnitForTimeBasis(d.machineUnit, timeBasis),
      machineUnitHint: getUnitHint(
        convertFactorUnitForTimeBasis(d.machineUnit, timeBasis),
        timeBasis
      )
    }));
  };

  return (
    <>
      <Hidden name="timeBasis" value={processData.timeBasis} />
      <div className="grid w-full gap-x-8 gap-y-4 grid-cols-1 lg:grid-cols-3 pb-4">
        <HStack className="items-center gap-3">
          <Label>
            <Trans>Per piece</Trans>
          </Label>
          <Switch
            isChecked={cycleMode}
            onCheckedChange={(checked) => setTimeBasis(checked === true)}
            aria-label={t`Toggle per cycle timing`}
          />
          <Label>
            <Trans>Per cycle</Trans>
          </Label>
        </HStack>
        {cycleMode && (
          <NumberControlled
            name="partsPerCycle"
            label={t`Parts per Cycle`}
            minValue={1}
            value={processData.partsPerCycle}
            onChange={(newValue) =>
              setProcessData((d) => ({
                ...d,
                partsPerCycle: newValue ?? 1
              }))
            }
          />
        )}
      </div>
    </>
  );
}
