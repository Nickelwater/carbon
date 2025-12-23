import { requirePermissions } from "@carbon/auth/auth.server";
import { Database } from "@carbon/database";
import { Hidden, ValidatedForm } from "@carbon/form";
import {
  Badge,
  Button,
  Heading,
  HStack,
  SidebarTrigger,
  Status,
  VStack
} from "@carbon/react";
import { useEffect, useMemo } from "react";
import { BsExclamationSquareFill } from "react-icons/bs";
import {
  LuArrowLeft,
  LuCheck,
  LuPause,
  LuPlay,
  LuWrench
} from "react-icons/lu";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { z } from "zod/v3";
import { HighPriorityIcon } from "~/assets/icons/HighPriorityIcon";
import { LowPriorityIcon } from "~/assets/icons/LowPriorityIcon";
import { MediumPriorityIcon } from "~/assets/icons/MediumPriorityIcon";
import EmployeeAvatar from "~/components/EmployeeAvatar";
import {
  getActiveMaintenanceEventByEmployee,
  getMaintenanceDispatch,
  getMaintenanceDispatchEvents,
  getMaintenanceDispatchItems
} from "~/services/maintenance.service";
import type { maintenanceDispatchPriority } from "~/services/models";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, userId } = await requirePermissions(request, {});
  const { dispatchId } = params;

  if (!dispatchId) {
    throw new Error("Dispatch ID is required");
  }

  const [dispatch, events, items, activeEvent] = await Promise.all([
    getMaintenanceDispatch(client, dispatchId),
    getMaintenanceDispatchEvents(client, dispatchId),
    getMaintenanceDispatchItems(client, dispatchId),
    getActiveMaintenanceEventByEmployee(client, userId)
  ]);

  return {
    dispatch: dispatch.data,
    events: events.data ?? [],
    items: items.data ?? [],
    activeEvent: activeEvent.data,
    userId
  };
}

function getPriorityIcon(
  priority: (typeof maintenanceDispatchPriority)[number]
) {
  switch (priority) {
    case "Critical":
      return <BsExclamationSquareFill className="text-red-500 h-5 w-5" />;
    case "High":
      return <HighPriorityIcon className="h-5 w-5" />;
    case "Medium":
      return <MediumPriorityIcon className="h-5 w-5" />;
    case "Low":
      return <LowPriorityIcon className="h-5 w-5" />;
  }
}

type MaintenanceStatusProps = {
  status?: Database["public"]["Enums"]["maintenanceDispatchStatus"];
  className?: string;
};

function MaintenanceStatus({ status, className }: MaintenanceStatusProps) {
  switch (status) {
    case "Open":
      return (
        <Status color="gray" className={className}>
          {status}
        </Status>
      );
    case "Assigned":
      return (
        <Status color="yellow" className={className}>
          {status}
        </Status>
      );
    case "In Progress":
      return (
        <Status color="blue" className={className}>
          {status}
        </Status>
      );
    case "Completed":
      return (
        <Status color="green" className={className}>
          {status}
        </Status>
      );
    case "Cancelled":
      return (
        <Status color="red" className={className}>
          {status}
        </Status>
      );
    default:
      return null;
  }
}

function getOeeImpactBadge(
  oeeImpact: Database["public"]["Enums"]["oeeImpact"]
) {
  switch (oeeImpact) {
    case "Down":
      return <Badge variant="destructive">Down</Badge>;
    case "Planned":
      return <Badge variant="secondary">Planned</Badge>;
    case "Impact":
      return <Badge variant="yellow">Impact</Badge>;
    default:
      return <Badge variant="outline">No Impact</Badge>;
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

const eventValidator = z.object({
  action: z.enum(["Start", "End", "Complete"]),
  dispatchId: z.string(),
  workCenterId: z.string().optional(),
  eventId: z.string().optional()
});

export default function MaintenanceDetailRoute() {
  const { dispatch, events, items, activeEvent } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  // Check if user has an active event on THIS dispatch
  const myActiveEvent = useMemo(() => {
    if (!activeEvent) return null;
    if (activeEvent.maintenanceDispatchId === dispatch?.id) {
      return activeEvent;
    }
    return null;
  }, [activeEvent, dispatch?.id]);

  const isWorking = !!myActiveEvent;
  const isCompleted = dispatch?.status === "Completed";
  const canComplete = isWorking || dispatch?.status === "In Progress";

  // Calculate total time worked
  const totalDuration = useMemo(() => {
    return events.reduce((total, event) => {
      return total + (event.duration ?? 0);
    }, 0);
  }, [events]);

  if (!dispatch) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <span className="text-muted-foreground">Dispatch not found</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="sticky top-0 z-10 flex h-[var(--header-height)] shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 border-b bg-background">
        <div className="flex items-center gap-2 px-2 w-full justify-between">
          <HStack>
            <SidebarTrigger />
            <Link to={path.to.maintenance}>
              <Button variant="ghost" size="sm">
                <LuArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Heading size="h4">{dispatch.maintenanceDispatchId}</Heading>
            <MaintenanceStatus status={dispatch.status} />
          </HStack>
          <HStack>
            {getPriorityIcon(
              dispatch.priority as (typeof maintenanceDispatchPriority)[number]
            )}
          </HStack>
        </div>
      </header>

      <main className="h-[calc(100dvh-var(--header-height))] w-full overflow-y-auto scrollbar-thin scrollbar-thumb-accent scrollbar-track-transparent p-4">
        <VStack spacing={4} className="max-w-2xl mx-auto">
          {/* Work Center & OEE Impact */}
          <div className="w-full p-4 bg-card rounded-lg border">
            <VStack spacing={2} className="items-start">
              <span className="text-sm text-muted-foreground">Work Center</span>
              <span className="text-lg font-semibold">
                {dispatch.workCenter?.name ?? "Unknown"}
              </span>
              <HStack className="mt-2">
                {getOeeImpactBadge(dispatch.oeeImpact)}
                <Badge variant="outline">{dispatch.severity}</Badge>
              </HStack>
            </VStack>
          </div>

          {/* Time Tracking Controls */}
          {!isCompleted && (
            <div className="w-full p-6 bg-card rounded-lg border">
              <VStack spacing={4}>
                <span className="text-sm text-muted-foreground">
                  Time Worked: {formatDuration(totalDuration)}
                </span>
                <HStack spacing={4} className="justify-center w-full">
                  <ValidatedForm
                    method="post"
                    action={path.to.maintenanceEvent}
                    validator={eventValidator}
                    fetcher={fetcher}
                    defaultValues={{
                      action: isWorking ? "End" : "Start",
                      dispatchId: dispatch.id,
                      workCenterId: dispatch.workCenterId ?? undefined,
                      eventId: myActiveEvent?.id
                    }}
                  >
                    <Hidden name="dispatchId" value={dispatch.id} />
                    <Hidden
                      name="workCenterId"
                      value={dispatch.workCenterId ?? ""}
                    />
                    <Hidden name="eventId" value={myActiveEvent?.id ?? ""} />
                    <Hidden name="action" value={isWorking ? "End" : "Start"} />
                    <Button
                      type="submit"
                      size="lg"
                      variant={isWorking ? "destructive" : "primary"}
                      className="h-16 w-16 rounded-full"
                      disabled={fetcher.state !== "idle"}
                    >
                      {isWorking ? (
                        <LuPause className="h-6 w-6" />
                      ) : (
                        <LuPlay className="h-6 w-6" />
                      )}
                    </Button>
                  </ValidatedForm>

                  {canComplete && (
                    <ValidatedForm
                      method="post"
                      action={path.to.maintenanceEvent}
                      validator={eventValidator}
                      fetcher={fetcher}
                      defaultValues={{
                        action: "Complete",
                        dispatchId: dispatch.id,
                        eventId: myActiveEvent?.id
                      }}
                    >
                      <Hidden name="dispatchId" value={dispatch.id} />
                      <Hidden name="eventId" value={myActiveEvent?.id ?? ""} />
                      <Hidden name="action" value="Complete" />
                      <Button
                        type="submit"
                        size="lg"
                        variant="secondary"
                        className="h-16 w-16 rounded-full"
                        disabled={fetcher.state !== "idle"}
                      >
                        <LuCheck className="h-6 w-6" />
                      </Button>
                    </ValidatedForm>
                  )}
                </HStack>
                <span className="text-xs text-muted-foreground">
                  {isWorking
                    ? "Tap to pause work"
                    : "Tap to start working on this maintenance"}
                </span>
              </VStack>
            </div>
          )}

          {/* Time Entries */}
          {events.length > 0 && (
            <div className="w-full p-4 bg-card rounded-lg border">
              <VStack spacing={2} className="items-start">
                <span className="text-sm font-medium">Time Entries</span>
                <div className="w-full divide-y">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="py-2 flex justify-between items-center"
                    >
                      <VStack spacing={2} className="items-start">
                        <EmployeeAvatar
                          employeeId={event.employeeId}
                          size="xs"
                        />

                        <span className="text-xs text-muted-foreground">
                          {new Date(event.startTime).toLocaleString()}
                          {event.endTime &&
                            ` - ${new Date(event.endTime).toLocaleTimeString()}`}
                        </span>
                      </VStack>
                      <span className="text-sm font-mono">
                        {event.duration
                          ? formatDuration(event.duration)
                          : "Active"}
                      </span>
                    </div>
                  ))}
                </div>
              </VStack>
            </div>
          )}

          {/* Materials */}
          {items.length > 0 && (
            <div className="w-full p-4 bg-card rounded-lg border">
              <VStack spacing={2} className="items-start">
                <span className="text-sm font-medium">Materials</span>
                <div className="w-full divide-y">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="py-2 flex justify-between items-center"
                    >
                      <span className="text-sm">{item.item?.name}</span>
                      <span className="text-sm font-mono">
                        {item.quantity} {item.unitOfMeasureCode}
                      </span>
                    </div>
                  ))}
                </div>
              </VStack>
            </div>
          )}

          {/* Completed State */}
          {isCompleted && (
            <div className="w-full p-4 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <VStack spacing={2}>
                <LuCheck className="h-8 w-8 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Maintenance Completed
                </span>
                <span className="text-xs text-muted-foreground">
                  Total time: {formatDuration(totalDuration)}
                </span>
              </VStack>
            </div>
          )}
        </VStack>
      </main>
    </div>
  );
}
