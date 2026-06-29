import {
  Button,
  IconButton,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  toast,
  useDisclosure
} from "@carbon/react";
import { isSinglePackageShippingLabelRequest } from "@carbon/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import {
  LuCheck,
  LuDownload,
  LuFileText,
  LuPrinter,
  LuTag
} from "react-icons/lu";
import { useFetcher } from "react-router";
import type { PrinterContext } from "../assignments";
import { usePrinting } from "./PrintingProvider";

export type ShippingLabelFileRoutes = {
  pdf: (
    id: string,
    opts?: {
      labelSize?: string;
      lineId?: string;
      package?: number;
      of?: number;
    }
  ) => string;
  zpl: (
    id: string,
    opts?: {
      labelSize?: string;
      lineId?: string;
      package?: number;
      of?: number;
    }
  ) => string;
};

export function ShippingLabelPrintButton({
  sourceDocumentId,
  locationId,
  context = "shipping",
  lineId,
  disabled,
  fileRoutes
}: {
  sourceDocumentId: string;
  locationId: string | undefined;
  context?: PrinterContext;
  lineId?: string;
  disabled?: boolean;
  fileRoutes: ShippingLabelFileRoutes;
}) {
  const { t } = useLingui();
  const { printerRoutes, resolvePrinterRoute, printPath } = usePrinting();
  const modal = useDisclosure();
  const fetcher = useFetcher<{ success: boolean; message: string }>();

  const defaultPrinter = resolvePrinterRoute(locationId, context);
  const [selectedPrinterId, setSelectedPrinterId] = useState(
    defaultPrinter?.id ?? ""
  );
  const [packageIndex, setPackageIndex] = useState(1);
  const [packageCount, setPackageCount] = useState(1);

  useEffect(() => {
    if (modal.isOpen) {
      setSelectedPrinterId(defaultPrinter?.id ?? printerRoutes[0]?.id ?? "");
      setPackageIndex(1);
      setPackageCount(1);
    }
  }, [modal.isOpen, defaultPrinter?.id, printerRoutes]);

  useEffect(() => {
    if (fetcher.data?.success) {
      toast.success(fetcher.data.message);
      modal.onClose();
    } else if (fetcher.data?.success === false) {
      toast.error(fetcher.data.message);
    }
  }, [fetcher.data, modal.onClose]);

  const singlePackagePrint = isSinglePackageShippingLabelRequest(
    packageIndex,
    packageCount
  );

  const previewOptions = {
    lineId,
    ...(singlePackagePrint ? { package: packageIndex, of: packageCount } : {})
  };

  const openFile = (url: string) => {
    window.open(window.location.origin + url, "_blank");
  };

  const handlePrint = () => {
    fetcher.submit(
      {
        sourceDocument: "Shipment",
        sourceDocumentId,
        documentTypeId: "shippingLabel",
        ...(locationId ? { locationId } : {}),
        printerRouteId: selectedPrinterId,
        ...(lineId ? { lineId } : {}),
        ...(singlePackagePrint ? { packageIndex, packageCount } : {})
      },
      {
        method: "POST",
        action: printPath,
        encType: "application/json"
      }
    );
  };

  const trigger = lineId ? (
    <IconButton
      aria-label={t`Shipping Label`}
      icon={<LuTag />}
      variant="secondary"
      disabled={disabled}
      onClick={modal.onOpen}
    />
  ) : (
    <Button
      leftIcon={<LuTag />}
      variant="secondary"
      disabled={disabled}
      onClick={modal.onOpen}
    >
      <Trans>Shipping Label</Trans>
    </Button>
  );

  return (
    <>
      {trigger}

      {modal.isOpen && (
        <Modal open onOpenChange={(open) => !open && modal.onClose()}>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>
                <Trans>Shipping Label</Trans>
              </ModalTitle>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-4 pb-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="shipping-label-package-index">
                      <Trans>Package</Trans>
                    </Label>
                    <Input
                      id="shipping-label-package-index"
                      type="number"
                      min={1}
                      value={packageIndex}
                      onChange={(event) =>
                        setPackageIndex(
                          Math.max(1, Number(event.target.value) || 1)
                        )
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="shipping-label-package-count">
                      <Trans>Of</Trans>
                    </Label>
                    <Input
                      id="shipping-label-package-count"
                      type="number"
                      min={1}
                      value={packageCount}
                      onChange={(event) =>
                        setPackageCount(
                          Math.max(1, Number(event.target.value) || 1)
                        )
                      }
                    />
                  </div>
                </div>

                {printerRoutes.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {printerRoutes.map((route) => (
                      <button
                        type="button"
                        key={route.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          selectedPrinterId === route.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted"
                        }`}
                        onClick={() => setSelectedPrinterId(route.id)}
                      >
                        <LuPrinter className="size-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">
                            {route.name}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2 uppercase">
                            {route.format}
                          </span>
                        </div>
                        {selectedPrinterId === route.id && (
                          <LuCheck className="size-4 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted transition-colors text-left"
                    onClick={() =>
                      openFile(fileRoutes.pdf(sourceDocumentId, previewOptions))
                    }
                  >
                    <LuFileText className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">
                      <Trans>Preview PDF</Trans>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted transition-colors text-left"
                    onClick={() =>
                      openFile(fileRoutes.zpl(sourceDocumentId, previewOptions))
                    }
                  >
                    <LuDownload className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">
                      <Trans>Download ZPL</Trans>
                    </span>
                  </button>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <div className="flex gap-2">
                {printerRoutes.length > 0 ? (
                  <Button
                    variant="primary"
                    leftIcon={<LuPrinter />}
                    disabled={!selectedPrinterId || fetcher.state !== "idle"}
                    onClick={handlePrint}
                  >
                    <Trans>Print</Trans>
                  </Button>
                ) : null}
                <Button variant="solid" onClick={modal.onClose}>
                  <Trans>Close</Trans>
                </Button>
              </div>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </>
  );
}
