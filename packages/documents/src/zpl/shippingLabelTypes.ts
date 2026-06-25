export type ShippingLabelItem = {
  partNumber: string;
  revision: string;
  quantity: string;
  /** Numeric quantity only — used for the QTY barcode. */
  quantityBarcode: string;
  purchaseOrder: string;
  lineNumber: string;
  packingListNumber: string;
  description: string;
  salesOrderNumber: string;
  shipToLines: string[];
  supplierName: string;
  supplierLines: string[];
  shipDate: string;
  packageIndex: number;
  packageCount: number;
  qrValue: string;
};
