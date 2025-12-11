import type { SelectProps } from "@carbon/form";
import { Select } from "@carbon/form";
import { useFetcher } from "@remix-run/react";
import { useEffect, useMemo } from "react";
import type { getShiftsList } from "~/modules/people";
import { path } from "~/utils/path";

type ShiftSelectProps = Omit<SelectProps, "options"> & {
  location?: string;
};

const Shift = (props: ShiftSelectProps) => {
  const options = useShifts({
    location: props.location
  });

  return (
    <Select options={options} {...props} label={props?.label ?? "Shift"} />
  );
};

export default Shift;

export const useShifts = (props?: { location?: string }) => {
  const shiftFetcher = useFetcher<Awaited<ReturnType<typeof getShiftsList>>>();

  useEffect(() => {
    if (props?.location) {
      shiftFetcher.load(path.to.api.shifts(props.location));
    }
  }, [props?.location]);

  const options = useMemo(
    () =>
      shiftFetcher.data?.data?.map((c) => ({
        value: c.id,
        label: c.name
      })) ?? [],

    [shiftFetcher.data]
  );

  return options;
};
