# Event System Workflow

This workflow describes how to use Carbon's Event System to create reactive workflows triggered by database changes.

## Prerequisites

- Understand the event system architecture (see `llm/cache/event-system.md`)
- Have access to the Supabase client (`getCarbonServiceRole()`)
- Know which table you want to watch and what handler type to use

## Use Cases

| Use Case               | Handler Type | Example                                   |
| ---------------------- | ------------ | ----------------------------------------- |
| Notify external system | `WEBHOOK`    | Send Slack message when order created     |
| Sync to accounting     | `SYNC`       | Push new customer to Xero                 |
| Internal automation    | `WORKFLOW`   | Auto-assign tasks when job status changes |
| Update search index    | `SEARCH`     | Re-index customer after update            |

---

## Workflow A: Create a Webhook Subscription

### Step 1: Ensure Event Trigger is Attached to Table

Check if the table already has an event trigger:

```sql
SELECT * FROM "eventSystemTrigger" WHERE "table" = 'yourTable';
```

If not attached, create a migration to attach it:

```sql
SELECT attach_event_trigger('yourTable', ARRAY[]::TEXT[]);
```

### Step 2: Create the Subscription

```typescript
import { getCarbonServiceRole } from "@carbon/auth";
import { createEventSystemSubscription } from "@carbon/database/event";

const client = getCarbonServiceRole();

const subscription = await createEventSystemSubscription(client, {
  name: "my-webhook-subscription", // Unique per company
  table: "salesOrder", // Table to watch
  companyId: companyId, // Your company ID
  operations: ["INSERT", "UPDATE"], // Which operations to trigger on
  type: "WEBHOOK",
  config: {
    url: "https://your-webhook-endpoint.com/webhook",
    headers: {
      Authorization: "Bearer your-token",
      "Content-Type": "application/json",
    },
  },
  filter: { status: "confirmed" }, // Optional: only trigger for specific rows
  active: true,
});

console.log("Created subscription:", subscription.id);
```

### Step 3: Handle the Webhook

Your endpoint will receive POST requests with this payload:

```json
{
  "table": "salesOrder",
  "operation": "INSERT",
  "recordId": "so_abc123",
  "new": {
    /* full row data */
  },
  "old": null,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## Workflow B: Create a SYNC Subscription (Accounting)

### Step 1: Ensure Accounting Integration is Configured

The company must have an active accounting integration (Xero, QuickBooks).

### Step 2: Create the Subscription

```typescript
const subscription = await createEventSystemSubscription(client, {
  name: "sync-customers-to-xero",
  table: "customer",
  companyId: companyId,
  operations: ["INSERT", "UPDATE"],
  type: "SYNC",
  config: {
    provider: "xero", // or "quickbooks"
  },
  active: true,
});
```

### Step 3: The sync handler will automatically:

1. Fetch the full customer record
2. Transform it to accounting provider format
3. Push to the external system
4. Track sync status in `externalIntegrationMapping`

---

## Workflow C: Add a New Handler Type

### Step 1: Update the Handler Type Enum

In `packages/database/src/event.ts`:

```typescript
const HandlerTypeSchema = z.enum([
  "WEBHOOK",
  "WORKFLOW",
  "SYNC",
  "SEARCH",
  "YOUR_NEW_TYPE",
]);
```

### Step 2: Update the Database Constraint

Create a migration:

```sql
ALTER TABLE "eventSystemSubscription"
DROP CONSTRAINT IF EXISTS "eventSystemSubscription_handlerType_check";

ALTER TABLE "eventSystemSubscription"
ADD CONSTRAINT "eventSystemSubscription_handlerType_check"
CHECK ("handlerType" IN ('WEBHOOK', 'WORKFLOW', 'SYNC', 'SEARCH', 'YOUR_NEW_TYPE'));
```

### Step 3: Create the Handler Task

Create `packages/jobs/trigger/event/your-handler.ts`:

```typescript
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";

const YourPayloadSchema = z.object({
  records: z.array(
    z.object({
      event: z.object({
        table: z.string(),
        operation: z.enum(["INSERT", "UPDATE", "DELETE"]),
        recordId: z.string(),
        new: z.record(z.any()).nullable(),
        old: z.record(z.any()).nullable(),
        timestamp: z.string(),
      }),
      companyId: z.string(),
      handlerConfig: z.record(z.any()),
    })
  ),
});

export const yourHandlerTask = task({
  id: "event-handler-your-type",
  retry: {
    maxAttempts: 3,
    factor: 2,
    randomize: true,
  },
  run: async (input: unknown) => {
    const payload = YourPayloadSchema.parse(input);

    logger.info(`Processing ${payload.records.length} events`);

    for (const record of payload.records) {
      // Your handler logic here
      logger.info(`Processing ${record.event.table} ${record.event.operation}`);
    }

    return { processed: payload.records.length };
  },
});
```

### Step 4: Update the Queue Router

In `packages/jobs/trigger/event/queue.ts`:

```typescript
import { yourHandlerTask } from "./your-handler.ts";

// Add to grouped types
const grouped: Record<HandlerType, QueueJob[]> = {
  WEBHOOK: [],
  WORKFLOW: [],
  SYNC: [],
  SEARCH: [],
  YOUR_NEW_TYPE: [],  // Add this
};

// Add handler in the all() block
async yourNewType() {
  let queue: number[] = [];

  if (grouped.YOUR_NEW_TYPE.length === 0) return queue;

  const records = grouped.YOUR_NEW_TYPE.map((job) => {
    queue.push(job.msg_id);
    return {
      event: job.message.event,
      companyId: job.message.companyId,
      handlerConfig: job.message.handlerConfig,
    };
  });

  await yourHandlerTask.trigger({ records });

  return queue;
},

// Include in total
total = total.concat(webhooks, workflows, syncs, searches, yourNewType);
```

---

## Workflow D: Attach Event Triggers to a New Table

### Step 1: Create Migration

```sql
-- Attach async event trigger (no sync interceptors)
SELECT attach_event_trigger('yourNewTable', ARRAY[]::TEXT[]);

-- OR with sync interceptors (functions run synchronously before the operation)
SELECT attach_event_trigger('yourNewTable', ARRAY['validate_before_insert']::TEXT[]);
```

### Step 2: Create Subscriptions for Existing Companies (if needed)

```sql
-- Example: Create search subscriptions for all companies
DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN SELECT id FROM "company" LOOP
    INSERT INTO "eventSystemSubscription" (
      "name", "table", "companyId", "operations",
      "handlerType", "config", "filter", "active"
    )
    VALUES (
      'search-index-yourNewTable',
      'yourNewTable',
      company_record.id,
      ARRAY['INSERT', 'UPDATE', 'DELETE'],
      'SEARCH',
      '{}'::jsonb,
      '{}'::jsonb,
      TRUE
    )
    ON CONFLICT ON CONSTRAINT "unique_subscription_name_per_company" DO NOTHING;
  END LOOP;
END $$;
```

---

## Workflow E: Delete a Subscription

### By ID

```typescript
import { deleteEventSystemSubscription } from "@carbon/database/event";

await deleteEventSystemSubscription(client, subscriptionId);
```

### By Name (for a company)

```typescript
import { deleteEventSystemSubscriptionsByName } from "@carbon/database/event";

await deleteEventSystemSubscriptionsByName(
  client,
  companyId,
  "my-webhook-subscription"
);
```

---

## Debugging

### Check if Subscription Exists

```sql
SELECT * FROM "eventSystemSubscription"
WHERE "companyId" = 'your-company-id'
  AND "table" = 'yourTable'
  AND "active" = TRUE;
```

### Check PGMQ Queue

```sql
-- Queue metrics
SELECT * FROM pgmq.metrics('event_system');

-- Peek at pending messages
SELECT * FROM pgmq.read('event_system', 30, 10);
```

### Check Trigger.dev Dashboard

1. Go to Trigger.dev dashboard
2. Look for `event-queue` task runs (cron)
3. Check downstream handler tasks (`event-handler-webhook`, etc.)
4. Review logs and error messages

### Test a Subscription Manually

Insert/update a row in the watched table and verify:

1. Message appears in PGMQ queue (within same transaction)
2. `event-queue` picks it up (within 1 minute)
3. Handler task executes successfully

---

## Common Pitfalls

1. **Forgetting to attach trigger**: Table must have event trigger attached via `attach_event_trigger()`
2. **Missing companyId**: Subscriptions are company-scoped; events without companyId are skipped
3. **Wrong operation array**: Use `["INSERT"]` not `["insert"]` (uppercase)
4. **Filter not matching**: JSONB filter uses `@>` containment operator
5. **Handler not deployed**: Ensure Trigger.dev tasks are deployed after code changes

---

## Checklist

- [ ] Event trigger attached to table (check `eventSystemTrigger` view)
- [ ] Subscription created with correct `companyId`
- [ ] Handler type matches your use case
- [ ] Config contains required fields for handler type
- [ ] Filter (if used) matches expected row structure
- [ ] Handler task is deployed to Trigger.dev
- [ ] Tested with a real database operation
