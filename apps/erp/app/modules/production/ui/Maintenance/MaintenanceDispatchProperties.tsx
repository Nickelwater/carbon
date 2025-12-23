import { DateTimePicker, Select, ValidatedForm } from "@carbon/form";
import {
  Button,
  HStack,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  VStack
} from "@carbon/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LuCopy, LuKeySquare, LuLink } from "react-icons/lu";
import { useFetcher, useParams } from "react-router";
import { z } from "zod/v3";
import {
  Assignee,
  EmployeeAvatar,
  useOptimisticAssignment
} from "~/components";
import { useWorkCenters } from "~/components/Form/WorkCenter";
import { usePermissions, useRouteData } from "~/hooks";
import { path } from "~/utils/path";
import { copyToClipboard } from "~/utils/string";
import {
  maintenanceDispatchPriority,
  maintenanceSeverity,
  maintenanceSource,
  oeeImpact
} from "../../production.models";
import type { MaintenanceDispatchDetail } from "../../types";
import MaintenancePriority from "./MaintenancePriority";
import MaintenanceSeverity from "./MaintenanceSeverity";
import MaintenanceSource from "./MaintenanceSource";
import MaintenanceStatus from "./MaintenanceStatus";

const MaintenanceDispatchProperties = () => {
  const { dispatchId } = useParams();
  if (!dispatchId) throw new Error("dispatchId not found");

  const permissions = usePermissions();

  const routeData = useRouteData<{
    dispatch: MaintenanceDispatchDetail;
    failureModes: { id: string; name: string }[];
  }>(path.to.maintenanceDispatch(dispatchId));

  const { options: workCenterOptions } = useWorkCenters({});

  const optimisticAssignment = useOptimisticAssignment({
    id: dispatchId,
    table: "maintenanceDispatch"
  });
  const assignee =
    optimisticAssignment !== undefined
      ? optimisticAssignment
      : routeData?.dispatch?.assignee;

  const fetcher = useFetcher<{ error?: { message: string } }>();
  useEffect(() => {
    if (fetcher.data?.error) {
      toast.error(fetcher.data.error.message);
    }
  }, [fetcher.data]);

  const onUpdate = useCallback(
    (field: string, value: string | null) => {
      const formData = new FormData();
      formData.append("ids", dispatchId);
      formData.append("field", field);
      formData.append("value", value?.toString() ?? "");
      fetcher.submit(formData, {
        method: "post",
        action: path.to.maintenanceDispatchUpdate
      });
    },
    [dispatchId, fetcher]
  );

  const isCompleted = routeData?.dispatch?.status === "Completed";

  const [currentOeeImpact, setCurrentOeeImpact] = useState<string>(
    routeData?.dispatch?.oeeImpact ?? "No Impact"
  );

  const showFailureModes =
    currentOeeImpact === "Down" || currentOeeImpact === "Impact";

  return (
    <VStack
      spacing={4}
      className="w-96 bg-card h-full overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-accent border-l border-border px-4 py-2 text-sm"
    >
      <VStack spacing={2}>
        <HStack className="w-full justify-between">
          <h3 className="text-xs text-muted-foreground">Properties</h3>
          <HStack spacing={1}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label="Link"
                  size="sm"
                  className="p-1"
                  onClick={() =>
                    copyToClipboard(
                      window.location.origin +
                        path.to.maintenanceDispatch(dispatchId)
                    )
                  }
                >
                  <LuLink className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Copy link to dispatch</span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label="Copy ID"
                  size="sm"
                  className="p-1"
                  onClick={() => copyToClipboard(routeData?.dispatch?.id ?? "")}
                >
                  <LuKeySquare className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Copy dispatch ID</span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label="Copy"
                  size="sm"
                  className="p-1"
                  onClick={() =>
                    copyToClipboard(
                      routeData?.dispatch?.maintenanceDispatchId ?? ""
                    )
                  }
                >
                  <LuCopy className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Copy dispatch number</span>
              </TooltipContent>
            </Tooltip>
          </HStack>
        </HStack>
        <span className="text-sm tracking-tight">
          {routeData?.dispatch?.maintenanceDispatchId}
        </span>
      </VStack>

      <VStack spacing={2}>
        <h3 className="text-xs text-muted-foreground">Status</h3>
        <MaintenanceStatus status={routeData?.dispatch?.status} />
      </VStack>

      <VStack spacing={2}>
        <h3 className="text-xs text-muted-foreground">Assignee</h3>
        <Assignee
          id={dispatchId}
          table="maintenanceDispatch"
          size="sm"
          value={assignee ?? ""}
          isReadOnly={!permissions.can("update", "production")}
        />
      </VStack>

      <ValidatedForm
        defaultValues={{
          workCenterId: routeData?.dispatch?.workCenterId ?? ""
        }}
        validator={z.object({
          workCenterId: z.string().optional()
        })}
        className="w-full"
      >
        <Select
          options={workCenterOptions}
          isReadOnly={!permissions.can("update", "production")}
          label="Work Center"
          name="workCenterId"
          inline={(value) => {
            return (
              <span>
                {workCenterOptions.find((option) => option.value === value)
                  ?.label ?? ""}
              </span>
            );
          }}
          isClearable
          onChange={(value) => {
            onUpdate("workCenterId", value?.value ?? null);
          }}
        />
      </ValidatedForm>

      <ValidatedForm
        defaultValues={{
          priority: routeData?.dispatch?.priority ?? ""
        }}
        validator={z.object({
          priority: z.string().optional()
        })}
        className="w-full"
      >
        <Select
          options={maintenanceDispatchPriority.map((priority) => ({
            value: priority,
            label: (
              <div className="flex gap-2 items-center">
                <MaintenancePriority priority={priority} />
              </div>
            )
          }))}
          isReadOnly={!permissions.can("update", "production")}
          label="Priority"
          name="priority"
          inline={(value) => {
            return (
              <MaintenancePriority
                priority={value as (typeof maintenanceDispatchPriority)[number]}
              />
            );
          }}
          onChange={(value) => {
            if (value) {
              onUpdate("priority", value.value);
            }
          }}
        />
      </ValidatedForm>

      <ValidatedForm
        defaultValues={{
          severity: routeData?.dispatch?.severity ?? ""
        }}
        validator={z.object({
          severity: z.string().optional()
        })}
        className="w-full"
      >
        <Select
          options={maintenanceSeverity.map((severity) => ({
            value: severity,
            label: severity
          }))}
          isReadOnly={!permissions.can("update", "production")}
          label="Severity"
          name="severity"
          inline={(value) => {
            return (
              <MaintenanceSeverity
                severity={value as (typeof maintenanceSeverity)[number]}
              />
            );
          }}
          onChange={(value) => {
            if (value) {
              onUpdate("severity", value.value);
            }
          }}
        />
      </ValidatedForm>

      <ValidatedForm
        defaultValues={{
          source: routeData?.dispatch?.source ?? ""
        }}
        validator={z.object({
          source: z.string().optional()
        })}
        className="w-full"
      >
        <Select
          options={maintenanceSource.map((source) => ({
            value: source,
            label: source
          }))}
          isReadOnly={!permissions.can("update", "production")}
          label="Source"
          name="source"
          inline={(value) => {
            return (
              <MaintenanceSource
                source={value as (typeof maintenanceSource)[number]}
              />
            );
          }}
          onChange={(value) => {
            if (value) {
              onUpdate("source", value.value);
            }
          }}
        />
      </ValidatedForm>

      <ValidatedForm
        defaultValues={{
          oeeImpact: routeData?.dispatch?.oeeImpact ?? "No Impact"
        }}
        validator={z.object({
          oeeImpact: z.string().optional()
        })}
        className="w-full"
      >
        <Select
          options={oeeImpact.map((impact) => ({
            value: impact,
            label: impact
          }))}
          isReadOnly={!permissions.can("update", "production")}
          label="OEE Impact"
          name="oeeImpact"
          inline={(value) => {
            return <span>{value}</span>;
          }}
          onChange={(value) => {
            if (value) {
              setCurrentOeeImpact(value.value);
              onUpdate("oeeImpact", value.value);
            }
          }}
        />
      </ValidatedForm>

      <ValidatedForm
        defaultValues={{
          plannedStartTime: routeData?.dispatch?.plannedStartTime ?? ""
        }}
        validator={z.object({
          plannedStartTime: z.string().optional()
        })}
        className="w-full"
      >
        <DateTimePicker
          name="plannedStartTime"
          label="Planned Start"
          inline
          isDisabled={!permissions.can("update", "production") || isCompleted}
          onChange={(date) => {
            onUpdate("plannedStartTime", date?.toString() ?? null);
          }}
        />
      </ValidatedForm>

      <ValidatedForm
        defaultValues={{
          plannedEndTime: routeData?.dispatch?.plannedEndTime ?? ""
        }}
        validator={z.object({
          plannedEndTime: z.string().optional()
        })}
        className="w-full"
      >
        <DateTimePicker
          name="plannedEndTime"
          label="Planned End"
          inline
          isDisabled={!permissions.can("update", "production") || isCompleted}
          onChange={(date) => {
            onUpdate("plannedEndTime", date?.toString() ?? null);
          }}
        />
      </ValidatedForm>

      <ValidatedForm
        defaultValues={{
          actualStartTime: routeData?.dispatch?.actualStartTime ?? ""
        }}
        validator={z.object({
          actualStartTime: z.string().optional()
        })}
        className="w-full"
      >
        <DateTimePicker
          name="actualStartTime"
          label="Actual Start"
          inline
          isDisabled={!permissions.can("update", "production") || isCompleted}
          onChange={(date) => {
            onUpdate("actualStartTime", date?.toString() ?? null);
          }}
        />
      </ValidatedForm>

      <ValidatedForm
        defaultValues={{
          actualEndTime: routeData?.dispatch?.actualEndTime ?? ""
        }}
        validator={z.object({
          actualEndTime: z.string().optional()
        })}
        className="w-full"
      >
        <DateTimePicker
          name="actualEndTime"
          label="Actual End"
          inline
          isDisabled={!permissions.can("update", "production") || isCompleted}
          onChange={(date) => {
            onUpdate("actualEndTime", date?.toString() ?? null);
          }}
        />
      </ValidatedForm>

      {showFailureModes && (
        <>
          <ValidatedForm
            defaultValues={{
              suspectedFailureModeId:
                routeData?.dispatch?.suspectedFailureModeId ?? ""
            }}
            validator={z.object({
              suspectedFailureModeId: z.string().optional()
            })}
            className="w-full"
          >
            <Select
              options={(routeData?.failureModes ?? []).map((mode) => ({
                value: mode.id,
                label: mode.name
              }))}
              isReadOnly={!permissions.can("update", "production")}
              label="Suspected Failure Mode"
              name="suspectedFailureModeId"
              inline={(value) => {
                return (
                  <span>
                    {routeData?.failureModes.find((mode) => mode.id === value)
                      ?.name ?? ""}
                  </span>
                );
              }}
              isClearable
              onChange={(value) => {
                onUpdate("suspectedFailureModeId", value?.value ?? null);
              }}
            />
          </ValidatedForm>

          <ValidatedForm
            defaultValues={{
              actualFailureModeId:
                routeData?.dispatch?.actualFailureModeId ?? ""
            }}
            validator={z.object({
              actualFailureModeId: z.string().optional()
            })}
            className="w-full"
          >
            <Select
              options={(routeData?.failureModes ?? []).map((mode) => ({
                value: mode.id,
                label: mode.name
              }))}
              isReadOnly={!permissions.can("update", "production")}
              label="Actual Failure Mode"
              name="actualFailureModeId"
              inline={(value) => {
                return (
                  <span>
                    {routeData?.failureModes.find((mode) => mode.id === value)
                      ?.name ?? ""}
                  </span>
                );
              }}
              isClearable
              onChange={(value) => {
                onUpdate("actualFailureModeId", value?.value ?? null);
              }}
            />
          </ValidatedForm>
        </>
      )}

      <VStack spacing={2}>
        <h3 className="text-xs text-muted-foreground">Created By</h3>
        <EmployeeAvatar
          employeeId={routeData?.dispatch?.createdBy!}
          size="xxs"
        />
      </VStack>
    </VStack>
  );
};

export default MaintenanceDispatchProperties;
