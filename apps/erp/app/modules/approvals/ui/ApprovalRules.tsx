import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Heading,
  ScrollArea,
  VStack
} from "@carbon/react";
import { memo } from "react";
import { LuInbox, LuPlus } from "react-icons/lu";
import { Link } from "react-router";
import { Empty } from "~/components";
import { usePermissions } from "~/hooks";
import type { ApprovalRule } from "~/modules/approvals";
import { path } from "~/utils/path";
import ApprovalRuleCard from "./ApprovalRuleCard";

type ApprovalRulesProps = {
  poRules: ApprovalRule[];
  qdRules: ApprovalRule[];
};

const ApprovalRules = memo(({ poRules, qdRules }: ApprovalRulesProps) => {
  const permissions = usePermissions();
  const canCreate = permissions.can("update", "settings");

  return (
    <ScrollArea className="h-full w-full">
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-[90rem] mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Heading size="h2">Approval Rules</Heading>
            {/* TODO: View Requests button - remove soon */}
            <Button variant="secondary" leftIcon={<LuInbox />} asChild>
              <Link to={path.to.approvalRequests}>View Requests</Link>
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Purchase Orders</CardTitle>
                <CardDescription className="text-sm">
                  Require approval for purchase orders based on amount
                  thresholds
                </CardDescription>
              </div>
              {canCreate && (
                <Button variant="primary" leftIcon={<LuPlus />} asChild>
                  <Link to={path.to.newApprovalRule()}>New Rule</Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {poRules.length === 0 ? (
              <Empty className="my-4" />
            ) : (
              <VStack spacing={3} className="items-stretch">
                {poRules
                  .filter((r) => r.id)
                  .map((rule) => (
                    <ApprovalRuleCard
                      key={rule.id}
                      rule={rule}
                      documentType="purchaseOrder"
                    />
                  ))}
              </VStack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Quality Documents</CardTitle>
                <CardDescription className="text-sm">
                  Require approval for quality documents in your workflow
                </CardDescription>
              </div>
              {canCreate && (
                <Button variant="primary" leftIcon={<LuPlus />} asChild>
                  <Link to={path.to.newApprovalRule()}>New Rule</Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {qdRules.length === 0 ? (
              <Empty className="my-4" />
            ) : (
              <VStack spacing={3} className="items-stretch">
                {qdRules
                  .filter((r) => r.id)
                  .map((rule) => (
                    <ApprovalRuleCard
                      key={rule.id}
                      rule={rule}
                      documentType="qualityDocument"
                    />
                  ))}
              </VStack>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
});

ApprovalRules.displayName = "ApprovalRules";
export default ApprovalRules;
