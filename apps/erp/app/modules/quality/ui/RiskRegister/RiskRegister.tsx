import { useCarbon } from "@carbon/auth";
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  HStack,
  IconButton,
  Loading,
  toast,
  useDisclosure
} from "@carbon/react";
import { useCallback, useEffect, useState } from "react";
import { LuPlus, LuSettings2, LuShieldAlert } from "react-icons/lu";
import { EmployeeAvatar, Empty } from "~/components";
import { useUser } from "~/hooks";
import type { riskSource } from "~/modules/quality/quality.models";
import type { Risk } from "~/modules/quality/types";
import RiskRegisterForm from "./RiskRegisterForm";
import RiskStatus from "./RiskStatus";

type RiskRegisterProps = {
  documentId: string;
  documentType: (typeof riskSource)[number];
};

export default function RiskRegister({
  documentId,
  documentType
}: RiskRegisterProps) {
  const { carbon } = useCarbon();
  const { company } = useUser();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const formDisclosure = useDisclosure();
  const [selectedRisk, setSelectedRisk] = useState<Risk | undefined>(undefined);

  const fetchRisks = useCallback(async () => {
    if (!carbon || !company?.id) return;
    setLoading(true);
    const { data, error } = await carbon
      .from("riskRegister")
      .select("*, assignee:assignee(id, firstName, lastName, avatarUrl)")
      .eq("companyId", company.id)
      .eq("source", documentType)
      .eq("sourceId", documentId)
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
          <Empty>No risks registered</Empty>
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
                    <RiskStatus status={risk.status} />
                    <Badge variant="outline">{risk.source}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {risk.description}
                  </p>
                  <HStack className="mt-2 text-xs text-muted-foreground">
                    <span>Severity: {risk.severity}</span>
                    <span>Likelihood: {risk.likelihood}</span>
                    {risk.assignee && (
                      <div className="flex items-center gap-1 ml-2">
                        <span>Assignee:</span>
                        <EmployeeAvatar
                          employeeId={risk.assignee}
                          className="h-5 w-5"
                        />
                      </div>
                    )}
                  </HStack>
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconButton
                    aria-label="Edit"
                    icon={<LuSettings2 className="h-4 w-4" />}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(risk)}
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
                  assignee: selectedRisk.assignee ?? undefined,
                  sourceId: selectedRisk.sourceId ?? undefined,
                  itemId: selectedRisk.itemId ?? undefined,
                  severity: selectedRisk.severity ?? undefined,
                  likelihood: selectedRisk.likelihood ?? undefined,
                  type: selectedRisk.type ?? "Risk"
                }
              : {
                  title: "",
                  status: "Open",
                  source: documentType ?? "General",
                  sourceId: documentId,
                  itemId: undefined,
                  severity: "1",
                  likelihood: "1",
                  type: "Risk"
                }
          }
        />
      )}
    </Card>
  );
}
