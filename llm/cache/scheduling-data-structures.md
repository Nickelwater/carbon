# Scheduling Data Structures

## Overview

This document describes the data structures returned by scheduling-related database functions, particularly focusing on customer and part number fields.

## getActiveJobOperationsByLocation

### Function Signature
```typescript
getActiveJobOperationsByLocation(
  client: SupabaseClient<Database>,
  locationId: string,
  workCenterIds: string[] = []
)
```

### Database Function
Located in: `/packages/database/supabase/migrations/20241024111311_active-job-operations.sql`

### Return Fields

The function returns a table with the following fields:

#### Operation Fields
- `id` TEXT - Operation ID
- `operationOrder` DOUBLE PRECISION - Order of operation in sequence
- `priority` DOUBLE PRECISION - Operation priority
- `processId` TEXT - Process ID
- `workCenterId` TEXT - Work center ID
- `description` TEXT - Operation description
- `setupTime` NUMERIC(10,2) - Setup time
- `setupUnit` factor - Setup time unit
- `laborTime` NUMERIC(10,2) - Labor time
- `laborUnit` factor - Labor time unit
- `machineTime` NUMERIC(10,2) - Machine time
- `machineUnit` factor - Machine time unit
- `operationOrderType` methodOperationOrder - Order type
- `operationStatus` jobOperationStatus - Operation status
- `operationQuantity` NUMERIC(10,2) - Operation quantity
- `quantityComplete` NUMERIC(10,2) - Quantity completed
- `quantityScrapped` NUMERIC(10,2) - Quantity scrapped

#### Job Fields
- `jobId` TEXT - Job ID (internal)
- `jobReadableId` TEXT - Job readable ID (display format)
- `jobStatus` jobStatus - Job status
- `jobDueDate` DATE - Job due date
- `jobDeadlineType` deadlineType - Job deadline type
- `jobCustomerId` TEXT - **Customer ID** (reference to customer table)

#### Item Fields
- `parentMaterialId` TEXT - Parent material ID (null for top-level items)
- `itemReadableId` TEXT - **Part Number** (item's readable ID)

### Additional Fields (from usage in operations.tsx)

When used in the UI layer, the data is enriched with:
- `salesOrderReadableId` - From sales order join
- `salesOrderId` - Sales order ID
- `salesOrderLineId` - Sales order line ID
- `itemDescription` - Item description
- `thumbnailPath` - Thumbnail path

### Customer Name Resolution

The customer name is **NOT** directly returned by this function. To get the customer name, you must:
1. Use the `jobCustomerId` field
2. Join with the `customer` table using `customer.id = jobCustomerId`
3. Access the `customer.name` field

**Note:** The customer name field in the customer table is `name` (not `customerName`).

## getJobsByDateRange

### Function Signature
```typescript
getJobsByDateRange(
  client: SupabaseClient<Database>,
  locationId: string,
  startDate: string,
  endDate: string
)
```

### Database Function
Located in: `/packages/database/supabase/migrations/20251122173055_schedule-jobs.sql`

### Return Fields

The function returns a table with the following fields:

#### Job Fields
- `id` TEXT - Job ID (internal)
- `jobId` TEXT - Job readable ID (display format)
- `status` jobStatus - Job status
- `dueDate` DATE - Job due date
- `completedDate` TIMESTAMP WITH TIME ZONE - Completion date
- `deadlineType` deadlineType - Deadline type
- `quantity` NUMERIC - Job quantity
- `quantityComplete` NUMERIC - Quantity completed
- `quantityShipped` NUMERIC - Quantity shipped
- `priority` DOUBLE PRECISION - Job priority
- `assignee` TEXT - Assigned employee ID
- `tags` TEXT[] - Job tags array

#### Customer Fields
- `customerId` TEXT - Customer ID
- `customerName` TEXT - **Customer Name** (joined from customer table)

#### Sales Order Fields
- `salesOrderReadableId` TEXT - Sales order readable ID
- `salesOrderId` TEXT - Sales order ID (internal)
- `salesOrderLineId` TEXT - Sales order line ID

#### Item Fields
- `itemId` TEXT - Item ID
- `itemReadableId` TEXT - **Part Number** (item's readable ID)
- `itemDescription` TEXT - Item description/name

#### Media Fields
- `thumbnailPath` TEXT - Thumbnail path (from model upload or item)

#### Operation Statistics
- `operationCount` INTEGER - Total number of operations for this job
- `completedOperationCount` INTEGER - Number of completed operations

### Customer Name Resolution

This function **DOES** return the customer name directly via a LEFT JOIN:
```sql
LEFT JOIN "customer" c ON c."id" = rj."customerId"
```
The `customerName` field contains `c.name` from the customer table.

## Key Differences

### Field Naming for Customer
- **getActiveJobOperationsByLocation**: Returns `jobCustomerId` (ID only, no name)
- **getJobsByDateRange**: Returns both `customerId` AND `customerName`

### Field Naming for Part Number
Both functions use `itemReadableId` for the part number:
- `itemReadableId` - This is the item's readable identifier with revision

### Customer Table Schema
- Customer ID field: `id`
- Customer name field: `name` (not `customerName`)

## Usage Examples

### From operations.tsx (getActiveJobOperationsByLocation)
```typescript
const operations = await getActiveJobOperationsByLocation(
  client,
  locationId,
  selectedWorkCenterIds
);

// Access fields:
operations.data?.forEach((op) => {
  const customerId = op.jobCustomerId;  // Customer ID only
  const partNumber = op.itemReadableId; // Part number
  const jobNumber = op.jobReadableId;   // Job number
});
```

### From dates.tsx (getJobsByDateRange)
```typescript
const jobs = await getJobsByDateRange(
  client,
  locationId,
  startDate,
  endDate
);

// Access fields:
jobs.data?.forEach((job) => {
  const customerId = job.customerId;           // Customer ID
  const customerName = job.customerName;       // Customer name (directly available!)
  const partNumber = job.itemReadableId;       // Part number
  const jobNumber = job.jobId;                 // Job number
  const partDescription = job.itemDescription; // Part description
});
```

## Summary

| Field Type | getActiveJobOperationsByLocation | getJobsByDateRange |
|-----------|----------------------------------|-------------------|
| Customer ID | `jobCustomerId` | `customerId` |
| Customer Name | Not included (must join) | `customerName` ✓ |
| Part Number | `itemReadableId` | `itemReadableId` |
| Part Description | Not included | `itemDescription` ✓ |
| Job Number | `jobReadableId` | `jobId` |
