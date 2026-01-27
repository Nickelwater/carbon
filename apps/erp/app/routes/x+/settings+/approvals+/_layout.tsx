import { Outlet } from "react-router";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";

export const handle: Handle = {
  breadcrumb: "Approvals",
  to: path.to.approvalRules
};

export default function ApprovalsLayout() {
  return <Outlet />;
}
