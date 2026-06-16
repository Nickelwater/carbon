import { ValidatedForm } from "@carbon/form";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  HStack,
  ModalDrawer,
  ModalDrawerBody,
  ModalDrawerContent,
  ModalDrawerFooter,
  ModalDrawerHeader,
  ModalDrawerProvider,
  ModalDrawerTitle,
  VStack
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PostgrestResponse } from "@supabase/supabase-js";
import { useFetcher } from "react-router";
import type { z } from "zod";
import { Hidden, Input, Item, Number, Submit } from "~/components/Form";
import { usePermissions } from "~/hooks";
import { inspectionDocumentValidator } from "~/modules/quality/quality.models";
import { path } from "~/utils/path";

type InspectionDocumentFormProps = {
  initialValues: z.infer<typeof inspectionDocumentValidator> & {
    partId: string;
  };
  type?: "new" | "copy";
  open?: boolean;
  onClose: () => void;
};

export default function InspectionDocumentForm({
  initialValues,
  type = "new",
  open = true,
  onClose
}: InspectionDocumentFormProps) {
  const { t } = useLingui();
  const permissions = usePermissions();
  const fetcher = useFetcher<PostgrestResponse<{ id: string }>>();
  const isEditing = Boolean(initialValues.id);
  const isDisabled = isEditing
    ? !permissions.can("update", "quality")
    : !permissions.can("create", "quality");

  if (type === "copy") {
    return (
      <ModalDrawerProvider type="modal">
        <ModalDrawer
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) onClose();
          }}
        >
          <ModalDrawerContent>
            <ValidatedForm
              validator={inspectionDocumentValidator}
              method="post"
              action={path.to.newInspectionDocument}
              defaultValues={initialValues}
              fetcher={fetcher}
              className="flex flex-col h-full"
            >
              <ModalDrawerHeader>
                <ModalDrawerTitle>
                  <Trans>New Version</Trans>
                </ModalDrawerTitle>
              </ModalDrawerHeader>
              <ModalDrawerBody>
                <Hidden name="copyFromId" />
                <Hidden name="partId" />
                <Hidden name="drawingNumber" />
                <VStack spacing={4}>
                  <Number
                    name="version"
                    label={t`New Version`}
                    minValue={0}
                    helperText={t`The new version number of the document`}
                  />
                </VStack>
              </ModalDrawerBody>
              <ModalDrawerFooter>
                <HStack>
                  <Submit
                    isLoading={fetcher.state !== "idle"}
                    isDisabled={fetcher.state !== "idle" || isDisabled}
                  >
                    {t`Create`}
                  </Submit>
                </HStack>
              </ModalDrawerFooter>
            </ValidatedForm>
          </ModalDrawerContent>
        </ModalDrawer>
      </ModalDrawerProvider>
    );
  }

  return (
    <Drawer open onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DrawerContent>
        <ValidatedForm
          validator={inspectionDocumentValidator}
          method="post"
          action={
            isEditing
              ? path.to.inspectionDocument(initialValues.id!)
              : path.to.newInspectionDocument
          }
          defaultValues={initialValues}
          className="flex flex-col h-full"
        >
          <DrawerHeader>
            <DrawerTitle>
              {isEditing
                ? t`Edit Inspection Document`
                : t`New Inspection Document`}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <VStack spacing={4}>
              {isEditing && <Hidden name="id" />}
              <Item name="partId" type="Part" />
              <Input
                name="drawingNumber"
                label={t`Drawing Number`}
                placeholder={t`e.g. DWG-1234`}
              />
            </VStack>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="ghost" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Submit>{isEditing ? t`Save` : t`Create`}</Submit>
          </DrawerFooter>
        </ValidatedForm>
      </DrawerContent>
    </Drawer>
  );
}
