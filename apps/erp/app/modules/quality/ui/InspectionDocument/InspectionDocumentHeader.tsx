import {
  Badge,
  Button,
  Copy,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIcon,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Heading,
  HStack,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useDisclosure,
  VStack
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PostgrestResponse } from "@supabase/supabase-js";
import { Suspense, useEffect, useState } from "react";
import {
  LuCheckCheck,
  LuChevronDown,
  LuCirclePlus,
  LuClipboardCheck,
  LuEllipsisVertical,
  LuGitPullRequestArrow,
  LuTrash,
  LuX
} from "react-icons/lu";
import { Await, useFetcher, useNavigate, useParams } from "react-router";
import ConfirmDelete from "~/components/Modals/ConfirmDelete";
import { usePermissions, useRouteData } from "~/hooks";
import type { ApprovalDecision } from "~/modules/shared/types";
import { path } from "~/utils/path";
import type { InspectionDocument } from "../../types";
import InspectionDocumentApprovalModal from "./InspectionDocumentApprovalModal";
import InspectionDocumentForm from "./InspectionDocumentForm";
import InspectionDocumentStatus from "./InspectionDocumentStatus";

const InspectionDocumentHeader = () => {
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const routeData = useRouteData<{
    diagram: InspectionDocument;
    versions: PostgrestResponse<InspectionDocument>;
    approvalRequest: { id: string } | null;
    canApprove: boolean;
    canDelete: boolean;
    isApprovalRequired: boolean;
  }>(path.to.inspectionDocument(id));

  const navigate = useNavigate();
  const { t } = useLingui();
  const permissions = usePermissions();
  const newVersionDisclosure = useDisclosure();
  const deleteDisclosure = useDisclosure();
  const statusFetcher = useFetcher<{ error?: { message: string } }>();
  const approvalFetcher = useFetcher<{
    error?: string;
    success?: boolean;
  }>();
  const [approvalDecision, setApprovalDecision] =
    useState<ApprovalDecision | null>(null);

  const document = routeData?.diagram;
  const status = document?.status ?? null;
  const isDraft = status === "Draft";
  const isArchived = status === "Archived";
  const canActivate = isDraft || isArchived;
  const approvalRequestId = routeData?.approvalRequest?.id;
  const hasApprovalRequest = !!approvalRequestId;
  const canApprove = routeData?.canApprove ?? false;
  const canDelete = routeData?.canDelete ?? true;
  const isApprovalRequired = routeData?.isApprovalRequired ?? false;

  const statusIdle = statusFetcher.state === "idle";
  const submitLoading =
    !statusIdle &&
    statusFetcher.formData?.get("field") === "status" &&
    statusFetcher.formData?.get("value") === "Active";

  let submitButtonLabel: string;
  let submitButtonTooltip: string;
  if (isApprovalRequired) {
    submitButtonLabel = t`Submit for approval`;
    submitButtonTooltip = t`Sends this document for approval before it can go active.`;
  } else if (isArchived) {
    submitButtonLabel = t`Reactivate`;
    submitButtonTooltip = t`Makes this document active again.`;
  } else {
    submitButtonLabel = t`Publish`;
    submitButtonTooltip = t`Makes this document active and visible.`;
  }

  const submitForActivation = () => {
    const formData = new FormData();
    formData.append("ids", id);
    formData.append("field", "status");
    formData.append("value", "Active");
    statusFetcher.submit(formData, {
      method: "post",
      action: path.to.bulkUpdateInspectionDocument
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: close version modal when navigating between document ids
  useEffect(() => {
    newVersionDisclosure.onClose();
  }, [id]);

  return (
    <div className="flex flex-shrink-0 items-center justify-between px-4 py-2 bg-card border-b border-border h-[50px] overflow-x-auto scrollbar-hide dark:border-none dark:shadow-[inset_0_0_1px_rgb(255_255_255_/_0.24),_0_0_0_0.5px_rgb(0,0,0,1),0px_0px_4px_rgba(0,_0,_0,_0.08)]">
      <VStack spacing={0} className="flex-grow">
        <HStack>
          <Heading size="h4" className="flex items-center gap-2">
            <span>{document?.name}</span>
            <Badge variant="outline">V{document?.version}</Badge>
            <InspectionDocumentStatus status={document?.status} />
          </Heading>
          <Copy text={document?.name ?? ""} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                aria-label={t`More options`}
                icon={<LuEllipsisVertical />}
                variant="secondary"
                size="sm"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                disabled={
                  !permissions.can("delete", "quality") ||
                  !permissions.is("employee") ||
                  !isDraft ||
                  (canActivate && hasApprovalRequest && !canDelete)
                }
                destructive
                onClick={deleteDisclosure.onOpen}
              >
                <DropdownMenuIcon icon={<LuTrash />} />
                <Trans>Delete Document</Trans>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </HStack>
      </VStack>
      <div className="flex flex-shrink-0 gap-1 items-center justify-end">
        {canActivate && !hasApprovalRequest && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  leftIcon={
                    isApprovalRequired ? <LuClipboardCheck /> : <LuCheckCheck />
                  }
                  variant="primary"
                  isLoading={submitLoading}
                  isDisabled={
                    !permissions.can("update", "quality") ||
                    !permissions.is("employee") ||
                    !statusIdle
                  }
                  onClick={submitForActivation}
                >
                  {submitButtonLabel}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{submitButtonTooltip}</TooltipContent>
          </Tooltip>
        )}
        {canActivate && hasApprovalRequest && (
          <>
            <Button
              leftIcon={<LuCheckCheck />}
              variant="primary"
              isDisabled={!canApprove}
              onClick={() => setApprovalDecision("Approved")}
            >
              <Trans>Approve</Trans>
            </Button>
            <Button
              leftIcon={<LuX />}
              variant="destructive"
              isDisabled={!canApprove}
              onClick={() => setApprovalDecision("Rejected")}
            >
              <Trans>Reject</Trans>
            </Button>
          </>
        )}
        <Suspense fallback={null}>
          <Await resolve={routeData?.versions}>
            {(versions) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    leftIcon={<LuGitPullRequestArrow />}
                    rightIcon={<LuChevronDown />}
                  >
                    <Trans>Versions</Trans>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {permissions.can("create", "quality") && (
                    <>
                      <DropdownMenuItem onClick={newVersionDisclosure.onOpen}>
                        <DropdownMenuIcon icon={<LuCirclePlus />} />
                        <Trans>New Version</Trans>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuRadioGroup
                    value={id}
                    onValueChange={(value) =>
                      navigate(path.to.inspectionDocument(value))
                    }
                  >
                    {document && (
                      <DropdownMenuRadioItem
                        key={document.id}
                        value={document.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <Badge variant="outline">V{document.version}</Badge>
                        <span>{document.name}</span>
                        <InspectionDocumentStatus status={document.status} />
                      </DropdownMenuRadioItem>
                    )}
                    {versions?.data
                      ?.filter((v) => v.id !== id)
                      .map((version) => (
                        <DropdownMenuRadioItem
                          key={version.id}
                          value={version.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <Badge variant="outline">V{version.version}</Badge>
                          <span>{version.name}</span>
                          <InspectionDocumentStatus status={version.status} />
                        </DropdownMenuRadioItem>
                      ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </Await>
        </Suspense>
      </div>
      {newVersionDisclosure.isOpen && document && (
        <InspectionDocumentForm
          type="copy"
          initialValues={{
            name: document.name,
            partId: document.partId ?? "",
            drawingNumber: document.content?.drawingNumber ?? "",
            version: (document.version ?? 0) + 1,
            copyFromId: document.id
          }}
          open={newVersionDisclosure.isOpen}
          onClose={newVersionDisclosure.onClose}
        />
      )}
      {deleteDisclosure.isOpen && (
        <ConfirmDelete
          action={path.to.deleteInspectionDocument(id)}
          isOpen={deleteDisclosure.isOpen}
          name={document?.name ?? "document"}
          text={t`Are you sure you want to delete ${document?.name}? This cannot be undone.`}
          onCancel={() => {
            deleteDisclosure.onClose();
          }}
          onSubmit={() => {
            deleteDisclosure.onClose();
          }}
        />
      )}
      {approvalDecision && approvalRequestId && (
        <InspectionDocumentApprovalModal
          document={document}
          approvalRequestId={approvalRequestId}
          decision={approvalDecision}
          fetcher={approvalFetcher}
          onClose={() => setApprovalDecision(null)}
        />
      )}
    </div>
  );
};

export default InspectionDocumentHeader;
