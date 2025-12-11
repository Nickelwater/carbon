import { Status } from "@carbon/react";
import type { trainingStatus } from "~/modules/people";

type TrainingStatusProps = {
  status: (typeof trainingStatus)[number] | null;
};

export default function TrainingStatus({ status }: TrainingStatusProps) {
  switch (status) {
    case "Draft":
      return <Status color="gray">Draft</Status>;
    case "Active":
      return <Status color="green">Active</Status>;
    case "Archived":
      return <Status color="red">Archived</Status>;
    default:
      return null;
  }
}
