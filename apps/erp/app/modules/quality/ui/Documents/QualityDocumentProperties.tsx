import { Select, ValidatedForm } from "@carbon/form";
import {
  Button,
  HStack,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  VStack
} from "@carbon/react";
import { useCallback, useEffect } from "react";
import { LuCopy, LuKeySquare, LuLink } from "react-icons/lu";
import { useFetcher, useParams } from "react-router";
import { z } from "zod";
import Assignee, { useOptimisticAssignment } from "~/components/Assignee";
import { Tags } from "~/components/Form";
import { usePermissions, useRouteData } from "~/hooks";
import { useTags } from "~/hooks/useTags";
import type { action } from "~/routes/x+/items+/update";
import { path } from "~/utils/path";
import { copyToClipboard } from "~/utils/string";
import { qualityDocumentStatus } from "../../quality.models";
import type { QualityDocument } from "../../types";
import QualityDocumentStatus from "./QualityDocumentStatus";

const QualityDocumentProperties = () => {
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const routeData = useRouteData<{
    document: QualityDocument;
    tags: Array<{ name: string }>;
  }>(path.to.qualityDocument(id));

  const fetcher = useFetcher<typeof action>();
  useEffect(() => {
    if (fetcher.data?.error) {
      toast.error(fetcher.data.error.message);
    }
  }, [fetcher.data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: suppressed due to migration
  const onUpdate = useCallback(
    (field: "name" | "status", value: string | null) => {
      const formData = new FormData();

      formData.append("ids", id);
      formData.append("field", field);
      formData.append("value", value?.toString() ?? "");

      fetcher.submit(formData, {
        method: "post",
        action: path.to.bulkUpdateQualityDocument
      });
    },

    [id]
  );

  const optimisticAssignment = useOptimisticAssignment({
    id: id,
    table: "qualityDocument"
  });
  const assignee =
    optimisticAssignment !== undefined
      ? optimisticAssignment
      : routeData?.document?.assignee;

  const permissions = usePermissions();

  const { onUpdateTags } = useTags({ id, table: "qualityDocument" });

  const availableTags = routeData?.tags ?? [];

  return (
    <VStack
      spacing={4}
      className="w-[450px] bg-card h-full overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-accent border-l border-border px-4 py-2 text-sm"
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
                      window.location.origin + path.to.qualityDocument(id)
                    )
                  }
                >
                  <LuLink className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Copy link to document</span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label="Copy"
                  size="sm"
                  className="p-1"
                  onClick={() => copyToClipboard(routeData?.document?.id ?? "")}
                >
                  <LuKeySquare className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Copy document unique identifier</span>
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
                    copyToClipboard(routeData?.document?.name ?? "")
                  }
                >
                  <LuCopy className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Copy document name</span>
              </TooltipContent>
            </Tooltip>
          </HStack>
        </HStack>
        <span className="text-sm tracking-tight">
          {routeData?.document?.name}
        </span>
      </VStack>

      <Assignee
        id={id}
        table="qualityDocument"
        value={assignee ?? ""}
        variant="inline"
        isReadOnly={!permissions.can("update", "quality")}
      />

      <ValidatedForm
        defaultValues={{
          status: routeData?.document?.status ?? undefined
        }}
        validator={z.object({
          status: z.string().min(1, { message: "Status is required" })
        })}
        className="w-full"
      >
        <span className="text-sm tracking-tight">
          <Select
            label="Status"
            name="status"
            inline={(value) => (
              <QualityDocumentStatus
                status={value as "Draft" | "Active" | "Archived"}
              />
            )}
            options={qualityDocumentStatus.map((status) => ({
              value: status,
              label: <QualityDocumentStatus status={status} />
            }))}
            value={routeData?.document?.status ?? ""}
            onChange={(value) => {
              onUpdate("status", value?.value ?? null);
            }}
          />
        </span>
      </ValidatedForm>
      <ValidatedForm
        defaultValues={{
          tags: routeData?.document?.tags ?? []
        }}
        validator={z.object({
          tags: z.array(z.string()).optional()
        })}
        className="w-full"
      >
        <Tags
          label="Tags"
          name="tags"
          table="qualityDocument"
          availableTags={availableTags}
          onChange={(value) => onUpdateTags(value)}
          inline
        />
      </ValidatedForm>
    </VStack>
  );
};

export default QualityDocumentProperties;
