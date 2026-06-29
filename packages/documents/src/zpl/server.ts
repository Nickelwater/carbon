/**
 * Server-only ZPL helpers (native deps). Import from `@carbon/documents/zpl/server`
 * in jobs/SSR code — not from `@carbon/documents/zpl` (client-safe barrel).
 */
export { rasterizePdfToShippingLabelZpl } from "./rasterizeLabelPdf";
