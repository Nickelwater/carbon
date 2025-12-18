import type { Database } from "@carbon/database";
import { Status } from "@carbon/react";

type RiskTypeProps = {
  type?: Database["public"]["Enums"]["riskRegisterType"] | null;
};

const RiskType = ({ type }: RiskTypeProps) => {
  switch (type) {
    case "Risk":
      return <Status color="red">{type}</Status>;
    case "Opportunity":
      return <Status color="green">{type}</Status>;

    default:
      return null;
  }
};

export default RiskType;
