import { useCarbon } from "@carbon/auth";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  HStack,
  IconButton,
  Loading,
  useDisclosure,
  Badge,
  toast,
} from "@carbon/react";
import { useEffect, useState, useCallback } from "react";
import { LuPlus, LuShieldAlert, LuPencil, LuTrash } from "react-icons/lu";
import { EmployeeAvatar } from "~/components";
import type { Risk } from "~/modules/quality/types";
import RiskRegisterForm from "./RiskRegisterForm";
import { useUser } from "~/hooks";
import { Confirm } from "~/components/Modals";
import { path } from "~/utils/path";
import { useFetcher } from "@remix-run/react";
import type { riskSource } from "~/modules/quality/quality.models";

type RiskRegisterProps = {
  documentId: string;
  documentType: (typeof riskSource)[number];
};

const columnMap: Record<string, string> = {
  Item: "itemId",
  "Work Center": "workCenterId",
  Supplier: "supplierId",
  Customer: "customerId",
  "Quote Line": "quoteLineId",
  Job: "jobId",
};


export default function RiskRegister({
  documentId,
  documentType,
}: RiskRegisterProps) {
  const { carbon } = useCarbon();
  const { company } = useUser();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const formDisclosure = useDisclosure();
  const deleteDisclosure = useDisclosure();
  const [selectedRisk, setSelectedRisk] = useState<Risk | undefined>(undefined);

  const fetchRisks = useCallback(async () => {
    if (!carbon || !company?.id) return;
    setLoading(true);
    const column = columnMap[documentType];
    const { data, error } = await carbon
      .from("riskRegister")
      .select("*, assignee:assigneeUserId(id, firstName, lastName, avatarUrl)")
      .eq("companyId", company.id)
      .eq(column, documentId)
      .order("createdAt", { ascending: false });

    if (error) {
      toast.error(`Failed to fetch risks`);
      return;
    }

    if (data) {
      setRisks(data as unknown as Risk[]);
    }
    setLoading(false);
  }, [carbon, company?.id, documentId, documentType]);

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  const handleAdd = () => {
    setSelectedRisk(undefined);
    formDisclosure.onOpen();
  };

  const handleEdit = (risk: Risk) => {
    setSelectedRisk(risk);
    formDisclosure.onOpen();
  };

  const handleDelete = (risk: Risk) => {
    setSelectedRisk(risk);
    deleteDisclosure.onOpen();
  };

  const deleteFetcher = useFetcher();
  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) {
      deleteDisclosure.onClose();
      fetchRisks();
    }
  }, [deleteFetcher.state, deleteFetcher.data, fetchRisks, deleteDisclosure]);

  const column = columnMap[documentType];

  return (
    <Card className="h-full">
      <CardHeader>
        <HStack className="justify-between">
          <CardTitle className="flex items-center gap-2">
            <LuShieldAlert className="h-5 w-5" />
            Risk Register
          </CardTitle>
          <CardAction>
            <IconButton
              aria-label="Add Risk"
              icon={<LuPlus />}
              variant="ghost"
              onClick={handleAdd}
            />
          </CardAction>
        </HStack>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4">
            <Loading isLoading={true} />
          </div>
        ) : risks.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No risks registered.
          </div>
        ) : (
          <div className="divide-y">
            {risks.map((risk) => (
              <div
                key={risk.id}
                className="p-4 flex items-start justify-between hover:bg-muted/50 transition-colors group"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{risk.title}</span>
                    <Badge
                      variant={
                        risk.status === "OPEN"
                          ? "destructive"
                          : risk.status === "CLOSED"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {risk.status}
                    </Badge>
                    <Badge variant="outline">{risk.source}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {risk.description}
                  </p>
                  <HStack className="mt-2 text-xs text-muted-foreground">
                    <span>Severity: {risk.severity}</span>
                    <span>Likelihood: {risk.likelihood}</span>
                    <span>Score: {risk.score}</span>
                    {risk.assigneeUserId && (
                      <div className="flex items-center gap-1 ml-2">
                        <span>Assignee:</span>
                        <EmployeeAvatar
                          employeeId={risk.assigneeUserId}
                          className="h-5 w-5"
                        />
                      </div>
                    )}
                  </HStack>
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconButton
                    aria-label="Edit"
                    icon={<LuPencil className="h-4 w-4" />}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(risk)}
                  />
                  <IconButton
                    aria-label="Delete"
                    icon={<LuTrash className="h-4 w-4" />}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(risk)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {formDisclosure.isOpen && (
        <RiskRegisterForm
          open={formDisclosure.isOpen}
          onClose={() => {
            formDisclosure.onClose();
            fetchRisks();
          }}
          initialValues={
            selectedRisk
              ? {
                  ...selectedRisk,
                  description: selectedRisk.description ?? undefined,
                  assigneeUserId: selectedRisk.assigneeUserId ?? undefined,
                  itemId: selectedRisk.itemId ?? undefined,
                  workCenterId: selectedRisk.workCenterId ?? undefined,
                  supplierId: selectedRisk.supplierId ?? undefined,
                  customerId: selectedRisk.customerId ?? undefined,
                  quoteLineId: selectedRisk.quoteLineId ?? undefined,
                  jobId: selectedRisk.jobId ?? undefined,
                  severity: selectedRisk.severity ?? undefined,
                  likelihood: selectedRisk.likelihood ?? undefined,
                }
              : {
                  title: "",
                  status: "OPEN",
                  source: (documentType ?? "GENERAL"),
                  [column]: documentId,
                }
          }
        />
      )}

      {selectedRisk && deleteDisclosure.isOpen && (
        <Confirm
          isOpen={deleteDisclosure.isOpen}
          confirmText="Delete"
          onCancel={deleteDisclosure.onClose}
          onSubmit={() => {
             // We can't use the form action directly here because we want to stay on the page and refresh
             // But Confirm component uses a form submission.
             // We can pass the action path.
          }}
          title="Delete Risk"
          text="Are you sure you want to delete this risk?"
          action={path.to.deleteRisk(selectedRisk.id!)}
        />
      )}
    </Card>
  );
}
