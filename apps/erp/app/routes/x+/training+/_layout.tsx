import { Outlet } from "@remix-run/react";
import type { MetaFunction } from "@vercel/remix";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";

export const meta: MetaFunction = () => {
  return [{ title: "Carbon | Training" }];
};

export const handle: Handle = {
  breadcrumb: "People",
  to: path.to.people,
  module: "purchasing",
};

export default function SupplierRoute() {
  return <Outlet />;
}
