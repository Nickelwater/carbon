import { requirePermissions } from "@carbon/auth/auth.server";
import { useNavigate } from "@remix-run/react";
import type { ActionFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import { riskRegisterValidator } from "~/modules/quality/quality.models";
import { upsertRisk } from "~/modules/quality/quality.service";
import RiskRegisterForm from "~/modules/quality/ui/RiskRegister/RiskRegisterForm";
import { path } from "~/utils/path";
import { validationError, validator } from "@carbon/form";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { client, userId, companyId } = await requirePermissions(request, {
    create: "quality",
    role: "employee",
  });


  const formData = await request.formData();
  const validation = await validator(riskRegisterValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const result = await upsertRisk(client, {
    ...validation.data,
    companyId,
    createdByUserId: userId,
  });

  if (result.error) {
    console.log("this ran2", userId);

    return json(
      {
        data: null,
        error: result.error.message,
      },
      { status: 500 }
    );
  }

  return json({
    data: result.data,
    error: null,
  });
};

export default function NewRiskRoute() {
  const navigate = useNavigate();
  const onClose = () => navigate(path.to.risks);

  return (
    <RiskRegisterForm
      initialValues={{
        title: "",
        description: "",
        source: "GENERAL",
        status: "OPEN",
        severity: 1,
        likelihood: 1,
      }}
      onClose={onClose}
    />
  );
}
