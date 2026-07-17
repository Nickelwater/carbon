import { Badge } from "@carbon/react";
import { getItemReadableId } from "@carbon/utils";
import { useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";
import { memo, useMemo } from "react";
import {
  LuBookMarked,
  LuCalendar,
  LuClipboardCheck,
  LuHash,
  LuWorkflow
} from "react-icons/lu";
import { Hyperlink, Table } from "~/components";
import { useDateFormatter, useUrlParams } from "~/hooks";
import { inboundInspectionStatus } from "~/modules/quality/quality.models";
import { useItems } from "~/stores/items";
import { path } from "~/utils/path";

export type InProcessInspectionRow = {
  id: string;
  inspectionId: string;
  status: string;
  itemId: string | null;
  item?: { readableId?: string; name?: string } | null;
  jobId: string | null;
  jobOperationDescription: string | null;
  triggerType: string | null;
  triggerOrdinal: number | null;
  createdAt: string | null;
  inspectionSample?: { status: string }[];
};

function getStatusVariant(status: string) {
  if (status === "Passed") return "green";
  if (status === "Failed") return "red";
  if (status === "In Progress") return "blue";
  if (status === "Cancelled") return "secondary";
  return "secondary";
}

type InProcessInspectionsTableProps = {
  data: InProcessInspectionRow[];
  count: number;
};

const InProcessInspectionsTable = memo(
  ({ data, count }: InProcessInspectionsTableProps) => {
    const { t } = useLingui();
    const { formatDate } = useDateFormatter();
    const [params] = useUrlParams();
    const [items] = useItems();

    const columns = useMemo<ColumnDef<InProcessInspectionRow>[]>(() => {
      return [
        {
          accessorKey: "inspectionId",
          header: t`Run`,
          cell: ({ row }) => (
            <Hyperlink
              to={`${path.to.inProcessInspection(row.original.id)}?${params.toString()}`}
            >
              {row.original.inspectionId}
            </Hyperlink>
          ),
          meta: { icon: <LuBookMarked /> }
        },
        {
          accessorKey: "itemId",
          header: t`Item`,
          cell: ({ row }) => (
            <div className="flex flex-col gap-0">
              <span className="text-sm font-medium">
                {getItemReadableId(items, row.original.itemId ?? "") ??
                  row.original.item?.readableId ??
                  ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {row.original.item?.name}
              </span>
            </div>
          ),
          meta: { icon: <LuBookMarked /> }
        },
        {
          id: "job",
          header: t`Job / Operation`,
          cell: ({ row }) => (
            <div className="flex flex-col gap-0 text-sm">
              <span>{row.original.jobId ?? ""}</span>
              <span className="text-xs text-muted-foreground">
                {row.original.jobOperationDescription}
              </span>
            </div>
          ),
          meta: { icon: <LuWorkflow /> }
        },
        {
          id: "trigger",
          header: t`Trigger`,
          cell: ({ row }) => (
            <span className="text-sm">
              {row.original.triggerType} #{row.original.triggerOrdinal}
            </span>
          ),
          meta: { icon: <LuHash /> }
        },
        {
          accessorKey: "status",
          header: t`Status`,
          cell: ({ row }) => (
            <Badge variant={getStatusVariant(row.original.status)}>
              {row.original.status}
            </Badge>
          ),
          meta: {
            icon: <LuClipboardCheck />,
            filter: {
              type: "static",
              options: inboundInspectionStatus.map((s) => ({
                value: s,
                label: <Badge variant={getStatusVariant(s)}>{s}</Badge>
              }))
            }
          }
        },
        {
          accessorKey: "createdAt",
          header: t`Created`,
          cell: ({ row }) =>
            row.original.createdAt ? formatDate(row.original.createdAt) : "",
          meta: { icon: <LuCalendar /> }
        }
      ];
    }, [items, t, params, formatDate]);

    return (
      <Table<InProcessInspectionRow>
        data={data}
        columns={columns}
        count={count ?? 0}
        title={t`In-Process Inspections`}
        table="inProcessInspection"
        withSavedView
      />
    );
  }
);

InProcessInspectionsTable.displayName = "InProcessInspectionsTable";
export default InProcessInspectionsTable;
