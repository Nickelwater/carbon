import { useCarbon } from "@carbon/auth";
import { TextArea, ValidatedForm } from "@carbon/form";
import {
  Badge,
  Button,
  CardAction,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIcon,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HStack,
  IconButton,
  ModalCard,
  ModalCardBody,
  ModalCardContent,
  ModalCardDescription,
  ModalCardFooter,
  ModalCardHeader,
  ModalCardProvider,
  ModalCardTitle,
  Switch,
  toast,
  useDisclosure,
  VStack
} from "@carbon/react";
import { getItemReadableId } from "@carbon/utils";
import { useState } from "react";
import { BsThreeDotsVertical } from "react-icons/bs";
import { LuCircleArrowUp, LuTrash } from "react-icons/lu";
import { Link, useFetcher, useParams } from "react-router";
import type { z } from "zod";
import { MethodIcon, MethodItemTypeIcon } from "~/components";
import { ConfiguratorModal } from "~/components/Configurator/ConfiguratorForm";
import {
  ArrayNumeric,
  CustomFormFields,
  Hidden,
  Input,
  InputControlled,
  Item,
  // biome-ignore lint/suspicious/noShadowRestrictedNames: suppressed due to migration
  Number,
  Select,
  SelectControlled,
  Submit,
  UnitOfMeasure
} from "~/components/Form";
import { QuoteLineStatusIcon } from "~/components/Icons";
import {
  usePercentFormatter,
  usePermissions,
  useRouteData,
  useUser
} from "~/hooks";
import type {
  ConfigurationParameter,
  ConfigurationParameterGroup
} from "~/modules/items/types";
import { getLinkToItemDetails } from "~/modules/items/ui/Item/ItemForm";
import { methodType } from "~/modules/shared";
import type { action } from "~/routes/x+/quote+/$quoteId.new";
import { useItems } from "~/stores";
import { path } from "~/utils/path";
import {
  newQuotePartLineValidator,
  quoteLineStatusType,
  quoteLineValidator
} from "../../sales.models";
import type { Quotation, QuotationLine } from "../../types";
import DeleteQuoteLine from "./DeleteQuoteLine";

function PromoteQuotePartMenuItem({
  quoteLineId,
  quoteId
}: {
  quoteLineId: string;
  quoteId: string;
}) {
  const fetcher = useFetcher();
  return (
    <DropdownMenuItem
      onSelect={() =>
        fetcher.submit(
          {},
          {
            method: "post",
            action: path.to.quoteLinePromoteToPart(quoteId, quoteLineId)
          }
        )
      }
      disabled={fetcher.state !== "idle"}
    >
      <DropdownMenuIcon icon={<LuCircleArrowUp />} />
      Promote to part
    </DropdownMenuItem>
  );
}

type QuoteLineFormProps = {
  initialValues: z.infer<typeof quoteLineValidator>;
  type?: "card" | "modal";
  onClose?: () => void;
};

const QuoteLineForm = ({
  initialValues,
  type,
  onClose
}: QuoteLineFormProps) => {
  const fetcher = useFetcher<typeof action>();
  const permissions = usePermissions();
  const { company } = useUser();
  const { carbon } = useCarbon();

  const { quoteId } = useParams();

  if (!quoteId) throw new Error("quoteId not found");

  const [items] = useItems();
  const routeData = useRouteData<{
    quote: Quotation;
  }>(path.to.quote(quoteId));

  const isEditable = ["Draft", "To Review"].includes(
    routeData?.quote?.status ?? ""
  );

  const isEditing = initialValues.id !== undefined;

  const [partSourceState, setPartSourceState] = useState<"item" | "quotePart">(
    "quotePart"
  );
  const isQuotePartLine = !isEditing && partSourceState === "quotePart";
  const isEditingQuotePartLine =
    isEditing && !!(initialValues as { quotePartId?: string }).quotePartId;

  const [itemData, setItemData] = useState<{
    customerPartId: string;
    customerPartRevision: string;
    description: string;
    itemId: string;
    methodType: string;
    modelUploadId: string | null;
    uom: string;
    quotePartName?: string;
    quotePartDescription?: string;
  }>({
    customerPartId: initialValues.customerPartId ?? "",
    customerPartRevision: initialValues.customerPartRevision ?? "",
    itemId: (initialValues as { itemId?: string }).itemId ?? "",
    description: initialValues.description ?? "",
    methodType: initialValues.methodType ?? "",
    uom: initialValues.unitOfMeasureCode ?? "",
    modelUploadId: initialValues.modelUploadId ?? null,
    quotePartName: "",
    quotePartDescription: ""
  });

  const configurationDisclosure = useDisclosure();
  const [requiresConfiguration, setRequiresConfiguration] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [configurationParameters, setConfigurationParameters] = useState<{
    parameters: ConfigurationParameter[];
    groups: ConfigurationParameterGroup[];
  } | null>(null);
  const [configurationValues, setConfigurationValues] = useState<
    Record<string, any> | ""
  >("");

  const percentFormatter = usePercentFormatter();

  const onCustomerPartChange = async (customerPartId: string) => {
    if (!carbon || !routeData?.quote?.customerId) return;

    const customerPart = await carbon
      .from("customerPartToItem")
      .select("itemId")
      .eq("customerPartId", customerPartId)
      .eq("customerPartRevision", itemData.customerPartRevision ?? "")
      .eq("customerId", routeData?.quote?.customerId!)
      .maybeSingle();

    if (customerPart.error) {
      toast.error("Failed to load customer part details");
      return;
    }

    if (customerPart.data && customerPart.data.itemId && !itemData.itemId) {
      onItemChange(customerPart.data.itemId);
    }
  };

  const onCustomerPartRevisionChange = async (customerPartRevision: string) => {
    if (!carbon || !routeData?.quote?.customerId || !itemData.customerPartId)
      return;

    const customerPart = await carbon
      .from("customerPartToItem")
      .select("itemId")
      .eq("customerPartId", itemData.customerPartId)
      .eq("customerPartRevision", customerPartRevision ?? "")
      .eq("customerId", routeData?.quote?.customerId!)
      .maybeSingle();

    if (customerPart.error) {
      toast.error("Failed to load customer part details");
      return;
    }

    if (customerPart.data && customerPart.data.itemId && !itemData.itemId) {
      onItemChange(customerPart.data.itemId);
    }
  };

  const onItemChange = async (itemId: string) => {
    if (!carbon) return;

    const [item, customerPart, itemReplenishment] = await Promise.all([
      carbon
        .from("item")
        .select(
          "name, readableIdWithRevision, defaultMethodType, unitOfMeasureCode, modelUploadId"
        )
        .eq("id", itemId)
        .eq("companyId", company.id)
        .single(),
      carbon
        .from("customerPartToItem")
        .select("customerPartId, customerPartRevision")
        .eq("itemId", itemId)
        .eq("customerId", routeData?.quote?.customerId!)
        .maybeSingle(),
      carbon
        .from("itemReplenishment")
        .select("requiresConfiguration")
        .eq("itemId", itemId)
        .maybeSingle()
    ]);

    if (item.error) {
      toast.error("Failed to load item details");
      return;
    }

    const newItemData = {
      ...itemData,
      itemId,
      description: item.data?.name ?? "",
      methodType: item.data?.defaultMethodType ?? "",
      uom: item.data?.unitOfMeasureCode ?? "",
      modelUploadId: item.data?.modelUploadId ?? null
    };

    if (customerPart.data && !itemData.customerPartId) {
      newItemData.customerPartId = customerPart.data.customerPartId;
      newItemData.customerPartRevision =
        customerPart.data.customerPartRevision ?? "";
    }

    setItemData(newItemData);
    if (itemReplenishment.data?.requiresConfiguration) {
      setRequiresConfiguration(true);
      const [parameters, groups] = await Promise.all([
        carbon
          .from("configurationParameter")
          .select("*")
          .eq("itemId", itemId)
          .eq("companyId", company.id),
        carbon
          .from("configurationParameterGroup")
          .select("*")
          .eq("itemId", itemId)
          .eq("companyId", company.id)
      ]);

      if (parameters.error || groups.error) {
        toast.error("Failed to load configuration parameters");
        return;
      }

      setConfigurationParameters({
        parameters: parameters.data ?? [],
        groups: groups.data ?? []
      });
    } else {
      setRequiresConfiguration(false);
      setConfigurationParameters(null);
    }
  };

  const deleteDisclosure = useDisclosure();

  return (
    <>
      <ModalCardProvider type={type}>
        <ModalCard
          onClose={onClose}
          defaultCollapsed={false}
          isCollapsible={isEditing}
        >
          <ModalCardContent size="xxlarge">
            <ValidatedForm
              fetcher={fetcher}
              defaultValues={initialValues}
              validator={
                isQuotePartLine ? newQuotePartLineValidator : quoteLineValidator
              }
              method="post"
              action={
                isEditing
                  ? path.to.quoteLine(quoteId, initialValues.id!)
                  : path.to.newQuoteLine(quoteId)
              }
              className="w-full"
              onSubmit={() => {
                if (type === "modal") onClose?.();
              }}
            >
              <HStack className="w-full justify-between items-start">
                <ModalCardHeader>
                  <ModalCardTitle>
                    {isEditing
                      ? (((initialValues as { quotePartId?: string })
                          .quotePartId
                          ? (initialValues as { itemReadableId?: string })
                              .itemReadableId
                          : getItemReadableId(items, itemData?.itemId)) ??
                        "Quote Line")
                      : "New Quote Line"}
                  </ModalCardTitle>
                  <ModalCardDescription>
                    {isEditing ? (
                      <div className="flex flex-col items-start gap-1">
                        <span>{itemData?.description}</span>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="flex items-center gap-2"
                          >
                            <MethodIcon type={itemData.methodType} />
                            {initialValues?.quantity.join(", ")}
                          </Badge>
                          {initialValues?.taxPercent > 0 ? (
                            <Badge variant="red">
                              {percentFormatter.format(
                                initialValues?.taxPercent
                              )}{" "}
                              Tax
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      "A quote line contains pricing and lead times for a particular part"
                    )}
                  </ModalCardDescription>
                </ModalCardHeader>
                {isEditing && permissions.can("update", "sales") && (
                  <CardAction className="pr-12">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          icon={<BsThreeDotsVertical />}
                          aria-label="More"
                          variant="ghost"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          destructive
                          onClick={deleteDisclosure.onOpen}
                        >
                          <DropdownMenuIcon icon={<LuTrash />} />
                          Delete Line
                        </DropdownMenuItem>
                        {(initialValues as { quotePartId?: string })
                          .quotePartId ? (
                          <PromoteQuotePartMenuItem
                            quoteLineId={initialValues.id!}
                            quoteId={quoteId}
                          />
                        ) : (
                          itemData.itemId && (
                            <DropdownMenuItem asChild>
                              <Link
                                to={getLinkToItemDetails(
                                  "Part",
                                  itemData.itemId
                                )}
                              >
                                <DropdownMenuIcon
                                  icon={<MethodItemTypeIcon type="Part" />}
                                />
                                View Item Master
                              </Link>
                            </DropdownMenuItem>
                          )
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardAction>
                )}
              </HStack>
              <ModalCardBody>
                <Hidden name="id" />
                <Hidden name="quoteId" />
                {!isQuotePartLine && (
                  <>
                    <Hidden name="unitOfMeasureCode" value={itemData?.uom} />
                    <Hidden
                      name="modelUploadId"
                      value={itemData?.modelUploadId ?? undefined}
                    />
                  </>
                )}
                {!isEditing && requiresConfiguration && (
                  <Hidden
                    name="configuration"
                    value={JSON.stringify(configurationValues)}
                  />
                )}
                <VStack className="w-full">
                  {!isEditing && (
                    <HStack
                      spacing={2}
                      className="w-full items-center justify-start gap-2 pb-1"
                    >
                      <Switch
                        variant="small"
                        label="Quote-only part"
                        checked={partSourceState === "quotePart"}
                        onCheckedChange={(checked) =>
                          setPartSourceState(checked ? "quotePart" : "item")
                        }
                      />
                      <span className="text-xs text-muted-foreground">
                        {partSourceState === "quotePart"
                          ? "Creating a quote-only part"
                          : "Selecting an existing internal part"}
                      </span>
                      <Hidden name="partSource" value={partSourceState} />
                    </HStack>
                  )}
                  <div className="grid w-full gap-x-8 gap-y-4 grid-cols-1 lg:grid-cols-3">
                    <div className="col-span-2 grid w-full gap-x-8 gap-y-4 grid-cols-1 lg:grid-cols-2 auto-rows-min">
                      {isQuotePartLine ? (
                        <>
                          <InputControlled
                            name="quotePartName"
                            label="Part name / Customer part number"
                            value={
                              itemData.quotePartName ??
                              itemData.customerPartId ??
                              ""
                            }
                            onChange={(v) =>
                              setItemData((d) => ({
                                ...d,
                                quotePartName: v,
                                customerPartId: v
                              }))
                            }
                          />
                          <div className="hidden">
                            <Hidden
                              name="customerPartId"
                              value={itemData.customerPartId ?? ""}
                            />
                          </div>
                          <InputControlled
                            name="customerPartRevision"
                            label="Customer Part Revision"
                            value={itemData.customerPartRevision ?? ""}
                            onChange={(v) =>
                              setItemData((d) => ({
                                ...d,
                                customerPartRevision: v ?? ""
                              }))
                            }
                          />
                          <InputControlled
                            name="quotePartDescription"
                            label="Short description"
                            value={itemData.quotePartDescription ?? ""}
                            onChange={(v) =>
                              setItemData((d) => ({
                                ...d,
                                quotePartDescription: v
                              }))
                            }
                          />
                          <SelectControlled
                            name="defaultMethodType"
                            label="Method"
                            options={methodType.map((m) => ({
                              label: (
                                <span className="flex items-center gap-2">
                                  <MethodIcon type={m} />
                                  {m}
                                </span>
                              ),
                              value: m
                            }))}
                            value={itemData.methodType}
                            onChange={(v) =>
                              v &&
                              setItemData((d) => ({
                                ...d,
                                methodType: v.value
                              }))
                            }
                          />
                          <UnitOfMeasure
                            name="unitOfMeasureCode"
                            label="Unit of measure"
                          />
                        </>
                      ) : isEditingQuotePartLine ? (
                        <>
                          <Input
                            name="partDisplay"
                            label="Part"
                            value={
                              (initialValues as { itemReadableId?: string })
                                .itemReadableId ?? "—"
                            }
                            readOnly
                          />
                          <div className="hidden">
                            <Hidden
                              name="quotePartId"
                              value={
                                (initialValues as { quotePartId?: string })
                                  .quotePartId ?? ""
                              }
                            />
                            <Hidden name="itemId" value="" />
                          </div>
                          <InputControlled
                            name="description"
                            label="Short Description"
                            value={itemData.description}
                          />
                        </>
                      ) : (
                        <>
                          <Item
                            autoFocus
                            name="itemId"
                            label="Part"
                            type="Part"
                            value={itemData.itemId}
                            includeInactive
                            onChange={(value) => {
                              onItemChange(value?.value as string);
                            }}
                          />

                          <InputControlled
                            name="description"
                            label="Short Description"
                            value={itemData.description}
                          />
                        </>
                      )}

                      {!isQuotePartLine && (
                        <SelectControlled
                          name="methodType"
                          label="Method"
                          options={
                            methodType.map((m) => ({
                              label: (
                                <span className="flex items-center gap-2">
                                  <MethodIcon type={m} />
                                  {m}
                                </span>
                              ),
                              value: m
                            })) ?? []
                          }
                          value={itemData.methodType}
                          onChange={(newValue) => {
                            if (newValue)
                              setItemData((d) => ({
                                ...d,
                                methodType: newValue?.value
                              }));
                          }}
                        />
                      )}

                      <Select
                        name="status"
                        label="Line Status"
                        options={quoteLineStatusType.map((s) => ({
                          label: (
                            <span className="flex items-center gap-2">
                              <QuoteLineStatusIcon status={s} />
                              {s}
                            </span>
                          ),
                          value: s
                        }))}
                      />

                      {!isQuotePartLine && (
                        <>
                          <InputControlled
                            name="customerPartId"
                            label="Customer Part Number"
                            value={itemData.customerPartId}
                            onChange={(newValue) => {
                              setItemData((d) => ({
                                ...d,
                                customerPartId: newValue
                              }));
                            }}
                            onBlur={(e) => onCustomerPartChange(e.target.value)}
                          />
                          <InputControlled
                            name="customerPartRevision"
                            label="Customer Part Revision"
                            value={itemData.customerPartRevision}
                            onChange={(newValue) => {
                              setItemData((d) => ({
                                ...d,
                                customerPartRevision: newValue
                              }));
                            }}
                            onBlur={(e) =>
                              onCustomerPartRevisionChange(e.target.value)
                            }
                          />
                        </>
                      )}
                      <Number
                        name="taxPercent"
                        label="Tax Percent"
                        minValue={0}
                        maxValue={1}
                        step={0.0001}
                        formatOptions={{
                          style: "percent",
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2
                        }}
                      />

                      <CustomFormFields table="quoteLine" />
                      {initialValues.status === "No Quote" && (
                        <TextArea
                          name="noQuoteReason"
                          label="No Quote Reason"
                        />
                      )}
                    </div>
                    <div className="flex gap-y-4">
                      <ArrayNumeric
                        name="quantity"
                        label="Quantity"
                        defaults={[1, 25, 50, 100]}
                        isDisabled={!isEditable}
                      />
                    </div>
                  </div>
                </VStack>
              </ModalCardBody>
              <ModalCardFooter>
                {!isEditing && (
                  <Button variant="secondary" onClick={onClose}>
                    Cancel
                  </Button>
                )}
                {!isEditing && requiresConfiguration && (
                  <Button
                    variant={isConfigured ? "secondary" : "primary"}
                    isLoading={fetcher.state !== "idle"}
                    type="button"
                    isDisabled={
                      !isEditable ||
                      (isEditing
                        ? !permissions.can("update", "sales")
                        : !permissions.can("create", "sales"))
                    }
                    onClick={() => {
                      configurationDisclosure.onOpen();
                    }}
                  >
                    Configure
                  </Button>
                )}

                <Submit
                  isLoading={fetcher.state !== "idle"}
                  isDisabled={
                    (requiresConfiguration && !isConfigured) ||
                    !isEditable ||
                    (isEditing
                      ? !permissions.can("update", "sales")
                      : !permissions.can("create", "sales"))
                  }
                >
                  Save
                </Submit>
              </ModalCardFooter>
            </ValidatedForm>
          </ModalCardContent>
        </ModalCard>
      </ModalCardProvider>
      {isEditing && deleteDisclosure.isOpen && (
        <DeleteQuoteLine
          line={initialValues as QuotationLine}
          onCancel={deleteDisclosure.onClose}
        />
      )}
      {requiresConfiguration &&
        configurationDisclosure.isOpen &&
        configurationParameters && (
          <ConfiguratorModal
            open
            initialValues={configurationValues || {}}
            groups={configurationParameters.groups ?? []}
            parameters={configurationParameters.parameters ?? []}
            onClose={configurationDisclosure.onClose}
            onSubmit={(config: Record<string, any>) => {
              setConfigurationValues(config);
              setIsConfigured(true);
              configurationDisclosure.onClose();
            }}
          />
        )}
    </>
  );
};

export default QuoteLineForm;
