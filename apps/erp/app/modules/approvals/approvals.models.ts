import { z } from "zod";
import { zfd } from "zod-form-data";

export const approvalStatusType = [
  "Pending",
  "Approved",
  "Rejected",
  "Cancelled"
] as const;

export const approvalDocumentType = [
  "purchaseOrder",
  "qualityDocument"
] as const;

export const approvalRequestValidator = z.object({
  id: zfd.text(z.string().optional()),
  documentType: z.enum(approvalDocumentType, {
    errorMap: () => ({ message: "Document type is required" })
  }),
  documentId: zfd.text(
    z.string().min(1, { message: "Document ID is required" })
  ),
  approverGroupIds: zfd.repeatableOfType(z.string()).optional(),
  approverId: zfd.text(z.string().optional())
});

export const approvalDecisionValidator = z.object({
  id: z.string().min(1, { message: "Approval request ID is required" }),
  decision: z.enum(["Approved", "Rejected"], {
    errorMap: () => ({ message: "Decision is required" })
  }),
  decisionNotes: zfd.text(z.string().optional())
});

export const approvalConfigurationValidator = z.object({
  id: zfd.text(z.string().optional()),
  documentType: z.enum(approvalDocumentType, {
    errorMap: () => ({ message: "Document type is required" })
  }),
  enabled: z.boolean().default(true),
  approverGroupIds: zfd.repeatableOfType(z.string()).optional(),
  defaultApproverId: zfd.text(z.string().optional()),
  thresholdAmount: zfd.numeric(z.number().min(0).optional()),
  escalationDaysLimit: zfd.numeric(z.number().min(0).optional())
});

export const approvalFiltersValidator = z.object({
  documentType: z.enum(approvalDocumentType, {
    errorMap: () => ({ message: "Document type is required" })
  }),
  status: zfd.text(z.string().optional()),
  dateFrom: zfd.text(z.string().optional()),
  dateTo: zfd.text(z.string().optional())
});
