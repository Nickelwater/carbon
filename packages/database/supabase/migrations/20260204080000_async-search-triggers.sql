-- =============================================================================
-- Migrate Search Triggers to Async Event System
-- This migration:
-- 1. Adds SEARCH to handlerType enum
-- 2. Creates helper RPC functions for search index operations
-- 3. Drops old row-level search triggers
-- 4. Attaches async statement-level triggers via event system
-- 5. Creates internal search subscriptions for all companies
-- =============================================================================

-- =============================================================================
-- PART 1: Update handlerType CHECK constraint to include SEARCH
-- =============================================================================

ALTER TABLE "eventSystemSubscription" 
DROP CONSTRAINT IF EXISTS "eventSystemSubscription_handlerType_check";

ALTER TABLE "eventSystemSubscription" 
ADD CONSTRAINT "eventSystemSubscription_handlerType_check" 
CHECK ("handlerType" IN ('WEBHOOK', 'WORKFLOW', 'SYNC', 'SEARCH'));


-- =============================================================================
-- PART 2: Create Helper RPC Functions for Search Index Operations
-- =============================================================================

-- Delete from search index (handles dynamic table name)
CREATE OR REPLACE FUNCTION delete_from_search_index(
  p_company_id TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT
)
RETURNS VOID AS $$
DECLARE
  v_table_name TEXT;
BEGIN
  v_table_name := 'searchIndex_' || p_company_id;
  
  EXECUTE format(
    'DELETE FROM %I WHERE "entityType" = $1 AND "entityId" = $2',
    v_table_name
  ) USING p_entity_type, p_entity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Upsert to search index (handles dynamic table name)
CREATE OR REPLACE FUNCTION upsert_to_search_index(
  p_company_id TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_title TEXT,
  p_description TEXT,
  p_link TEXT,
  p_tags TEXT[],
  p_metadata JSONB
)
RETURNS VOID AS $$
DECLARE
  v_table_name TEXT;
  v_search_text TEXT;
BEGIN
  v_table_name := 'searchIndex_' || p_company_id;
  v_search_text := p_title || ' ' || COALESCE(p_description, '') || ' ' || COALESCE(array_to_string(p_tags, ' '), '');
  
  EXECUTE format('
    INSERT INTO %I ("entityType", "entityId", "title", "description", "link", "tags", "metadata", "searchVector")
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector(''english'', $8))
    ON CONFLICT ("entityType", "entityId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "link" = EXCLUDED."link",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "searchVector" = EXCLUDED."searchVector",
      "updatedAt" = NOW()
  ', v_table_name) USING 
    p_entity_type, 
    p_entity_id, 
    p_title, 
    COALESCE(p_description, ''),
    p_link, 
    COALESCE(p_tags, ARRAY[]::text[]), 
    COALESCE(p_metadata, '{}'::jsonb),
    v_search_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- PART 3: Drop Old Row-Level Search Triggers
-- =============================================================================

-- Employee triggers
DROP TRIGGER IF EXISTS sync_employee_search_insert ON "employee";
DROP TRIGGER IF EXISTS sync_employee_search_update ON "employee";
DROP TRIGGER IF EXISTS sync_employee_search_delete ON "employee";

-- Customer triggers
DROP TRIGGER IF EXISTS sync_customer_search_insert ON "customer";
DROP TRIGGER IF EXISTS sync_customer_search_update ON "customer";
DROP TRIGGER IF EXISTS sync_customer_search_delete ON "customer";

-- Supplier triggers
DROP TRIGGER IF EXISTS sync_supplier_search_insert ON "supplier";
DROP TRIGGER IF EXISTS sync_supplier_search_update ON "supplier";
DROP TRIGGER IF EXISTS sync_supplier_search_delete ON "supplier";

-- Item triggers
DROP TRIGGER IF EXISTS sync_item_search_insert ON "item";
DROP TRIGGER IF EXISTS sync_item_search_update ON "item";
DROP TRIGGER IF EXISTS sync_item_search_delete ON "item";

-- Job triggers
DROP TRIGGER IF EXISTS sync_job_search_insert ON "job";
DROP TRIGGER IF EXISTS sync_job_search_update ON "job";
DROP TRIGGER IF EXISTS sync_job_search_delete ON "job";

-- Purchase Order triggers
DROP TRIGGER IF EXISTS sync_purchase_order_search_insert ON "purchaseOrder";
DROP TRIGGER IF EXISTS sync_purchase_order_search_update ON "purchaseOrder";
DROP TRIGGER IF EXISTS sync_purchase_order_search_delete ON "purchaseOrder";

-- Sales Invoice triggers
DROP TRIGGER IF EXISTS sync_sales_invoice_search_insert ON "salesInvoice";
DROP TRIGGER IF EXISTS sync_sales_invoice_search_update ON "salesInvoice";
DROP TRIGGER IF EXISTS sync_sales_invoice_search_delete ON "salesInvoice";

-- Purchase Invoice triggers
DROP TRIGGER IF EXISTS sync_purchase_invoice_search_insert ON "purchaseInvoice";
DROP TRIGGER IF EXISTS sync_purchase_invoice_search_update ON "purchaseInvoice";
DROP TRIGGER IF EXISTS sync_purchase_invoice_search_delete ON "purchaseInvoice";

-- Non-Conformance triggers
DROP TRIGGER IF EXISTS sync_non_conformance_search_insert ON "nonConformance";
DROP TRIGGER IF EXISTS sync_non_conformance_search_update ON "nonConformance";
DROP TRIGGER IF EXISTS sync_non_conformance_search_delete ON "nonConformance";

-- Gauge triggers
DROP TRIGGER IF EXISTS sync_gauge_search_insert ON "gauge";
DROP TRIGGER IF EXISTS sync_gauge_search_update ON "gauge";
DROP TRIGGER IF EXISTS sync_gauge_search_delete ON "gauge";

-- Quote triggers
DROP TRIGGER IF EXISTS sync_quote_search_insert ON "quote";
DROP TRIGGER IF EXISTS sync_quote_search_update ON "quote";
DROP TRIGGER IF EXISTS sync_quote_search_delete ON "quote";

-- Sales RFQ triggers
DROP TRIGGER IF EXISTS sync_sales_rfq_search_insert ON "salesRfq";
DROP TRIGGER IF EXISTS sync_sales_rfq_search_update ON "salesRfq";
DROP TRIGGER IF EXISTS sync_sales_rfq_search_delete ON "salesRfq";

-- Sales Order triggers
DROP TRIGGER IF EXISTS sync_sales_order_search_insert ON "salesOrder";
DROP TRIGGER IF EXISTS sync_sales_order_search_update ON "salesOrder";
DROP TRIGGER IF EXISTS sync_sales_order_search_delete ON "salesOrder";

-- Supplier Quote triggers
DROP TRIGGER IF EXISTS sync_supplier_quote_search_insert ON "supplierQuote";
DROP TRIGGER IF EXISTS sync_supplier_quote_search_update ON "supplierQuote";
DROP TRIGGER IF EXISTS sync_supplier_quote_search_delete ON "supplierQuote";


-- =============================================================================
-- PART 4: Attach Async Event Triggers to All Search Tables
-- =============================================================================

-- These tables will now use the event system's async batch triggers
-- Note: attach_event_trigger creates AFTER INSERT/UPDATE/DELETE statement-level triggers

SELECT attach_event_trigger('employee', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('customer', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('supplier', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('item', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('job', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('purchaseOrder', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('salesInvoice', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('purchaseInvoice', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('nonConformance', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('gauge', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('quote', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('salesRfq', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('salesOrder', ARRAY[]::TEXT[]);
SELECT attach_event_trigger('supplierQuote', ARRAY[]::TEXT[]);


-- =============================================================================
-- PART 5: Create Search Subscriptions for All Existing Companies
-- =============================================================================

-- Helper function to create search subscriptions for a company
CREATE OR REPLACE FUNCTION create_search_subscriptions_for_company(p_company_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'employee', 'customer', 'supplier', 'item', 'job', 
    'purchaseOrder', 'salesInvoice', 'purchaseInvoice', 
    'nonConformance', 'gauge', 'quote', 'salesRfq', 
    'salesOrder', 'supplierQuote'
  ];
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    INSERT INTO "eventSystemSubscription" (
      "name", 
      "table", 
      "companyId", 
      "operations", 
      "handlerType", 
      "config", 
      "filter", 
      "active"
    )
    VALUES (
      'search-index-' || v_table,
      v_table,
      p_company_id,
      ARRAY['INSERT', 'UPDATE', 'DELETE'],
      'SEARCH',
      '{}'::jsonb,
      '{}'::jsonb,
      TRUE
    )
    ON CONFLICT ON CONSTRAINT "unique_subscription_name_per_company" 
    DO UPDATE SET
      "operations" = EXCLUDED."operations",
      "handlerType" = EXCLUDED."handlerType",
      "active" = EXCLUDED."active";
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- Create subscriptions for all existing companies
DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN SELECT id FROM "company" LOOP
    PERFORM create_search_subscriptions_for_company(company_record.id);
  END LOOP;
END $$;


-- =============================================================================
-- PART 6: Update company creation trigger to also create search subscriptions
-- =============================================================================

-- Modify the existing on_company_created_search_index function to also create subscriptions
CREATE OR REPLACE FUNCTION on_company_created_search_index()
RETURNS TRIGGER AS $$
BEGIN
  -- Create the search index table
  PERFORM create_company_search_index(NEW.id);
  
  -- Create search subscriptions for the event system
  PERFORM create_search_subscriptions_for_company(NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- PART 7: RPC Functions for Event System Subscription Management
-- =============================================================================

-- Create or update an event system subscription
CREATE OR REPLACE FUNCTION create_event_system_subscription(
  p_name TEXT,
  p_table TEXT,
  p_company_id TEXT,
  p_operations TEXT[],
  p_handler_type TEXT,
  p_config JSONB DEFAULT '{}',
  p_filter JSONB DEFAULT '{}',
  p_active BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (id TEXT, name TEXT, "handlerType" TEXT, "table" TEXT) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO "eventSystemSubscription" (
    "name", "table", "companyId", "operations", 
    "handlerType", "config", "filter", "active"
  )
  VALUES (
    p_name, p_table, p_company_id, p_operations,
    p_handler_type, p_config, p_filter, p_active
  )
  ON CONFLICT ON CONSTRAINT "unique_subscription_name_per_company" 
  DO UPDATE SET
    "operations" = EXCLUDED."operations",
    "filter" = EXCLUDED."filter",
    "handlerType" = EXCLUDED."handlerType",
    "config" = EXCLUDED."config",
    "active" = EXCLUDED."active"
  RETURNING 
    "eventSystemSubscription"."id", 
    "eventSystemSubscription"."name", 
    "eventSystemSubscription"."handlerType", 
    "eventSystemSubscription"."table";
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Delete an event system subscription by ID
CREATE OR REPLACE FUNCTION delete_event_system_subscription(
  p_subscription_id TEXT
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM "eventSystemSubscription" WHERE "id" = p_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Delete event system subscriptions by name and company
CREATE OR REPLACE FUNCTION delete_event_system_subscriptions_by_name(
  p_company_id TEXT,
  p_name TEXT
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM "eventSystemSubscription" 
  WHERE "companyId" = p_company_id AND "name" = p_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- PART 8: Drop old sync functions (keeping them for now as they may be useful)
-- =============================================================================

-- Note: We're keeping the old sync_*_to_search_index functions for now
-- They could be useful for manual re-indexing or debugging
-- If you want to drop them, uncomment the following:

-- DROP FUNCTION IF EXISTS sync_employee_to_search_index();
-- DROP FUNCTION IF EXISTS sync_customer_to_search_index();
-- DROP FUNCTION IF EXISTS sync_supplier_to_search_index();
-- DROP FUNCTION IF EXISTS sync_item_to_search_index();
-- DROP FUNCTION IF EXISTS sync_job_to_search_index();
-- DROP FUNCTION IF EXISTS sync_purchase_order_to_search_index();
-- DROP FUNCTION IF EXISTS sync_sales_invoice_to_search_index();
-- DROP FUNCTION IF EXISTS sync_purchase_invoice_to_search_index();
-- DROP FUNCTION IF EXISTS sync_non_conformance_to_search_index();
-- DROP FUNCTION IF EXISTS sync_gauge_to_search_index();
-- DROP FUNCTION IF EXISTS sync_quote_to_search_index();
-- DROP FUNCTION IF EXISTS sync_sales_rfq_to_search_index();
-- DROP FUNCTION IF EXISTS sync_sales_order_to_search_index();
-- DROP FUNCTION IF EXISTS sync_supplier_quote_to_search_index();
