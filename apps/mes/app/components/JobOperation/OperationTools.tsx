import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Heading,
  HStack,
  ModelViewer,
  Separator,
  SidebarTrigger,
  Table,
  Tbody,
  Td,
  Th,
  Tr,
  useDisclosure,
  useMode,
  VStack
} from "@carbon/react";
import { isToolLifeLow } from "@carbon/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { LuChevronLeft, LuWrench } from "react-icons/lu";
import { Link, useRevalidator } from "react-router";
import ItemThumbnail from "~/components/ItemThumbnail";
import type { JobOperationToolWithLife } from "~/services/tool-life.service";
import type { Job, OperationWithDetails } from "~/services/types";
import { path } from "~/utils/path";
import { IssueToolModal } from "./components/IssueToolModal";

type OperationToolsProps = {
  operation: OperationWithDetails;
  job: Job;
  tools: JobOperationToolWithLife[];
};

export function OperationTools({ operation, job, tools }: OperationToolsProps) {
  const { t } = useLingui();
  const mode = useMode();
  const revalidator = useRevalidator();
  const toolIssueModal = useDisclosure();
  const [selectedToolId, setSelectedToolId] = useState(tools[0]?.id ?? null);
  const [selectedToolToIssue, setSelectedToolToIssue] =
    useState<JobOperationToolWithLife | null>(null);

  useEffect(() => {
    if (tools.length === 0) {
      setSelectedToolId(null);
      return;
    }
    if (!selectedToolId || !tools.some((tool) => tool.id === selectedToolId)) {
      setSelectedToolId(tools[0].id);
    }
  }, [tools, selectedToolId]);

  const selectedTool =
    tools.find((tool) => tool.id === selectedToolId) ?? tools[0] ?? null;

  const lifeUnit = (tool: JobOperationToolWithLife) =>
    tool.lifeBasis === "Cycles"
      ? t`cycles`
      : tool.lifeBasis === "RunTime"
        ? t`hours`
        : "";

  const remainingLife = (tool: JobOperationToolWithLife) =>
    tool.itemTrackingType === "Serial"
      ? tool.serialLifeRemaining
      : tool.lifeRemaining;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-card">
      <header className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger />
        <Button
          variant="ghost"
          leftIcon={<LuChevronLeft />}
          asChild
          className="pl-2"
        >
          <Link to={path.to.operation(operation.id)}>
            <Trans>Operation</Trans>
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <HStack className="min-w-0 flex-1 items-center gap-2">
          <LuWrench className="text-muted-foreground shrink-0" />
          <Heading size="h4" className="truncate">
            <Trans>Tools</Trans>
          </Heading>
          <span className="text-muted-foreground truncate text-sm">
            {job.jobReadableId} · {operation.description}
          </span>
        </HStack>
      </header>

      {tools.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
          <VStack className="max-w-md gap-2">
            <Heading size="h3">
              <Trans>No tools on this operation</Trans>
            </Heading>
            <p className="text-sm">
              <Trans>
                Add tools on the part method Bill of Process → Tools tab, then
                refresh the job method if needed.
              </Trans>
            </p>
          </VStack>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="w-full shrink-0 border-b lg:w-80 lg:border-b-0 lg:border-r">
            <div className="p-4">
              <p className="text-muted-foreground mb-3 text-sm">
                <Trans>Select a tool</Trans>
              </p>
              <VStack className="gap-2">
                {tools.map((tool) => {
                  const remaining = remainingLife(tool);
                  const isSelected = tool.id === selectedTool?.id;

                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setSelectedToolId(tool.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <ItemThumbnail
                        thumbnailPath={tool.thumbnailPath}
                        type="Tool"
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {tool.toolReadableIdWithRevision ??
                            tool.toolReadableId ??
                            tool.toolName ??
                            "—"}
                        </p>
                        {tool.toolName && (
                          <p className="text-muted-foreground truncate text-xs">
                            {tool.toolName}
                          </p>
                        )}
                        {tool.lifeBasis && (
                          <p className="mt-1 text-xs">
                            {remaining ?? "—"} {lifeUnit(tool)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </VStack>
            </div>
          </div>

          {selectedTool && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
              <div className="flex w-full shrink-0 flex-col gap-4 border-b p-4 lg:w-80 lg:border-b-0 lg:border-r lg:p-6">
                <HStack className="items-start gap-4">
                  <ItemThumbnail
                    thumbnailPath={selectedTool.thumbnailPath}
                    type="Tool"
                    size="xl"
                  />
                  <VStack className="min-w-0 gap-1">
                    <Heading size="h3">
                      {selectedTool.toolReadableIdWithRevision ??
                        selectedTool.toolReadableId ??
                        selectedTool.toolName ??
                        "—"}
                    </Heading>
                    {selectedTool.toolName && (
                      <p className="text-muted-foreground text-sm">
                        {selectedTool.toolName}
                      </p>
                    )}
                  </VStack>
                </HStack>

                <Table>
                  <Tbody>
                    <Tr>
                      <Th>
                        <Trans>Quantity</Trans>
                      </Th>
                      <Td>{selectedTool.quantity}</Td>
                    </Tr>
                    <Tr>
                      <Th>
                        <Trans>Serial</Trans>
                      </Th>
                      <Td>{selectedTool.serialReadableId ?? "—"}</Td>
                    </Tr>
                    <Tr>
                      <Th>
                        <Trans>Status</Trans>
                      </Th>
                      <Td>
                        {selectedTool.issuedAt ? (
                          selectedTool.autoIssued ? (
                            <Trans>Auto-issued</Trans>
                          ) : (
                            <Trans>Issued</Trans>
                          )
                        ) : (
                          <Trans>Not issued</Trans>
                        )}
                      </Td>
                    </Tr>
                    {selectedTool.lifeBasis && (
                      <Tr>
                        <Th>
                          <Trans>Life remaining</Trans>
                        </Th>
                        <Td>
                          <HStack>
                            <span>
                              {remainingLife(selectedTool) ?? "—"}{" "}
                              {lifeUnit(selectedTool)}
                            </span>
                            {isToolLifeLow(
                              remainingLife(selectedTool),
                              selectedTool.lifeLimit
                            ) && (
                              <Badge variant="warning">
                                <Trans>Low</Trans>
                              </Badge>
                            )}
                          </HStack>
                        </Td>
                      </Tr>
                    )}
                    {selectedTool.lifeLimit != null && (
                      <Tr>
                        <Th>
                          <Trans>Life limit</Trans>
                        </Th>
                        <Td>
                          {selectedTool.lifeLimit} {lifeUnit(selectedTool)}
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>

                {!selectedTool.issuedAt && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedToolToIssue(selectedTool);
                      toolIssueModal.onOpen();
                    }}
                  >
                    <Trans>Issue Tool</Trans>
                  </Button>
                )}
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <Card className="flex min-h-0 flex-1 flex-col rounded-none border-0 shadow-none">
                  <CardHeader className="shrink-0">
                    <CardTitle>
                      <Trans>3D Model</Trans>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                    {selectedTool.modelPath ? (
                      <div className="min-h-[50dvh] flex-1 lg:min-h-0">
                        <ModelViewer
                          file={null}
                          key={`tool-model-${selectedTool.id}-${selectedTool.modelPath}`}
                          url={`/file/preview/private/${selectedTool.modelPath}`}
                          mode={mode}
                          className="h-full w-full rounded-none"
                        />
                      </div>
                    ) : (
                      <div className="text-muted-foreground flex min-h-[12rem] flex-1 items-center justify-center p-6 text-center text-sm">
                        <Trans>No 3D model uploaded for this tool</Trans>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {toolIssueModal.isOpen && selectedToolToIssue && (
        <IssueToolModal
          operationId={operation.id}
          tool={selectedToolToIssue}
          onClose={() => {
            setSelectedToolToIssue(null);
            toolIssueModal.onClose();
            revalidator.revalidate();
          }}
        />
      )}
    </div>
  );
}
