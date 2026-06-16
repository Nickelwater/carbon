import { Hidden, TextArea, ValidatedForm } from "@carbon/form";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { FetcherWithComponents } from "react-router";
import { useParams } from "react-router";
import type { ApprovalDecision } from "~/modules/shared/types";
import { path } from "~/utils/path";
import { inspectionDocumentApprovalValidator } from "../../quality.models";
import type { InspectionDocument } from "../../types";

type InspectionDocumentApprovalModalProps = {
  document?: InspectionDocument;
  approvalRequestId: string;
  decision: ApprovalDecision;
  fetcher: FetcherWithComponents<unknown>;
  onClose: () => void;
};

const InspectionDocumentApprovalModal = ({
  document,
  approvalRequestId,
  decision,
  onClose,
  fetcher
}: InspectionDocumentApprovalModalProps) => {
  const { t } = useLingui();
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const isApproving = decision === "Approved";

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
        <ValidatedForm
          method="post"
          validator={inspectionDocumentApprovalValidator}
          action={path.to.inspectionDocument(id)}
          onSubmit={onClose}
          defaultValues={{
            approvalRequestId,
            decision,
            notes: undefined
          }}
          fetcher={fetcher}
        >
          <ModalHeader>
            <ModalTitle>
              {isApproving ? "Approve" : "Reject"} {document?.name}
            </ModalTitle>
            <ModalDescription>
              {isApproving
                ? "Are you sure you want to approve this inspection document? This will make it active and update linked sampling plans."
                : "Are you sure you want to reject this inspection document? The document will remain in draft status."}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <Hidden name="approvalRequestId" />
            <Hidden name="decision" />
            <TextArea
              name="notes"
              label={t`Notes (optional)`}
              placeholder={t`Add any notes about your decision...`}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              type="submit"
              variant={isApproving ? "primary" : "destructive"}
              isLoading={fetcher.state !== "idle"}
            >
              {isApproving ? <Trans>Approve</Trans> : <Trans>Reject</Trans>}
            </Button>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
};

export default InspectionDocumentApprovalModal;
