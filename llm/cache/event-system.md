# Event System

## Overview

The Event System is Carbon's async event processing infrastructure built on PostgreSQL triggers, PGMQ (PostgreSQL Message Queue), and Trigger.dev. It enables reactive workflows triggered by database changes without blocking write operations.

## Architecture

```
Database Change → Statement-Level Trigger → dispatch_event_batch() → PGMQ Queue
                                                                         ↓
                                    event-queue (cron, every 1 min) → reads batch from PGMQ
                                                                         ↓
                                    Routes to handler tasks:
                                    - event-handler-webhook
                                    - event-handler-workflow
                                    - event-handler-sync
                                    - event-handler-search
```

## Key Components

### 1. Database Tables

#### `eventSystemSubscription`

Stores subscription configurations that determine which events trigger which handlers.

```sql
CREATE TABLE "eventSystemSubscription" (
  "id" TEXT NOT NULL DEFAULT id(),
  "name" TEXT NOT NULL,              -- Unique name per company
  "table" TEXT NOT NULL,             -- Table to watch (e.g., 'customer')
  "companyId" TEXT NOT NULL,         -- Multi-tenant isolation
  "operations" TEXT[] NOT NULL,      -- ['INSERT', 'UPDATE', 'DELETE']
  "handlerType" TEXT NOT NULL,       -- 'WEBHOOK' | 'WORKFLOW' | 'SYNC' | 'SEARCH'
  "config" JSONB DEFAULT '{}',       -- Handler-specific config (URL, workflowId, etc.)
  "filter" JSONB DEFAULT '{}',       -- Row-level filtering (e.g., { "status": "paid" })
  "active" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "unique_subscription_name_per_company" UNIQUE ("name", "companyId")
);
```

### 2. Trigger Functions

#### `dispatch_event_batch()` (Statement-Level, AFTER)

- Fires once per statement (not per row)
- Checks if any active subscriptions exist for the table/company/operation
- If subscriptions exist, batches all affected rows and sends to PGMQ
- Uses transition tables (`batched_new`, `batched_old`) for efficient batch access

#### `dispatch_event_interceptors()` (Row-Level, BEFORE)

- For synchronous interceptors that must run before the operation completes
- Executes a list of functions passed as trigger arguments
- Used for data integrity requirements (not for async processing)

#### `attach_event_trigger(table_name, sync_functions[])`

Helper function to attach event triggers to a table:

```sql
SELECT attach_event_trigger('customer', ARRAY[]::TEXT[]);  -- Async only
SELECT attach_event_trigger('job', ARRAY['validate_job_status']::TEXT[]);  -- With sync interceptor
```

### 3. PGMQ Queue

Queue name: `event_system`

Message format:

```typescript
{
  subscriptionId: string;
  triggerType: "ROW" | "STATEMENT";
  handlerType: "WEBHOOK" | "WORKFLOW" | "SYNC" | "SEARCH";
  handlerConfig: Record<string, any>;
  companyId: string;
  event: {
    table: string;
    operation: "INSERT" | "UPDATE" | "DELETE";
    recordId: string;
    new: Record<string, any> | null;
    old: Record<string, any> | null;
    timestamp: string;
  }
}
```

### 4. Trigger.dev Tasks

#### `event-queue` (Cron Task)

- **Location**: `packages/jobs/trigger/event/queue.ts`
- **Schedule**: Every 1 minute (`* * * * *`)
- **Purpose**: Polls PGMQ, routes events to appropriate handler tasks

#### `event-handler-webhook`

- **Location**: `packages/jobs/trigger/event/webhook.ts`
- **Purpose**: Sends HTTP POST to configured URL
- **Config**: `{ url: string, headers?: Record<string, string> }`

#### `event-handler-workflow`

- **Location**: `packages/jobs/trigger/event/workflow.ts`
- **Purpose**: Dispatches to internal workflow engine
- **Config**: `{ workflowId: string }`

#### `event-handler-sync`

- **Location**: `packages/jobs/trigger/event/sync.ts`
- **Purpose**: Syncs data to external accounting systems (Xero, etc.)
- **Config**: `{ provider: "xero" | "quickbooks" }`

#### `event-handler-search`

- **Location**: `packages/jobs/trigger/event/search.ts`
- **Purpose**: Updates company-specific search indexes asynchronously
- **Config**: `{}` (no config needed)

## Handler Types

| Handler    | Use Case                             | Config             |
| ---------- | ------------------------------------ | ------------------ |
| `WEBHOOK`  | External integrations, notifications | `{ url, headers }` |
| `WORKFLOW` | Internal automation workflows        | `{ workflowId }`   |
| `SYNC`     | Accounting system sync (Xero, QB)    | `{ provider }`     |
| `SEARCH`   | Search index updates                 | `{}`               |

## TypeScript API

### Location

`packages/database/src/event.ts`

### Creating Subscriptions

```typescript
import { getCarbonServiceRole } from "@carbon/auth";
import { createEventSystemSubscription } from "@carbon/database/event";

const client = getCarbonServiceRole();

// Create a webhook subscription
const subscription = await createEventSystemSubscription(client, {
  name: "order-notifications",
  table: "salesOrder",
  companyId: "company-123",
  operations: ["INSERT", "UPDATE"],
  type: "WEBHOOK",
  config: {
    url: "https://example.com/webhook",
    headers: { "X-API-Key": "secret" },
  },
  filter: { status: "confirmed" }, // Only trigger for confirmed orders
  active: true,
});
```

### Deleting Subscriptions

```typescript
import {
  deleteEventSystemSubscription,
  deleteEventSystemSubscriptionsByName,
} from "@carbon/database/event";

// Delete by ID
await deleteEventSystemSubscription(client, "subscription-id");

// Delete by name (for a specific company)
await deleteEventSystemSubscriptionsByName(
  client,
  "company-123",
  "order-notifications"
);
```

## RPC Functions

The event system provides these PostgreSQL RPC functions:

```sql
-- Create/update subscription
create_event_system_subscription(
  p_name, p_table, p_company_id, p_operations,
  p_handler_type, p_config, p_filter, p_active
) RETURNS TABLE (id, name, handlerType, table)

-- Delete by ID
delete_event_system_subscription(p_subscription_id) RETURNS VOID

-- Delete by name + company
delete_event_system_subscriptions_by_name(p_company_id, p_name) RETURNS VOID

-- Search index helpers
delete_from_search_index(p_company_id, p_entity_type, p_entity_id) RETURNS VOID
upsert_to_search_index(p_company_id, p_entity_type, p_entity_id, ...) RETURNS VOID
```

## Tables with Event Triggers Attached

The following tables have async event triggers attached (as of the search migration):

- `employee`
- `customer`
- `supplier`
- `item`
- `job`
- `purchaseOrder`
- `salesInvoice`
- `purchaseInvoice`
- `nonConformance`
- `gauge`
- `quote`
- `salesRfq`
- `salesOrder`
- `supplierQuote`

## Performance Considerations

### Benefits

- **Non-blocking writes**: Database operations complete immediately
- **Batch processing**: Statement-level triggers handle bulk operations efficiently
- **Automatic retries**: Trigger.dev handles failures with exponential backoff
- **Eventual consistency**: Acceptable for search, notifications, external syncs

### Costs

- **Cron cost**: ~$1.41/month for idle 1-minute cron
- **Processing cost**: Varies based on event volume and handler complexity
- **Latency**: Up to 1 minute delay for async processing

### When NOT to Use

- Data integrity requirements (use sync interceptors instead)
- Real-time requirements (< 1 second latency)
- Transactional consistency requirements

## Debugging

### Check Subscriptions

```sql
SELECT * FROM "eventSystemSubscription"
WHERE "companyId" = 'your-company-id' AND "active" = TRUE;
```

### Check Queue Status

```sql
SELECT * FROM pgmq.metrics('event_system');
SELECT * FROM pgmq.read('event_system', 30, 10);  -- Peek at messages
```

### View Trigger Status

```sql
SELECT * FROM "eventSystemTrigger";  -- View showing attached triggers
```

## Migration History

- `20260116215036_event_system_impl.sql` - Initial event system implementation
- `20260204070000_remove-event-system-batch-size.sql` - Removed unused batchSize column
- `20260204080000_async-search-triggers.sql` - Migrated search to async, added SEARCH handler

## Related Documentation

- [Accounting Sync Handlers](./accounting-sync-handlers.md) - SYNC handler details
- [Database Migration Patterns](./database-migration-patterns.md) - Migration conventions
