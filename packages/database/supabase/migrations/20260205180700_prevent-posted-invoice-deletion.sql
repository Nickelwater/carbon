-- Prevent deletion of non-Draft purchase and sales invoices
-- Uses the event system sync interceptor pattern

-- 1. Create interceptor function for purchase invoices
CREATE OR REPLACE FUNCTION prevent_posted_purchase_invoice_deletion(
  p_table TEXT,
  p_operation TEXT,
  p_new JSONB,
  p_old JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check DELETE operations
  IF p_operation = 'DELETE' THEN
    -- Check if the invoice status is not Draft
    IF p_old->>'status' IS DISTINCT FROM 'Draft' THEN
      RAISE EXCEPTION 'Cannot delete purchase invoice with status "%". Only Draft invoices can be deleted.', p_old->>'status';
    END IF;
  END IF;
END;
$$;

-- 2. Create interceptor function for sales invoices
CREATE OR REPLACE FUNCTION prevent_posted_sales_invoice_deletion(
  p_table TEXT,
  p_operation TEXT,
  p_new JSONB,
  p_old JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check DELETE operations
  IF p_operation = 'DELETE' THEN
    -- Check if the invoice status is not Draft
    IF p_old->>'status' IS DISTINCT FROM 'Draft' THEN
      RAISE EXCEPTION 'Cannot delete sales invoice with status "%". Only Draft invoices can be deleted.', p_old->>'status';
    END IF;
  END IF;
END;
$$;

-- 3. Attach event triggers with sync interceptors
SELECT attach_event_trigger('purchaseInvoice', ARRAY['prevent_posted_purchase_invoice_deletion']::TEXT[]);
SELECT attach_event_trigger('salesInvoice', ARRAY['prevent_posted_sales_invoice_deletion']::TEXT[]);
