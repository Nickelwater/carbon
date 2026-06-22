import { useControlField, ValidatedForm } from "@carbon/form";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  HStack,
  Label,
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
import { useEffect, useMemo } from "react";
import { useFetcher } from "react-router";
import type { z } from "zod";
import { Hidden, Input, Item, Number, Select, Submit } from "~/components/Form";
import { usePermissions } from "~/hooks";
import { inspectionDocumentValidator } from "~/modules/quality/quality.models";
import { path } from "~/utils/path";

/** Radix Select forbids empty-string option values; use this for "no file". */
const NO_PART_FILE = "__none__";

type PartFileOption = {
  name: string;
  size: number | null;
  createdAt: string | null;
};

type InspectionDocumentFormProps = {
  initialValues: z.infer<typeof inspectionDocumentValidator> & {
    partId: string;
  };
  type?: "new" | "copy";
  open?: boolean;
  onClose: () => void;
};

function InspectionDocumentNewFields() {
  const { t } = useLingui();
  const [partId] = useControlField<string>("partId");
  const [partFileName, setPartFileName] = useControlField<string | undefined>(
    "partFileName"
  );
  const filesFetcher = useFetcher<{ files: PartFileOption[] }>();

  useEffect(() => {
    setPartFileName(NO_PART_FILE);
    if (!partId?.trim()) return;
    filesFetcher.load(path.to.inspectionPartFiles(partId));
  }, [partId, setPartFileName]);

  const files = filesFetcher.data?.files ?? [];
  const isLoadingFiles =
    Boolean(partId?.trim()) && filesFetcher.state !== "idle";
  const hasPartFileSelected =
    Boolean(partFileName) && partFileName !== NO_PART_FILE;

  const fileOptions = useMemo(
    () => [
      { value: NO_PART_FILE, label: t`None` },
      ...files.map((file) => ({
        value: file.name,
        label: file.name
      }))
    ],
    [files, t]
  );

  return (
    <VStack spacing={4}>
      <Item name="partId" type="Part" />
      <Input
        name="drawingNumber"
        label={t`Drawing Number`}
        placeholder={t`e.g. DWG-1234`}
      />
      {partId?.trim() && (
        <div className="flex flex-col gap-2 w-full">
          <Label>
            <Trans>Part file</Trans>
          </Label>
          {isLoadingFiles && files.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Trans>Loading files for this part…</Trans>
            </p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Trans>
                No PDF files found in this part&apos;s Files section. Upload a
                PDF on the part first, or create the document without a file and
                upload one later.
              </Trans>
            </p>
          ) : (
            <>
              <Select
                name="partFileName"
                options={fileOptions}
                isLoading={isLoadingFiles}
                onChange={(v) => setPartFileName(v?.value ?? NO_PART_FILE)}
              />
              {hasPartFileSelected && (
                <p className="text-xs text-muted-foreground">
                  <Trans>
                    The selected PDF from the part&apos;s Files section will be
                    attached to this inspection document.
                  </Trans>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </VStack>
  );
}

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
          defaultValues={{
            ...initialValues,
            partFileName: NO_PART_FILE
          }}
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
            {isEditing ? (
              <VStack spacing={4}>
                <Hidden name="id" />
                <Item name="partId" type="Part" />
                <Input
                  name="drawingNumber"
                  label={t`Drawing Number`}
                  placeholder={t`e.g. DWG-1234`}
                />
              </VStack>
            ) : (
              <InspectionDocumentNewFields />
            )}
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
