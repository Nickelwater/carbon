import { ValidatedForm } from "@carbon/form";
import {
  Button,
  HStack,
  ModalDrawer,
  ModalDrawerBody,
  ModalDrawerContent,
  ModalDrawerFooter,
  ModalDrawerHeader,
  ModalDrawerProvider,
  ModalDrawerTitle,
  VStack,
  toast,
} from "@carbon/react";
import { useFetcher } from "@remix-run/react";
import type { PostgrestResponse } from "@supabase/supabase-js";
import { useEffect } from "react";
import type { z } from "zod/v3";
import {
  Employee,
  Hidden,
  Input,
  Select,
  Submit,
  TextArea,
  Number as NumberInput,
} from "~/components/Form";
import { usePermissions } from "~/hooks";
import {
  riskSource,
  riskRegisterValidator,
  riskStatus,
} from "~/modules/quality/quality.models";
import { path } from "~/utils/path";

type RiskRegisterFormProps = {
  initialValues: z.infer<typeof riskRegisterValidator>;
  type?: "modal" | "drawer";
  open?: boolean;
  onClose: () => void;
};

const RiskRegisterForm = ({
  initialValues,
  open = true,
  type = "drawer",
  onClose,
}: RiskRegisterFormProps) => {
  const permissions = usePermissions();
  const fetcher = useFetcher<PostgrestResponse<{ id: string }>>();

  useEffect(() => {
    if (type !== "modal") return;

    if (fetcher.state === "loading" && fetcher.data?.data) {
      onClose?.();
      toast.success(`Saved risk`);
    } else if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(`Failed to save risk: ${fetcher.data.error.message}`);
    }
  }, [fetcher.data, fetcher.state, onClose, type]);

  const isEditing = !!initialValues.id;
  const isDisabled = isEditing
    ? !permissions.can("update", "quality")
    : !permissions.can("create", "quality");

    console.log("initialValues",initialValues)

  return (
    <ModalDrawerProvider type={type}>
      <ModalDrawer
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose?.();
        }}
      >
        <ModalDrawerContent>
          <ValidatedForm
            validator={riskRegisterValidator}
            method="post"
            action={
              isEditing
                ? path.to.risk(initialValues.id!)
                : path.to.newRisk
            }
            defaultValues={initialValues}
            fetcher={fetcher}
            className="flex flex-col h-full"
          >
            <ModalDrawerHeader>
              <ModalDrawerTitle>
                {isEditing ? "Edit" : "New"} Risk
              </ModalDrawerTitle>
            </ModalDrawerHeader>
            <ModalDrawerBody>
              <Hidden name="id" />
              {/* Context fields (hidden if not provided, but form needs them if passed) */}
              <Hidden name="itemId" />
              <Hidden name="workCenterId" />
              <Hidden name="supplierId" />
              <Hidden name="customerId" />
              <Hidden name="quoteLineId" />
              <Hidden name="jobId" />

              <VStack spacing={4}>
                <Input name="title" label="Title" />
                <TextArea name="description" label="Description" />

                <Select
                  name="source"
                  label="Source"
                  options={riskSource.map((c) => ({ value: c, label: c }))}
                />

                <Select
                  name="status"
                  label="Status"
                  options={riskStatus.map((s) => ({ value: s, label: s }))}
                />

                <HStack spacing={4} className="w-full">
                  <NumberInput
                    name="severity"
                    label="Severity (1-5)"
                    minValue={1}
                    maxValue={5}
                  />
                  <NumberInput
                    name="likelihood"
                    label="Likelihood (1-5)"
                    minValue={1}
                    maxValue={5}
                  />
                </HStack>

                <Employee name="assigneeUserId" label="Assignee" />
              </VStack>
            </ModalDrawerBody>
            <ModalDrawerFooter>
              <HStack>
                <Submit isDisabled={isDisabled}>Save</Submit>
                <Button size="md" variant="solid" onClick={() => onClose?.()}>
                  Cancel
                </Button>
              </HStack>
            </ModalDrawerFooter>
          </ValidatedForm>
        </ModalDrawerContent>
      </ModalDrawer>
    </ModalDrawerProvider>
  );
};

export default RiskRegisterForm;
