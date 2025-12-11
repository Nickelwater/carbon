import { useCarbon } from "@carbon/auth";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  ModalTitle,
  toast,
  useMount
} from "@carbon/react";
import { useRouteData } from "@carbon/remix";
import { getItemReadableId } from "@carbon/utils";
import { useFetcher, useNavigation, useParams } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { useUser } from "~/hooks";
import { useItems } from "~/stores";
import { path } from "~/utils/path";
import type { StockTransferLine } from "../../types";

const StockTransferPostModal = ({ onClose }: { onClose: () => void }) => {
  const { id } = useParams();
  if (!id) throw new Error("id not found");

  const [items] = useItems();
  const routeData = useRouteData<{
    stockTransferLines: StockTransferLine[];
  }>(path.to.stockTransfer(id));

  const navigation = useNavigation();

  const [validated, setValidated] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    {
      itemReadableId: string | null;
      pickedQuantity: number;
      pickedQuantityError: string;
    }[]
  >([]);

  const { carbon } = useCarbon();
  const {
    company: { id: companyId }
  } = useUser();

  const validateStockTransferTracking = async () => {
    const errors: {
      itemReadableId: string | null;
      pickedQuantity: number;
      pickedQuantityError: string;
    }[] = [];

    if (!carbon) {
      toast.error("Carbon client is not available");
      return;
    }

    if (
      routeData?.stockTransferLines.length === 0 ||
      routeData?.stockTransferLines.every((line) => line.pickedQuantity === 0)
    ) {
      setValidationErrors([
        {
          itemReadableId: null,
          pickedQuantity: 0,
          pickedQuantityError: "Stock transfer is empty"
        }
      ]);
    }

    routeData?.stockTransferLines.forEach(async (line: StockTransferLine) => {
      if (line.requiresBatchTracking || line.requiresSerialTracking) {
        if (line.trackedEntityId) {
          const trackedEntity = await carbon
            .from("trackedEntity")
            .select("*")
            .eq("id", line.trackedEntityId)
            .single();
          if (trackedEntity.data?.status !== "Available") {
            errors.push({
              itemReadableId: getItemReadableId(items, line.itemId) ?? null,
              pickedQuantity: line.pickedQuantity ?? 0,
              pickedQuantityError: "Tracked entity is not available"
            });
          }
        }
      }
    });

    setValidationErrors(errors);
    setValidated(true);
  };

  useMount(() => {
    validateStockTransferTracking();
  });

  const fetcher = useFetcher<{}>();
  const submitted = useRef(false);
  useEffect(() => {
    if (fetcher.state === "idle" && submitted.current) {
      onClose();
    }
  }, [fetcher.state]);

  return (
    <Modal
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Complete Stock Transfer</ModalTitle>
          <ModalDescription>
            Are you sure you want to complete this stock transfer?
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <LuTriangleAlert className="h-4 w-4" />
              <AlertTitle>Missing Information</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 mt-2 space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index} className="text-sm font-medium">
                      <span className="font-mono">{error.itemReadableId}</span>
                      <span className="text-muted-foreground ml-2">
                        {error.pickedQuantity}
                      </span>
                      <span className="block mt-0.5 text-red-500 font-normal">
                        {error.pickedQuantityError}
                      </span>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <HStack>
            <Button variant="solid" onClick={onClose}>
              Cancel
            </Button>
            <fetcher.Form
              action={path.to.stockTransferComplete(id)}
              method="post"
              onSubmit={() => {
                submitted.current = true;
              }}
            >
              <Button
                isLoading={fetcher.state !== "idle"}
                isDisabled={
                  fetcher.state !== "idle" ||
                  navigation.state !== "idle" ||
                  !validated ||
                  validationErrors.length > 0
                }
                type="submit"
              >
                Complete
              </Button>
            </fetcher.Form>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default StockTransferPostModal;
