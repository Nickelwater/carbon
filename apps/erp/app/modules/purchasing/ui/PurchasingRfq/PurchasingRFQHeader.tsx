import { useCarbon } from "@carbon/auth";
import { Select, Submit, ValidatedForm } from "@carbon/form";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Copy,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIcon,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Heading,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  toast,
  useDisclosure,
  useMount,
  VStack
} from "@carbon/react";
import { useEffect, useState } from "react";
import {
  LuCircleCheck,
  LuCircleX,
  LuEllipsisVertical,
  LuGitCompare,
  LuLoaderCircle,
  LuPanelLeft,
  LuPanelRight,
  LuTrash,
  LuTriangleAlert
} from "react-icons/lu";
import { RiProgress4Line } from "react-icons/ri";
import type { FetcherWithComponents } from "react-router";
import { Link, useFetcher, useParams } from "react-router";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { usePanels } from "~/components/Layout";
import ConfirmDelete from "~/components/Modals/ConfirmDelete";
import { usePermissions, useRouteData, useUser } from "~/hooks";
import { path } from "~/utils/path";
import { isRfqEditable } from "../../purchasing.models";
import type { PurchasingRFQ, PurchasingRFQLine } from "../../types";
import { SupplierQuoteCompareDrawer } from "../SupplierQuote";
import PurchasingRFQStatus from "./PurchasingRFQStatus";

const PurchasingRFQHeader = () => {
  const { rfqId } = useParams();
  if (!rfqId) throw new Error("rfqId not found");

  const convertToSupplierQuotesModal = useDisclosure();
  const requiresSuppliersAlert = useDisclosure();
  const noQuoteReasonModal = useDisclosure();
  const deleteRFQModal = useDisclosure();
  const compareQuotesModal = useDisclosure();
  const { toggleExplorer, toggleProperties } = usePanels();

  const permissions = usePermissions();

  const routeData = useRouteData<{
    rfqSummary: PurchasingRFQ;
    lines: PurchasingRFQLine[];
    suppliers: {
      id: string;
      supplierId: string;
      supplier: { id: string; name: string };
    }[];
    linkedQuotes: unknown[];
  }>(path.to.purchasingRfq(rfqId));

  const status = routeData?.rfqSummary?.status ?? "Draft";

  const statusFetcher = useFetcher<{}>();

  const hasSuppliers = (routeData?.suppliers?.length ?? 0) > 0;
  const activeLinkedQuotes = (routeData?.linkedQuotes ?? []).filter(
    (q: any) => q.status === "Active"
  );
  const canCompareQuotes = activeLinkedQuotes.length > 1;

  return (
    <div className="flex flex-shrink-0 items-center justify-between p-2 bg-card border-b h-[50px] overflow-x-auto scrollbar-hide ">
      <HStack className="w-full justify-between">
        <HStack>
          <IconButton
            aria-label="Toggle Explorer"
            icon={<LuPanelLeft />}
            onClick={toggleExplorer}
            variant="ghost"
          />
          <Link to={path.to.purchasingRfqDetails(rfqId)}>
            <Heading size="h4" className="flex items-center gap-2">
              <span>{routeData?.rfqSummary?.rfqId}</span>
            </Heading>
          </Link>
          <Copy text={routeData?.rfqSummary?.rfqId ?? ""} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                aria-label="More options"
                icon={<LuEllipsisVertical />}
                variant="secondary"
                size="sm"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                disabled={
                  !permissions.can("delete", "purchasing") ||
                  !permissions.is("employee")
                }
                destructive
                onClick={deleteRFQModal.onOpen}
              >
                <DropdownMenuIcon icon={<LuTrash />} />
                Delete RFQ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PurchasingRFQStatus status={routeData?.rfqSummary?.status} />
        </HStack>
        <HStack>
          {hasSuppliers ? (
            <statusFetcher.Form
              method="post"
              action={path.to.purchasingRfqStatus(rfqId)}
            >
              <input type="hidden" name="status" value="Ready for request" />
              <Button
                isDisabled={
                  !isRfqEditable(status) ||
                  routeData?.lines?.length === 0 ||
                  !permissions.can("update", "purchasing")
                }
                isLoading={
                  statusFetcher.state !== "idle" &&
                  statusFetcher.formData?.get("status") === "Ready for request"
                }
                leftIcon={<LuCircleCheck />}
                variant={isRfqEditable(status) ? "primary" : "secondary"}
                type="submit"
              >
                Ready to Send
              </Button>
            </statusFetcher.Form>
          ) : (
            <Button
              isDisabled={
                !isRfqEditable(status) ||
                routeData?.lines?.length === 0 ||
                !permissions.can("update", "purchasing")
              }
              leftIcon={<LuCircleCheck />}
              variant={isRfqEditable(status) ? "primary" : "secondary"}
              onClick={requiresSuppliersAlert.onOpen}
            >
              Ready to Send
            </Button>
          )}

          <Button
            isDisabled={
              status !== "Ready for request" ||
              routeData?.lines?.length === 0 ||
              !hasSuppliers ||
              !permissions.can("create", "purchasing")
            }
            leftIcon={<RiProgress4Line />}
            type="submit"
            variant={
              ["Ready for request", "Requested"].includes(status)
                ? "primary"
                : "secondary"
            }
            onClick={convertToSupplierQuotesModal.onOpen}
          >
            Create Supplier Quotes
          </Button>

          <Button
            onClick={noQuoteReasonModal.onOpen}
            isDisabled={
              status !== "Ready for request" ||
              statusFetcher.state !== "idle" ||
              !permissions.can("update", "purchasing")
            }
            isLoading={
              statusFetcher.state !== "idle" &&
              statusFetcher.formData?.get("status") === "Closed"
            }
            leftIcon={<LuCircleX />}
            variant={
              ["Ready for request", "Closed"].includes(status)
                ? "destructive"
                : "secondary"
            }
          >
            No Quote
          </Button>

          {canCompareQuotes && (
            <Button
              onClick={compareQuotesModal.onOpen}
              leftIcon={<LuGitCompare />}
              variant="secondary"
            >
              Compare Quotes
            </Button>
          )}

          <statusFetcher.Form
            method="post"
            action={path.to.purchasingRfqStatus(rfqId)}
          >
            <input type="hidden" name="status" value="Draft" />
            <Button
              isDisabled={
                !["Closed"].includes(status) ||
                statusFetcher.state !== "idle" ||
                !permissions.can("update", "purchasing")
              }
              isLoading={
                statusFetcher.state !== "idle" &&
                statusFetcher.formData?.get("status") === "Draft"
              }
              leftIcon={<LuLoaderCircle />}
              type="submit"
              variant="secondary"
            >
              Reopen
            </Button>
          </statusFetcher.Form>

          <IconButton
            aria-label="Toggle Properties"
            icon={<LuPanelRight />}
            onClick={toggleProperties}
            variant="ghost"
          />
        </HStack>
      </HStack>
      {convertToSupplierQuotesModal.isOpen && (
        <ConvertToSupplierQuotesModal
          lines={routeData?.lines ?? []}
          suppliers={routeData?.suppliers ?? []}
          rfqId={rfqId}
          onClose={convertToSupplierQuotesModal.onClose}
        />
      )}
      {requiresSuppliersAlert.isOpen && (
        <RequiresSuppliersAlert onClose={requiresSuppliersAlert.onClose} />
      )}
      {noQuoteReasonModal.isOpen && (
        <NoQuoteReasonModal
          fetcher={statusFetcher}
          rfqId={rfqId}
          onClose={noQuoteReasonModal.onClose}
        />
      )}
      {deleteRFQModal.isOpen && (
        <ConfirmDelete
          action={path.to.deletePurchasingRfq(rfqId)}
          isOpen={deleteRFQModal.isOpen}
          name={routeData?.rfqSummary?.rfqId!}
          text={`Are you sure you want to delete ${routeData?.rfqSummary
            ?.rfqId!}? This cannot be undone.`}
          onCancel={() => {
            deleteRFQModal.onClose();
          }}
          onSubmit={() => {
            deleteRFQModal.onClose();
          }}
        />
      )}
      {compareQuotesModal.isOpen && (
        <SupplierQuoteCompareDrawer
          isOpen={compareQuotesModal.isOpen}
          onClose={compareQuotesModal.onClose}
          purchasingRfqId={rfqId}
        />
      )}
    </div>
  );
};

export default PurchasingRFQHeader;

const rfqNoQuoteReasonValidator = z.object({
  status: z.enum(["Closed"]),
  noQuoteReasonId: zfd.text(z.string().optional())
});

function NoQuoteReasonModal({
  fetcher,
  rfqId,
  onClose
}: {
  fetcher: FetcherWithComponents<{}>;
  rfqId: string;
  onClose: () => void;
}) {
  const user = useUser();
  const [noQuoteReasons, setNoQuoteReasons] = useState<
    {
      label: string;
      value: string;
    }[]
  >([]);
  const { carbon } = useCarbon();
  const fetchReasons = async () => {
    if (!carbon) return;
    const { data, error } = await carbon
      .from("noQuoteReason")
      .select("*")
      .eq("companyId", user.company.id);

    if (error) {
      toast.error("Failed to load no-quote reasons");
      return;
    }

    setNoQuoteReasons(
      data?.map((reason) => ({ label: reason.name, value: reason.id })) ?? []
    );
  };

  useMount(() => {
    fetchReasons();
  });

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ValidatedForm
          method="post"
          action={path.to.purchasingRfqStatus(rfqId)}
          validator={rfqNoQuoteReasonValidator}
          fetcher={fetcher}
          onSubmit={() => {
            onClose();
          }}
        >
          <ModalHeader>
            <ModalTitle>No Quote Reason</ModalTitle>
            <ModalDescription>
              Select a reason for why the quote was not created.
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <input type="hidden" name="status" value="Closed" />
            <VStack spacing={2}>
              <Select
                name="noQuoteReasonId"
                label="No Quote Reason"
                options={noQuoteReasons}
              />
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Submit withBlocker={false}>Save</Submit>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
}

function RequiresSuppliersAlert({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Cannot send RFQ</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Alert variant="destructive">
            <LuTriangleAlert className="h-4 w-4" />
            <AlertTitle>RFQ has no suppliers</AlertTitle>
            <AlertDescription>
              In order to send this RFQ to suppliers, you must first add
              suppliers to the RFQ.
            </AlertDescription>
          </Alert>
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose}>OK</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function ConvertToSupplierQuotesModal({
  lines,
  suppliers,
  rfqId,
  onClose
}: {
  lines: PurchasingRFQLine[];
  suppliers: {
    id: string;
    supplierId: string;
    supplier: { id: string; name: string };
  }[];
  rfqId: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ error: string | null }>();
  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "loading") {
      onClose();
    }
  }, [fetcher.state, onClose]);

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Create Supplier Quotes</ModalTitle>
          <ModalDescription>
            Send quote requests to suppliers who can provide the parts in this
            RFQ.
          </ModalDescription>
        </ModalHeader>

        <ModalBody>
          <Alert variant="warning">
            <LuTriangleAlert className="h-4 w-4" />
            <AlertTitle>
              Please make sure these suppliers can provide the parts listed in
              this RFQ
            </AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside mt-2">
                {suppliers.map((s) => (
                  <li key={s.id}>{s.supplier?.name}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </ModalBody>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <fetcher.Form
            method="post"
            action={path.to.purchasingRfqConvert(rfqId)}
          >
            <Button isDisabled={isLoading} type="submit" isLoading={isLoading}>
              Create Supplier Quotes
            </Button>
          </fetcher.Form>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
