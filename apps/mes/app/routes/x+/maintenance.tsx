import { getCarbonServiceRole } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Heading,
  HStack,
  Input,
  SidebarTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  VStack
} from "@carbon/react";
import { useMemo, useState } from "react";
import { BsExclamationSquareFill } from "react-icons/bs";
import { LuSearch, LuTriangleAlert, LuWrench } from "react-icons/lu";
import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { HighPriorityIcon } from "~/assets/icons/HighPriorityIcon";
import { LowPriorityIcon } from "~/assets/icons/LowPriorityIcon";
import { MediumPriorityIcon } from "~/assets/icons/MediumPriorityIcon";
import { getLocation } from "~/services/location.server";
import {
  getActiveMaintenanceDispatchesByLocation,
  getMaintenanceDispatchesAssignedTo
} from "~/services/maintenance.service";
import type { maintenanceDispatchPriority } from "~/services/models";
import { path } from "~/utils/path";

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {});
  const serviceRole = await getCarbonServiceRole();
  const { location } = await getLocation(request, serviceRole, {
    companyId,
    userId
  });

  const [allDispatches, assignedDispatches] = await Promise.all([
    getActiveMaintenanceDispatchesByLocation(client, location),
    getMaintenanceDispatchesAssignedTo(client, userId)
  ]);

  return {
    dispatches: allDispatches?.data ?? [],
    assignedDispatches: assignedDispatches?.data ?? [],
    locationId: location
  };
}

function getPriorityIcon(
  priority: (typeof maintenanceDispatchPriority)[number]
) {
  switch (priority) {
    case "Critical":
      return <BsExclamationSquareFill className="text-red-500" />;
    case "High":
      return <HighPriorityIcon />;
    case "Medium":
      return <MediumPriorityIcon />;
    case "Low":
      return <LowPriorityIcon />;
  }
}

function getStatusColor(status: string | null) {
  switch (status) {
    case "Open":
      return "bg-blue-500";
    case "Assigned":
      return "bg-yellow-500";
    case "In Progress":
      return "bg-emerald-500";
    default:
      return "bg-gray-500";
  }
}

function getOeeImpactColor(oeeImpact: string) {
  switch (oeeImpact) {
    case "Down":
      return "destructive";
    case "Planned":
      return "secondary";
    case "Impact":
      return "outline";
    default:
      return "outline";
  }
}

type MaintenanceDispatch = NonNullable<
  Awaited<ReturnType<typeof loader>>["dispatches"]
>[number];

function MaintenanceCard({ dispatch }: { dispatch: MaintenanceDispatch }) {
  if (!dispatch.id) {
    return null;
  }
  return (
    <Link to={path.to.maintenanceDetail(dispatch.id)}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer p-0">
        <CardHeader className="pb-2">
          <HStack className="justify-between">
            <HStack spacing={2}>
              <span className="font-mono text-sm">
                {dispatch.maintenanceDispatchId}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${getStatusColor(dispatch.status)}`}
              />
            </HStack>
            {getPriorityIcon(
              dispatch.priority as (typeof maintenanceDispatchPriority)[number]
            )}
          </HStack>
          <CardTitle className="text-base">{dispatch.workCenterName}</CardTitle>
          <CardDescription className="text-xs">
            {dispatch.severity}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HStack className="justify-between">
            <Badge
              variant={getOeeImpactColor(dispatch.oeeImpact ?? "No Impact")}
            >
              {dispatch.oeeImpact ?? "No Impact"}
            </Badge>
            {dispatch.assigneeName && (
              <span className="text-xs text-muted-foreground">
                {dispatch.assigneeName}
              </span>
            )}
          </HStack>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({
  message,
  onClear
}: {
  message: string;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 w-full h-[calc(100dvh-var(--header-height)*2-40px)] items-center justify-center gap-4">
      <div className="flex justify-center items-center h-12 w-12 rounded-full bg-foreground text-background">
        <LuTriangleAlert className="h-6 w-6" />
      </div>
      <span className="text-xs font-mono font-light text-foreground uppercase">
        {message}
      </span>
      {onClear && <Button onClick={onClear}>Clear Search</Button>}
    </div>
  );
}

export default function MaintenanceRoute() {
  const { dispatches, assignedDispatches } = useLoaderData<typeof loader>();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const blockingDispatches = useMemo(() => {
    return dispatches.filter(
      (d) => d.oeeImpact === "Down" || d.oeeImpact === "Planned"
    );
  }, [dispatches]);

  const filterDispatches = (dispatchList: typeof dispatches) => {
    if (!searchTerm) return dispatchList;
    const lowercasedTerm = searchTerm.toLowerCase();
    return dispatchList.filter(
      (dispatch) =>
        dispatch.maintenanceDispatchId
          ?.toLowerCase()
          .includes(lowercasedTerm) ||
        dispatch.workCenterName?.toLowerCase().includes(lowercasedTerm) ||
        dispatch.severity?.toLowerCase().includes(lowercasedTerm) ||
        dispatch.assigneeName?.toLowerCase().includes(lowercasedTerm)
    );
  };

  const getActiveDispatches = () => {
    switch (activeTab) {
      case "assigned":
        return filterDispatches(assignedDispatches);
      case "blocking":
        return filterDispatches(blockingDispatches);
      default:
        return filterDispatches(dispatches);
    }
  };

  const activeDispatches = getActiveDispatches();

  return (
    <div className="flex flex-col flex-1">
      <header className="sticky top-0 z-10 flex h-[var(--header-height)] shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 border-b bg-background">
        <div className="flex items-center gap-2 px-2">
          <SidebarTrigger />
          <Heading size="h4">Maintenance</Heading>
        </div>
      </header>

      <main className="h-[calc(100dvh-var(--header-height))] w-full overflow-y-auto scrollbar-thin scrollbar-thumb-accent scrollbar-track-transparent">
        <div className="w-full p-4">
          <VStack spacing={4}>
            <div className="w-full">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <HStack className="justify-between w-full">
                  <TabsList>
                    <TabsTrigger value="all">
                      All
                      {dispatches.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {dispatches.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="assigned">
                      Assigned to Me
                      {assignedDispatches.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {assignedDispatches.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="blocking">
                      Blocking
                      {blockingDispatches.length > 0 && (
                        <Badge variant="destructive" className="ml-2">
                          {blockingDispatches.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                  <div className="relative w-64">
                    <LuSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search"
                      className="pl-8"
                    />
                  </div>
                </HStack>
                <TabsContent value="all" className="mt-4">
                  {activeDispatches.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))] gap-4">
                      {activeDispatches.map((dispatch) => (
                        <MaintenanceCard
                          key={dispatch.id}
                          dispatch={dispatch}
                        />
                      ))}
                    </div>
                  ) : searchTerm ? (
                    <EmptyState
                      message="No results found"
                      onClear={() => setSearchTerm("")}
                    />
                  ) : (
                    <EmptyState message="No active maintenance dispatches" />
                  )}
                </TabsContent>
                <TabsContent value="assigned" className="mt-4">
                  {activeDispatches.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))] gap-4">
                      {activeDispatches.map((dispatch) => (
                        <MaintenanceCard
                          key={dispatch.id}
                          dispatch={dispatch}
                        />
                      ))}
                    </div>
                  ) : searchTerm ? (
                    <EmptyState
                      message="No results found"
                      onClear={() => setSearchTerm("")}
                    />
                  ) : (
                    <EmptyState message="No dispatches assigned to you" />
                  )}
                </TabsContent>
                <TabsContent value="blocking" className="mt-4">
                  {activeDispatches.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))] gap-4">
                      {activeDispatches.map((dispatch) => (
                        <MaintenanceCard
                          key={dispatch.id}
                          dispatch={dispatch}
                        />
                      ))}
                    </div>
                  ) : searchTerm ? (
                    <EmptyState
                      message="No results found"
                      onClear={() => setSearchTerm("")}
                    />
                  ) : (
                    <EmptyState message="No work centers are blocked" />
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </VStack>
        </div>
      </main>
    </div>
  );
}
