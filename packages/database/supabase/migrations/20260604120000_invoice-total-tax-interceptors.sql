-- =============================================================================
-- Keep invoice "totalTax" header columns in sync with their line items.
--
-- Root cause of the "totalTax: 0" bug: salesInvoice."totalTax" and
-- purchaseInvoice."totalTax" are stored denormalized columns written to 0 at
-- invoice creation (convert edge function: convert/index.ts:726/:1315 sales,
-- :320 purchase) and never recomputed. The per-line tax is the real source of
-- truth, so the API (salesInvoices/purchaseInvoices views -> *.totalTax) and the
-- Xero sync (invoice.ts TaxTotal / bill.ts TotalTax) both report 0.
--
-- Fix: AFTER interceptors on each *InvoiceLine table that recompute the parent
-- invoice's "totalTax" on insert/update/delete, plus one-time backfills.
-- Idempotent: safe to re-run.
-- =============================================================================


-- #############################################################################
-- SALES INVOICE
-- #############################################################################

-- Taxable base per line matches the salesInvoices view's "invoiceTotal":
--   taxPercent * (quantity*unitPrice + shippingCost + addOnCost)
-- (raw / document currency, to match the stored "subtotal"; nonTaxableAddOnCost
-- is excluded, and shipment-level shipping is untaxed -> tax depends only on
-- salesInvoiceLine rows). salesInvoiceLine."invoiceId" is the FK to
-- salesInvoice."id". On DELETE the dispatcher passes the OLD row as p_new, so
-- p_new->>'invoiceId' is populated for INSERT, UPDATE, and DELETE.

CREATE OR REPLACE FUNCTION sync_recompute_sales_invoice_tax(
  p_table TEXT,
  p_operation TEXT,
  p_new JSONB,
  p_old JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id TEXT := p_new->>'invoiceId';
  v_old_invoice_id TEXT;
BEGIN
  IF v_invoice_id IS NOT NULL THEN
    UPDATE "salesInvoice" si
    SET "totalTax" = COALESCE((
      SELECT SUM(
        COALESCE(sil."taxPercent", 0) * (
          COALESCE(sil."quantity", 0) * COALESCE(sil."unitPrice", 0)
          + COALESCE(sil."shippingCost", 0)
          + COALESCE(sil."addOnCost", 0)
        )
      )
      FROM "salesInvoiceLine" sil
      WHERE sil."invoiceId" = v_invoice_id
    ), 0)
    WHERE si."id" = v_invoice_id;
  END IF;

  -- Defensive: if a line is re-pointed to a different invoice on UPDATE,
  -- refresh the previous invoice's total too.
  IF p_operation = 'UPDATE' THEN
    v_old_invoice_id := p_old->>'invoiceId';
    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id IS DISTINCT FROM v_invoice_id THEN
      UPDATE "salesInvoice" si
      SET "totalTax" = COALESCE((
        SELECT SUM(
          COALESCE(sil."taxPercent", 0) * (
            COALESCE(sil."quantity", 0) * COALESCE(sil."unitPrice", 0)
            + COALESCE(sil."shippingCost", 0)
            + COALESCE(sil."addOnCost", 0)
          )
        )
        FROM "salesInvoiceLine" sil
        WHERE sil."invoiceId" = v_old_invoice_id
      ), 0)
      WHERE si."id" = v_old_invoice_id;
    END IF;
  END IF;
END;
$$;

-- Register the AFTER interceptor on salesInvoiceLine. The existing registration
-- (20260218) passes only an empty BEFORE list; the async statement-level audit
-- triggers are re-attached unconditionally by attach_event_trigger.
SELECT attach_event_trigger(
  'salesInvoiceLine',
  ARRAY[]::TEXT[],
  ARRAY['sync_recompute_sales_invoice_tax']::TEXT[]
);

-- Backfill existing invoices. The IS DISTINCT FROM guard skips already-correct
-- rows, avoiding no-op writes.
UPDATE "salesInvoice" si
SET "totalTax" = t."computedTax"
FROM (
  SELECT
    inv."id" AS "invoiceId",
    COALESCE(SUM(
      COALESCE(sil."taxPercent", 0) * (
        COALESCE(sil."quantity", 0) * COALESCE(sil."unitPrice", 0)
        + COALESCE(sil."shippingCost", 0)
        + COALESCE(sil."addOnCost", 0)
      )
    ), 0) AS "computedTax"
  FROM "salesInvoice" inv
  LEFT JOIN "salesInvoiceLine" sil ON sil."invoiceId" = inv."id"
  GROUP BY inv."id"
) t
WHERE si."id" = t."invoiceId"
  AND si."totalTax" IS DISTINCT FROM t."computedTax";


-- #############################################################################
-- PURCHASE INVOICE
-- #############################################################################

-- purchaseInvoiceLine."taxAmount" is a GENERATED column (= supplierTaxAmount *
-- exchangeRate, base currency) that the purchaseInvoices view already sums into
-- "orderTotal", so the header total is simply SUM("taxAmount") -- consistent
-- with the stored "subtotal" (also base currency).

CREATE OR REPLACE FUNCTION sync_recompute_purchase_invoice_tax(
  p_table TEXT,
  p_operation TEXT,
  p_new JSONB,
  p_old JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id TEXT := p_new->>'invoiceId';
  v_old_invoice_id TEXT;
BEGIN
  IF v_invoice_id IS NOT NULL THEN
    UPDATE "purchaseInvoice" pi
    SET "totalTax" = COALESCE((
      SELECT SUM(COALESCE(pil."taxAmount", 0))
      FROM "purchaseInvoiceLine" pil
      WHERE pil."invoiceId" = v_invoice_id
    ), 0)
    WHERE pi."id" = v_invoice_id;
  END IF;

  -- Defensive: if a line is re-pointed to a different invoice on UPDATE,
  -- refresh the previous invoice's total too.
  IF p_operation = 'UPDATE' THEN
    v_old_invoice_id := p_old->>'invoiceId';
    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id IS DISTINCT FROM v_invoice_id THEN
      UPDATE "purchaseInvoice" pi
      SET "totalTax" = COALESCE((
        SELECT SUM(COALESCE(pil."taxAmount", 0))
        FROM "purchaseInvoiceLine" pil
        WHERE pil."invoiceId" = v_old_invoice_id
      ), 0)
      WHERE pi."id" = v_old_invoice_id;
    END IF;
  END IF;
END;
$$;

-- Register the AFTER interceptor on purchaseInvoiceLine.
-- IMPORTANT: purchaseInvoiceLine already has an AFTER interceptor
-- (sync_purchase_invoice_line_price_change). 20260416 deliberately moved it
-- BEFORE -> AFTER because the generated STORED column "unitPrice" is NULL in
-- BEFORE triggers (which crashed it on the NOT NULL price-change insert). It
-- must STAY in the AFTER list -- moving it back to BEFORE would reintroduce that
-- crash. Our tax interceptor is also AFTER (it reads the finalized generated
-- "taxAmount" column), so both go in the AFTER array.
SELECT attach_event_trigger(
  'purchaseInvoiceLine',
  ARRAY[]::TEXT[],
  ARRAY['sync_purchase_invoice_line_price_change', 'sync_recompute_purchase_invoice_tax']::TEXT[]
);

-- Backfill. ROUND to 2dp: purchaseInvoice."totalTax" is NUMERIC(10,2) while
-- "taxAmount" is NUMERIC(10,5), so rounding keeps the guard idempotent on re-run.
UPDATE "purchaseInvoice" pi
SET "totalTax" = ROUND(t."computedTax", 2)
FROM (
  SELECT
    inv."id" AS "invoiceId",
    COALESCE(SUM(COALESCE(pil."taxAmount", 0)), 0) AS "computedTax"
  FROM "purchaseInvoice" inv
  LEFT JOIN "purchaseInvoiceLine" pil ON pil."invoiceId" = inv."id"
  GROUP BY inv."id"
) t
WHERE pi."id" = t."invoiceId"
  AND pi."totalTax" IS DISTINCT FROM ROUND(t."computedTax", 2);
