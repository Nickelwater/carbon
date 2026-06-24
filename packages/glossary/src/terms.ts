/**
 * The Carbon glossary — one source of truth for term definitions, used by both
 * the docs site's inline <Term> popovers and the ERP/MES field-help affordance.
 *
 * Keys are slugs (lowercase, hyphenated). Author usage in docs MDX:
 *   <Term>purchase to order</Term>          — slugifies the text to find the entry
 *   <Term id="purchase-to-order">bought</Term> — explicit key when display text differs
 *
 * `term` and `definition` are Lingui `msg` descriptors so the extractor picks
 * them up and ERP/MES translate them at render via `i18n._()`. Consumers
 * without a Lingui runtime (docs Next.js) read the source English off
 * `descriptor.message` — see `getTermText` / `getDefinitionText` in `helpers.ts`.
 *
 * Definitions are deliberately short: one crisp, grounded sentence to identify the
 * term — the full story lives behind the "Learn more" link. `href` (optional) points
 * that link at the exact section that explains the term, not just the page top; omit
 * it for terms with no home yet (popover still shows the definition). Anchors are
 * grounded against real headings in docs/content — fix them if a heading is renamed.
 * Enum values verified:
 *   methodType            → "Make to Order" | "Purchase to Order" | "Pull from Inventory"
 *                           (packages/database/.../20260321143847_method-type-migration.sql)
 *   itemReplenishmentSystem → "Buy" | "Make" | "Buy and Make"
 *                           (packages/database/.../20230330024716_parts.sql)
 */
import { msg } from "@lingui/core/macro";
import type { GlossaryEntry } from "./types";

export const terms = {
  oem: {
    term: msg`OEM (original equipment manufacturer)`,
    definition: msg`A company that designs and builds its own finished products end to end (here, the shop building humanoid robots) rather than making parts to another company's specification.`
  },
  "method-type": {
    term: msg`Method type`,
    definition: msg`How a part gets into its parent, set per line: Make to Order, Purchase to Order, or Pull from Inventory.`,
    href: "/docs/reference/methods#method-type"
  },
  "make-to-order": {
    term: msg`Make to Order`,
    definition: msg`The part is manufactured as its own job when the parent that needs it is built.`,
    href: "/docs/reference/methods#method-type"
  },
  "purchase-to-order": {
    term: msg`Purchase to Order`,
    definition: msg`The material is purchased from a supplier for that specific order, rather than made or pulled from stock.`,
    href: "/docs/reference/methods#method-type"
  },
  "pull-from-inventory": {
    term: msg`Pull from Inventory`,
    definition: msg`The part is taken from existing stock when its parent is built — no new job or purchase order.`,
    href: "/docs/reference/methods#method-type"
  },
  "replenishment-system": {
    term: msg`Replenishment system`,
    definition: msg`How an item is replenished overall (Buy, Make, or Buy and Make), set per item, unlike the per-line method type.`,
    href: "/docs/reference/methods#method-type-vs-replenishment-system"
  },
  method: {
    term: msg`Method`,
    definition: msg`Carbon's name for a bill of materials: the components plus the operations that make a part.`,
    href: "/docs/reference/methods"
  },
  bom: {
    term: msg`Bill of materials`,
    definition: msg`Called a method in Carbon — the components plus operations that produce a part.`,
    href: "/docs/reference/methods"
  },
  wip: {
    term: msg`Work in process (WIP)`,
    definition: msg`Not a table but a general-ledger balance: cost accumulates as job materials are issued and clears when the job is received to stock.`,
    href: "/guides/job-costing#wip-isnt-a-table"
  },
  "outside-operation": {
    term: msg`Outside operation`,
    definition: msg`An operation done by an outside supplier rather than an in-house work center, covered by a subcontracting purchase order.`
  },
  subassembly: {
    term: msg`Subassembly`,
    definition: msg`A Make to Order component that gets its own job and routing inside the parent's build.`,
    href: "/docs/reference/methods#kit-or-subassembly"
  },
  kit: {
    term: msg`Kit`,
    definition: msg`A Make to Order component whose parts are issued together into the parent job — no separate build.`,
    href: "/docs/reference/methods#kit-or-subassembly"
  },
  "lead-time": {
    term: msg`Lead time`,
    definition: msg`Days from ordering a part to having it available; planning offsets demand backward by this much.`,
    href: "/docs/reference/reordering#fields"
  },
  "reorder-point": {
    term: msg`Reorder point`,
    definition: msg`The on-hand level that triggers a new replenishment order under the quantity-based policies.`,
    href: "/docs/reference/reordering#policies"
  },
  "reordering-policy": {
    term: msg`Reordering policy`,
    definition: msg`How an item is replenished: Manual Reorder, Demand-Based Reorder, Fixed Reorder Quantity, or Maximum Quantity.`,
    href: "/docs/reference/reordering#policies"
  },

  // ── Production & the floor ──────────────────────────────────────────────
  job: {
    term: msg`Job`,
    definition: msg`Carbon's production order — one job builds a quantity of one item from its own copied method and routing.`,
    href: "/docs/reference/jobs"
  },
  routing: {
    term: msg`Routing`,
    definition: msg`The ordered sequence of operations a job runs through, copied from the method's bill of process.`,
    href: "/docs/reference/routings"
  },
  operation: {
    term: msg`Operation`,
    definition: msg`One step in a job's routing, naming a process and a work center and carrying its own setup, labor, and machine times and rates.`,
    href: "/docs/reference/routings"
  },
  "work-center": {
    term: msg`Work center`,
    definition: msg`Where an operation runs; carries labor and quoting rates, with overhead the difference between them.`,
    href: "/docs/reference/work-centers"
  },
  backflush: {
    term: msg`Backflush`,
    definition: msg`Automatic, prorated consumption of a job's untracked materials when output is reported — tracked materials are issued manually.`,
    href: "/guides/job-costing#issued-or-backflushed"
  },
  "material-issue": {
    term: msg`Issue (material)`,
    definition: msg`Consuming material from inventory into a job, which writes a Consumption entry to the item ledger.`,
    href: "/docs/reference/jobs"
  },
  "get-method": {
    term: msg`Get Method`,
    definition: msg`The action that copies a saved method (its materials, operations, and work instructions) onto a job or quote line.`,
    href: "/docs/reference/methods#get-method"
  },
  scrap: {
    term: msg`Scrap`,
    definition: msg`Units reported as unrecoverable at an operation, with a reason — the alternative to rework.`
  },
  rework: {
    term: msg`Rework`,
    definition: msg`Sending defective units back to an earlier operation to be corrected instead of scrapping them.`
  },

  // ── Sales & purchasing ──────────────────────────────────────────────────
  "sales-order": {
    term: msg`Sales order`,
    definition: msg`A firm customer commitment to deliver; fulfillment status splits across ship and invoice before reaching Completed.`,
    href: "/docs/reference/sales-orders"
  },
  "purchase-order": {
    term: msg`Purchase order`,
    definition: msg`A firm order to a supplier; status moves through receive and invoice before Completed as goods and bills arrive.`,
    href: "/docs/reference/purchase-orders"
  },
  quote: {
    term: msg`Quote`,
    definition: msg`A priced sales quotation; Draft → Sent → Ordered, or ends Lost, Expired, or Cancelled.`,
    href: "/docs/reference/quotes"
  },
  rfq: {
    term: msg`RFQ (request for quote)`,
    definition: msg`A sales RFQ (a customer asks you to quote) or a purchasing RFQ (you ask suppliers); both feed the opportunity thread.`,
    href: "/guides/quote-to-cash#one-opportunity-many-documents"
  },
  opportunity: {
    term: msg`Opportunity`,
    definition: msg`The thread linking a sales RFQ, its quote, and the resulting sales order — a join, not a document with its own status.`,
    href: "/guides/quote-to-cash#one-opportunity-many-documents"
  },
  "quote-to-cash": {
    term: msg`Quote to cash`,
    definition: msg`The end-to-end commercial flow from quoting a customer to collecting payment: RFQ to quote to sales order, then shipment, invoice, and settled payment.`,
    href: "/guides/quote-to-cash"
  },
  "drop-ship": {
    term: msg`Drop-ship`,
    definition: msg`A shipment line sent straight from supplier to customer, bypassing your warehouse — set per line, not on the header.`,
    href: "/docs/reference/sales-orders#line-fields"
  },
  "three-way-match": {
    term: msg`Three-way match`,
    definition: msg`Reconciling a purchase order against what was received and invoiced — implicit in Carbon, via the line quantities and GR/IR balance.`,
    href: "/guides/receive-and-bill#match-and-post"
  },
  "gr-ir": {
    term: msg`GR/IR (goods received, not invoiced)`,
    definition: msg`A clearing account holding the value of goods received but not yet billed; the supplier invoice clears it.`,
    href: "/docs/reference/accounting"
  },

  // ── Inventory, tracking & costing ───────────────────────────────────────
  "tracked-entity": {
    term: msg`Tracked entity`,
    definition: msg`One serial unit or one batch that Carbon follows individually, carrying its own status and attributes such as an expiry date.`,
    href: "/docs/reference/traceability#tracked-entities"
  },
  serial: {
    term: msg`Serial tracking`,
    definition: msg`Each physical unit gets its own tracked entity and unique number — one entity, one unit.`,
    href: "/docs/reference/traceability#tracked-entities"
  },
  batch: {
    term: msg`Batch tracking`,
    definition: msg`A quantity of identical units shares one tracked entity and batch number — one entity, many units.`,
    href: "/docs/reference/traceability#tracked-entities"
  },
  traceability: {
    term: msg`Traceability`,
    definition: msg`The recorded genealogy of tracked entities — which inputs were consumed to produce which outputs, receipt through shipment.`,
    href: "/docs/reference/traceability"
  },
  genealogy: {
    term: msg`Genealogy`,
    definition: msg`The parent-child chain of tracked entities — what a unit was built from and what it became.`,
    href: "/docs/reference/traceability#genealogy"
  },
  "costing-method": {
    term: msg`Costing method`,
    definition: msg`How an item's unit cost is valued: Standard, Average, FIFO, or LIFO. Set per item.`,
    href: "/docs/reference/items#fields"
  },
  cogs: {
    term: msg`Cost of goods sold (COGS)`,
    definition: msg`The inventory cost recognized when a shipment posts, valued by the item's costing method.`,
    href: "/docs/reference/accounting",
    aliases: ["cost-of-goods-sold"]
  },
  "conversion-factor": {
    term: msg`Conversion factor`,
    definition: msg`Converts a supplier's purchase unit to your inventory unit on a PO, receipt, or bill line — buy in cartons of 12, stock in eaches.`,
    href: "/guides/receive-and-bill#buy-by-the-box-stock-by-the-each"
  },
  posting: {
    term: msg`Posting`,
    definition: msg`Committing a receipt, shipment, or invoice: quantities move, journal entries hit the ledger, and status becomes Posted.`,
    href: "/docs/reference/accounting"
  },
  receipt: {
    term: msg`Receipt`,
    definition: msg`The inbound posting document that takes goods into stock (from a PO, transfer, or job output) and creates any tracked entities.`,
    href: "/docs/reference/receipts"
  },
  shipment: {
    term: msg`Shipment`,
    definition: msg`The outbound posting document that takes goods out of stock to a customer, posting COGS as it goes.`,
    href: "/docs/reference/shipments"
  },

  // ── Planning, quality & accounting ──────────────────────────────────────
  "demand-forecast": {
    term: msg`Demand forecast`,
    definition: msg`Expected future demand for an item, bucketed by period, populated by the planning run alongside actual demand.`,
    href: "/docs/reference/planning#what-feeds-it"
  },
  mrp: {
    term: msg`MRP (planning)`,
    definition: msg`Carbon's planning run nets supply against demand and explodes methods, surfacing shortfalls — but it creates no orders itself.`,
    href: "/docs/reference/planning"
  },
  nonconformance: {
    term: msg`Nonconformance (issue)`,
    definition: msg`Carbon's quality issue — a logged deviation or defect with a configurable workflow of investigation and action tasks.`,
    href: "/docs/reference/quality#issues"
  },
  "8d": {
    term: msg`8D`,
    definition: msg`The eight-disciplines quality method, modeled with the nonconformance workflow's tasks rather than hard-coded.`,
    href: "/docs/reference/quality#workflows-and-actions"
  },
  "corrective-action": {
    term: msg`Corrective action`,
    definition: msg`A nonconformance task that fixes a confirmed root cause — as opposed to a preventive or immediate containment action.`,
    href: "/docs/reference/quality#workflows-and-actions"
  },
  "preventive-action": {
    term: msg`Preventive action`,
    definition: msg`A nonconformance task that stops the problem recurring elsewhere — distinct from the corrective fix and containment.`,
    href: "/docs/reference/quality#workflows-and-actions"
  },
  "containment-action": {
    term: msg`Containment action`,
    definition: msg`The immediate nonconformance task that quarantines affected stock or work before the root cause is known.`,
    href: "/docs/reference/quality#workflows-and-actions"
  },
  journal: {
    term: msg`Journal`,
    definition: msg`A posted accounting entry: a header plus balanced debit and credit lines against GL accounts.`,
    href: "/docs/reference/accounting#the-journal"
  },
  "general-ledger": {
    term: msg`General ledger`,
    definition: msg`The book of all posted journal lines, summed by account — written only when the company has accounting enabled.`,
    href: "/docs/reference/accounting"
  },
  "accounting-period": {
    term: msg`Accounting period`,
    definition: msg`A dated window postings fall into (Active or Inactive, not open or closed), opened automatically when needed.`,
    href: "/docs/reference/accounting#periods"
  },

  // ── Cost centers ────────────────────────────────────────────────────────
  "cost-center": {
    term: msg`Cost center`,
    definition: msg`An accounting bucket that groups expenses by department or function so the GL can report spend by group, not just by account.`,
    href: "/docs/reference/accounting"
  },
  "parent-cost-center": {
    term: msg`Parent cost center`,
    definition: msg`Another cost center this one rolls up into, letting you nest a sub-department under its parent for hierarchical cost reporting.`,
    href: "/docs/reference/accounting"
  },
  "cost-center-owner": {
    term: msg`Owner (cost center)`,
    definition: msg`The employee accountable for this cost center — when purchase order approvals are on, they're the approver for spend posted against it.`,
    href: "/docs/reference/accounting"
  },

  // ── Documents & variances ───────────────────────────────────────────────
  "supplier-quote": {
    term: msg`Supplier quote`,
    definition: msg`A supplier's priced response to a purchasing RFQ — one per supplier; Draft → Active when they submit, or Declined.`,
    href: "/guides/rfq-to-po#suppliers-quote-back"
  },
  invoice: {
    term: msg`Invoice`,
    definition: msg`A sales invoice (you bill a customer) or purchase invoice (a supplier bills you); payment is a field, not a separate record.`,
    href: "/docs/reference/invoices"
  },
  "finished-goods": {
    term: msg`Finished goods`,
    definition: msg`A completed job's output, received into inventory at the job's actual accumulated WIP cost.`,
    href: "/guides/job-finish-close#finish-into-inventory"
  },
  "production-variance": {
    term: msg`Production variance`,
    definition: msg`The residual WIP a job has left at close, swept to a Production Variance account — the only variance Carbon books for a job.`,
    href: "/guides/job-finish-close#close-the-job"
  },
  "purchase-price-variance": {
    term: msg`Purchase price variance`,
    definition: msg`The gap between a purchase order's price and the supplier's bill, posted to a variance account when the invoice posts.`,
    href: "/guides/receive-and-bill#match-and-post"
  },

  // ── Fixed assets ────────────────────────────────────────────────────────
  "fixed-asset": {
    term: msg`Fixed asset`,
    definition: msg`An accounting record for a capitalized item you depreciate rather than expense; Draft → Active → Fully Depreciated → Disposed.`,
    href: "/docs/reference/fixed-assets"
  },
  "asset-class": {
    term: msg`Asset class`,
    definition: msg`The category a fixed asset belongs to, carrying the GL accounts every asset of that kind posts to.`,
    href: "/docs/reference/fixed-assets"
  },
  depreciation: {
    term: msg`Depreciation`,
    definition: msg`Writing an asset's value down over its life — a monthly batch you create, review as a draft, then post.`,
    href: "/docs/reference/fixed-assets#depreciating"
  },
  "net-book-value": {
    term: msg`Net book value`,
    definition: msg`An asset's acquisition cost minus accumulated depreciation — what it's still worth on the books, and the figure it's disposed at.`,
    href: "/docs/reference/fixed-assets#selling-vs-disposing"
  },
  "straight-line": {
    term: msg`Straight line`,
    definition: msg`A depreciation method that charges an equal amount each period across the asset's useful life.`,
    href: "/docs/reference/fixed-assets#depreciating"
  },
  "declining-balance": {
    term: msg`Declining balance`,
    definition: msg`A depreciation method that charges a fixed percentage of remaining book value each period — heavier early, lighter later.`,
    href: "/docs/reference/fixed-assets#depreciating"
  },
  "residual-value": {
    term: msg`Residual value`,
    definition: msg`The floor an asset depreciates down to; when net book value reaches it, the asset flips to Fully Depreciated.`,
    href: "/docs/reference/fixed-assets#depreciating"
  },
  macrs: {
    term: msg`MACRS`,
    definition: msg`The US tax depreciation system with IRS property-class tables, run as a separate tax schedule alongside the book schedule.`,
    href: "/docs/reference/fixed-assets#depreciating"
  },
  disposal: {
    term: msg`Disposal`,
    definition: msg`Retiring an asset by write-off instead of sale, booking the remaining net book value as a loss — status becomes Disposed.`,
    href: "/docs/reference/fixed-assets#selling-vs-disposing"
  },

  // ── Inventory ledger ────────────────────────────────────────────────────
  "item-ledger": {
    term: msg`Item ledger`,
    definition: msg`The append-only record of every stock movement; on-hand is the sum of its signed entries and the source of truth.`,
    href: "/docs/reference/inventory#on-hand-is-a-ledger"
  },

  // ── Shelf life ──────────────────────────────────────────────────────────
  "shelf-life": {
    term: msg`Shelf life`,
    definition: msg`When a serial or batch expires, and what happens if used after — a company policy can Warn, Block, or BlockWithOverride.`,
    href: "/docs/reference/shelf-life"
  },
  fefo: {
    term: msg`FEFO (first-expiry-first-out)`,
    definition: msg`Picking offers tracked entities earliest-expiry-first, so the soonest-to-expire stock leaves first by default.`,
    href: "/docs/reference/shelf-life"
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Accounting sweep (plan 02): field-specific entries for the ERP accounting
  // module's input forms. Account-default entries describe the GL posting that
  // each default drives; per-asset / per-line entries describe the field's role
  // on its parent form. Umbrella terms (depreciation, macrs, disposal, posting)
  // remain above for docs <Term> use only — field labels now point at these
  // field-specific slugs instead.
  // ──────────────────────────────────────────────────────────────────────────

  // ── Account defaults (AccountDefaultsForm) ──────────────────────────────
  "account-default-bank-cash": {
    term: msg`Bank — Cash (default)`,
    definition: msg`Default GL account used for cash transactions when no specific bank account is selected.`
  },
  "account-default-bank-local-currency": {
    term: msg`Bank — Local Currency (default)`,
    definition: msg`Default cash account for transactions in your base currency.`
  },
  "account-default-bank-foreign-currency": {
    term: msg`Bank — Foreign Currency (default)`,
    definition: msg`Default cash account for transactions in non-base currencies.`
  },
  "account-default-receivables": {
    term: msg`Receivables (default)`,
    definition: msg`GL account debited when a customer invoice posts; cleared when the customer pays.`
  },
  "account-default-prepayments": {
    term: msg`Prepayments (default)`,
    definition: msg`GL account used when a customer pays before an invoice is issued; cleared when the invoice posts.`
  },
  "account-default-inventory": {
    term: msg`Inventory (default)`,
    definition: msg`Default GL account that holds inventory value; debited on receipt, credited on shipment/issue.`
  },
  "account-default-wip": {
    term: msg`Work in Progress (default)`,
    definition: msg`GL account that holds the value of jobs in production until they post to finished goods.`
  },
  "account-default-inventory-shipped-not-invoiced": {
    term: msg`Inventory Shipped Not Invoiced (default)`,
    definition: msg`Accrual account debited at shipment to recognize the receivable before the sales invoice posts; cleared when the invoice posts.`
  },
  "account-default-asset-acquisition-cost": {
    term: msg`Asset Acquisition Cost (default)`,
    definition: msg`GL account debited when a fixed asset is acquired (purchase or capitalized cost).`
  },
  "account-default-asset-cost-on-disposal": {
    term: msg`Asset Cost on Disposal (default)`,
    definition: msg`GL account credited to remove the asset's original cost when it is disposed.`
  },
  "account-default-accumulated-depreciation": {
    term: msg`Accumulated Depreciation (default)`,
    definition: msg`GL contra-asset account that accumulates depreciation booked against fixed assets.`
  },
  "account-default-accumulated-depreciation-on-disposal": {
    term: msg`Accumulated Depreciation on Disposal (default)`,
    definition: msg`GL account debited to clear accumulated depreciation when an asset is disposed.`
  },
  "account-default-payables": {
    term: msg`Payables (default)`,
    definition: msg`GL account credited when a supplier invoice is posted (AP balance).`
  },
  "account-default-gr-ir": {
    term: msg`GR/IR Clearing (default)`,
    definition: msg`Clearing account between goods receipt and supplier invoice; balances when both have posted.`
  },
  "account-default-sales-tax-payable": {
    term: msg`Sales Tax Payable (default)`,
    definition: msg`GL liability account credited for sales tax collected from customers.`
  },
  "account-default-purchase-tax-payable": {
    term: msg`Purchase Tax Payable (default)`,
    definition: msg`GL account for purchase tax paid to suppliers (or reclaimable).`
  },
  "account-default-reverse-charge-sales-tax": {
    term: msg`Reverse Charge Sales Tax (default)`,
    definition: msg`GL account for tax accrued under reverse-charge rules where the buyer self-assesses.`
  },
  "account-default-deferred-tax-liability": {
    term: msg`Deferred Tax Liability (default)`,
    definition: msg`GL account for tax timing differences (e.g. accelerated tax depreciation vs. book depreciation).`
  },
  "account-default-retained-earnings": {
    term: msg`Retained Earnings (default)`,
    definition: msg`GL equity account where net income closes at fiscal year-end.`
  },
  "account-default-currency-translation": {
    term: msg`Currency Translation (default)`,
    definition: msg`GL equity account (CTA reserve) that holds unrealized FX differences from re-translating foreign-currency balances at period-end; separate from realized FX gain/loss in P&L.`
  },
  "account-default-sales": {
    term: msg`Sales (default)`,
    definition: msg`Default revenue GL account credited when a sales invoice posts.`
  },
  "account-default-sales-discounts": {
    term: msg`Sales Discounts (default)`,
    definition: msg`Contra-revenue GL account for discounts given on customer invoices.`
  },
  "account-default-cogs": {
    term: msg`Cost of Goods Sold (default)`,
    definition: msg`Expense GL account debited when inventory is shipped/issued against a sale.`
  },
  "account-default-indirect-materials-services": {
    term: msg`Indirect Materials & Services (default)`,
    definition: msg`GL expense account for non-inventory purchases (supplies, services).`
  },
  "account-default-labor-machine-absorption": {
    term: msg`Labor & Machine Absorption (default)`,
    definition: msg`GL account credited when labor or machine cost is absorbed into a production job.`
  },
  "account-default-purchase-price-variance": {
    term: msg`Purchase Price Variance (default)`,
    definition: msg`GL account that captures the difference between standard cost and actual purchase cost.`
  },
  "account-default-inventory-adjustment": {
    term: msg`Inventory Adjustment (default)`,
    definition: msg`GL account hit when physical counts differ from system inventory.`
  },
  "account-default-material-usage-variance": {
    term: msg`Material Usage Variance (default)`,
    definition: msg`GL account capturing differences between BOM-expected and actual material consumed.`
  },
  "account-default-labor-machine-variance": {
    term: msg`Labor & Machine Variance (default)`,
    definition: msg`GL account capturing differences between routing-expected and actual labor/machine time.`
  },
  "account-default-overhead-variance": {
    term: msg`Overhead Variance (default)`,
    definition: msg`GL account capturing differences between applied and actual manufacturing overhead.`
  },
  "account-default-lot-size-variance": {
    term: msg`Lot Size Variance (default)`,
    definition: msg`GL account capturing fixed-cost differences when actual lot size differs from planned.`
  },
  "account-default-subcontracting-variance": {
    term: msg`Subcontracting Variance (default)`,
    definition: msg`GL account capturing cost differences on outside-processing operations.`
  },
  "account-default-maintenance-expense": {
    term: msg`Maintenance Expense (default)`,
    definition: msg`Default GL expense account for equipment and facility maintenance.`
  },
  "account-default-depreciation-expense": {
    term: msg`Depreciation Expense (default)`,
    definition: msg`Default GL expense account for periodic depreciation runs.`
  },
  "account-default-gains-and-losses": {
    term: msg`Gains and Losses (default)`,
    definition: msg`GL account where gain or loss is booked on fixed-asset disposal.`
  },
  "account-default-service-charges": {
    term: msg`Service Charges (default)`,
    definition: msg`GL account for bank service charges and similar fees.`
  },
  "account-default-interest": {
    term: msg`Interest (default)`,
    definition: msg`GL account for interest income or expense.`
  },
  "account-default-supplier-payment-discounts": {
    term: msg`Supplier Payment Discounts (default)`,
    definition: msg`GL account where early-payment discounts taken from suppliers are recorded.`
  },
  "account-default-customer-payment-discounts": {
    term: msg`Customer Payment Discounts (default)`,
    definition: msg`GL account where early-payment discounts given to customers are recorded.`
  },
  "account-default-rounding-account": {
    term: msg`Rounding Account (default)`,
    definition: msg`GL account that absorbs sub-cent rounding differences on posting.`
  },
  "account-default-deferred-tax-expense": {
    term: msg`Deferred Tax Expense (default)`,
    definition: msg`Expense side of deferred tax movements (paired with deferred tax liability).`
  },

  // ── Chart of Accounts / Group Accounts ──────────────────────────────────
  "chart-of-account-group": {
    term: msg`Group`,
    definition: msg`The group account this account rolls up to; determines its type, class, and statement placement.`
  },
  "chart-of-account-account-type-inherited": {
    term: msg`Account Type (inherited)`,
    definition: msg`Inherited from the group: where this account appears on financial statements.`
  },
  "chart-of-account-income-balance-inherited": {
    term: msg`Income / Balance (inherited)`,
    definition: msg`Inherited from the group: whether this account closes to retained earnings (income) or carries forward (balance).`
  },
  "chart-of-account-class-inherited": {
    term: msg`Class (inherited)`,
    definition: msg`Inherited from the group: top-level classification (asset, liability, equity, revenue, expense).`
  },
  "group-account-account-type": {
    term: msg`Account Type`,
    definition: msg`The statement bucket all accounts under this group will use.`
  },
  "group-account-class": {
    term: msg`Class`,
    definition: msg`Top-level classification (asset / liability / equity / revenue / expense); set only on root groups, inherited by children.`
  },
  "group-account-income-balance-inherited": {
    term: msg`Income / Balance (inherited)`,
    definition: msg`Inherited from the parent group.`
  },
  "group-account-class-inherited": {
    term: msg`Class (inherited)`,
    definition: msg`Inherited from the parent group.`
  },

  // ── Dimensions ──────────────────────────────────────────────────────────
  "dimension-entity-type": {
    term: msg`Entity Type`,
    definition: msg`What source this dimension pulls its allowed values from (custom list or an existing entity like customer, location, employee).`
  },
  "dimension-values": {
    term: msg`Values`,
    definition: msg`The allowed values users can pick when tagging postings with this dimension.`
  },

  // ── Exchange rates ──────────────────────────────────────────────────────
  "decimal-places-currency": {
    term: msg`Decimal Places`,
    definition: msg`How many fractional digits to keep when rounding amounts in this currency.`
  },
  "exchange-rate": {
    term: msg`Exchange Rate`,
    definition: msg`Units of base currency per one unit of this currency; used to translate amounts on posting.`
  },
  "historical-exchange-rate": {
    term: msg`Historical Rate (equity)`,
    definition: msg`Optional fixed rate used when translating equity balances per IAS 21 (instead of the period rate).`
  },

  // ── Fiscal year ─────────────────────────────────────────────────────────
  "fiscal-year-start": {
    term: msg`Start of Fiscal Year`,
    definition: msg`The month your financial year begins; periods are numbered from this month.`
  },
  "fiscal-year-tax-start": {
    term: msg`Start of Tax Year`,
    definition: msg`The month your tax year begins; may differ from the fiscal year in some jurisdictions.`
  },

  // ── Fixed assets (field-specific replacements for the depreciation / macrs umbrellas) ──
  "fixed-asset-depreciation-method": {
    term: msg`Depreciation Method`,
    definition: msg`The schedule used to spread this asset's cost over its useful life (straight-line, declining balance, units of production).`
  },
  "fixed-asset-useful-life": {
    term: msg`Useful Life (months)`,
    definition: msg`The number of months over which this asset will be depreciated.`
  },
  "fixed-asset-lifetime-usage": {
    term: msg`Lifetime Usage (units)`,
    definition: msg`Total expected production units for units-of-production depreciation; cost is spread per unit produced.`
  },
  "fixed-asset-tax-depreciation-method": {
    term: msg`Tax Depreciation Method`,
    definition: msg`A separate schedule for tax reporting when tax rules require a method different from book depreciation.`
  },
  "macrs-property-class": {
    term: msg`MACRS Property Class`,
    definition: msg`The IRS recovery-period class for this asset under MACRS (3, 5, 7, 10, 15, 20, 27.5, 39-year).`
  },
  "macrs-convention": {
    term: msg`MACRS Convention`,
    definition: msg`Mid-month / mid-quarter / half-year convention that determines the first-year deduction.`
  },
  "bonus-depreciation": {
    term: msg`Bonus Depreciation %`,
    definition: msg`First-year additional deduction taken before the regular MACRS schedule begins.`
  },
  "fixed-asset-tax-useful-life": {
    term: msg`Tax Useful Life (months)`,
    definition: msg`Months over which this asset depreciates for tax purposes (when not using MACRS).`
  },

  // ── Asset class defaults ────────────────────────────────────────────────
  "asset-class-default-depreciation-method": {
    term: msg`Depreciation Method (default)`,
    definition: msg`Default method that pre-fills on new assets in this class (still editable per asset).`
  },
  "asset-class-default-useful-life": {
    term: msg`Useful Life (default)`,
    definition: msg`Default useful life that pre-fills on new assets in this class.`
  },
  "asset-class-asset-account": {
    term: msg`Asset Account`,
    definition: msg`GL account debited when an asset in this class is acquired.`
  },
  "asset-class-accumulated-depreciation-account": {
    term: msg`Accumulated Depreciation Account`,
    definition: msg`GL contra-asset account credited when depreciation posts for assets in this class.`
  },
  "asset-class-depreciation-expense-account": {
    term: msg`Depreciation Expense Account`,
    definition: msg`GL expense account debited each period when depreciation posts.`
  },
  "asset-class-write-off-account": {
    term: msg`Write-Off Account`,
    definition: msg`GL account hit when an asset is written off (cost removed without disposal proceeds).`
  },
  "asset-class-write-down-account": {
    term: msg`Write-Down Account`,
    definition: msg`GL account hit when an asset's book value is reduced (impairment).`
  },
  "asset-class-disposal-account": {
    term: msg`Disposal Account`,
    definition: msg`GL account where gain or loss is booked when an asset in this class is disposed.`
  },
  "asset-class-default-tax-method": {
    term: msg`Tax Method (default)`,
    definition: msg`Default tax depreciation method for new assets in this class.`
  },
  "asset-class-default-tax-useful-life": {
    term: msg`Tax Useful Life (default)`,
    definition: msg`Default tax-book life for new assets in this class.`
  },

  // ── Fixed-asset register / disposal ─────────────────────────────────────
  "fixed-asset-acquisition-cost": {
    term: msg`Acquisition Cost`,
    definition: msg`Total capitalized cost of the asset (purchase price plus freight, install, and other costs that become part of book value).`
  },
  "fixed-asset-opening-accumulated-depreciation": {
    term: msg`Accumulated Depreciation (opening)`,
    definition: msg`Opening balance of depreciation already booked before this asset was added to Carbon (use 0 for new acquisitions).`
  },
  "fixed-asset-depreciation-start-date": {
    term: msg`Depreciation Start Date`,
    definition: msg`The date depreciation begins for this asset; usually the in-service date.`
  },
  "fixed-asset-disposal-date": {
    term: msg`Disposal Date`,
    definition: msg`The date this asset is retired from service; depreciation stops on this date and remaining net book value is booked to the disposal account.`
  },

  // ── Intercompany ────────────────────────────────────────────────────────
  "intercompany-debit-account": {
    term: msg`Debit Account`,
    definition: msg`GL account in the source company to debit for this intercompany transaction.`
  },
  "intercompany-credit-account": {
    term: msg`Credit Account`,
    definition: msg`GL account in the target company to credit for this intercompany transaction.`
  },
  "intercompany-posting-date": {
    term: msg`Posting Date`,
    definition: msg`The date this intercompany transaction hits both companies' ledgers.`
  },

  // ── Journal entries ─────────────────────────────────────────────────────
  "journal-entry-source": {
    term: msg`Source`,
    definition: msg`Where this entry originated (manual entry, posting from sales/purchasing, recurring template, etc.).`
  },
  "journal-entry-posting-date": {
    term: msg`Posting Date`,
    definition: msg`The date this entry hits the ledger; determines the accounting period it falls in.`
  },
  "journal-line-debit": {
    term: msg`Debit`,
    definition: msg`Amount that increases assets/expenses or decreases liabilities/equity/revenue on this line.`
  },
  "journal-line-credit": {
    term: msg`Credit`,
    definition: msg`Amount that increases liabilities/equity/revenue or decreases assets/expenses on this line.`
  },
  "journal-line-dimensions": {
    term: msg`Dimensions`,
    definition: msg`Optional tags (cost center, project, etc.) that let you slice this posting in reports.`
  },

  // ── Payment terms ───────────────────────────────────────────────────────
  "payment-term-calculation-method": {
    term: msg`After (calculation method)`,
    definition: msg`What the due-date countdown starts from (invoice date, end of month, etc.).`
  },
  "payment-term-due-days": {
    term: msg`Due Days`,
    definition: msg`How many days after the calculation date the full amount is due.`
  },
  "payment-term-discount-days": {
    term: msg`Discount Days`,
    definition: msg`How many days after the calculation date the early-payment discount is still available.`
  },
  "payment-term-discount-percent": {
    term: msg`Discount Percent`,
    definition: msg`The cash discount the customer can take if they pay within the discount window.`
  },

  // ── Documents (plan 03) ─────────────────────────────────────────────────
  "document-view-permissions": {
    term: msg`View permissions`,
    definition: msg`Users and groups allowed to open or download this document; the uploader is always included.`
  },
  "document-edit-permissions": {
    term: msg`Edit permissions`,
    definition: msg`Users and groups allowed to rename, replace, or re-label this document; the uploader is always included, and edit access implies view access.`
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Inventory sweep (plan 04): field-specific entries for the ERP inventory
  // module. Topic-of umbrellas (`shelf-life`) remain above for docs <Term> use;
  // field labels now point at these field-specific slugs instead. Broken
  // termIds (`receipt`/`serial`/`batch`) at field-label call sites are replaced
  // with the corresponding entity-prefixed slugs.
  // ──────────────────────────────────────────────────────────────────────────

  // ── Kanbans (KanbanForm) ────────────────────────────────────────────────
  // Note: `conversion-factor` already exists above (shared across PO/receipt/
  // bill lines too); the Kanban form reuses it. `purchase-unit-of-measure`
  // is new because no shared definition existed.
  "purchase-unit-of-measure": {
    term: msg`Purchase Unit of Measure`,
    definition: msg`The unit suppliers price and ship this item in, when different from the inventory unit (e.g. case vs each).`
  },
  "kanban-auto-release": {
    term: msg`Auto Release`,
    definition: msg`When the kanban card is scanned, the job is automatically moved out of draft and released to the floor.`
  },
  "kanban-auto-start-job": {
    term: msg`Auto Start Job`,
    definition: msg`Skip the released-but-not-started state — the job starts immediately on scan.`
  },
  "kanban-completion-barcode": {
    term: msg`Completion Barcode`,
    definition: msg`The code printed on the kanban card that operators scan to mark the job complete; auto-generated when left blank.`
  },

  // ── Shipping methods (ShippingMethodForm) ───────────────────────────────
  "shipping-method-carrier-account": {
    term: msg`Carrier Account`,
    definition: msg`The GL account charges for this carrier post to (freight expense, freight in/out).`
  },
  "shipping-method-tracking-url": {
    term: msg`Tracking URL`,
    definition: msg`The carrier's tracking-page URL with {trackingNumber} as a placeholder — Carbon substitutes the actual number when generating links on shipments.`
  },

  // ── Warehouse transfers (WarehouseTransferForm) ─────────────────────────
  "warehouse-transfer-expected-receipt-date": {
    term: msg`Expected Receipt Date`,
    definition: msg`When the receiving location expects the stock to arrive; drives MRP availability at the destination.`
  },

  // ── Storage units (StorageUnitForm) ─────────────────────────────────────
  "storage-unit-parent": {
    term: msg`Parent Storage Unit`,
    definition: msg`Another storage unit this one nests inside (e.g. a bin within a rack); must be in the same location.`
  },
  "storage-unit-storage-types": {
    term: msg`Storage Types`,
    definition: msg`The categories of stock allowed in this unit; used to enforce putaway rules (e.g. cold chain, hazardous).`
  },
  "storage-unit-work-center": {
    term: msg`Work Center`,
    definition: msg`Assigns this unit to a work center for lineside material, so operators see it on the production view; inherited from the parent unit when set there.`
  },

  // ── Receipts (ReceiptForm) ──────────────────────────────────────────────
  "receipt-source-document": {
    term: msg`Source Document`,
    definition: msg`What this receipt is fulfilling — a purchase order, a return, an inbound transfer, or a manual receipt with no parent.`
  },
  "receipt-source-document-id": {
    term: msg`Source Document ID`,
    definition: msg`The specific PO, return, or transfer this receipt posts against; available IDs depend on the source document type above.`
  },
  "receipt-external-reference": {
    term: msg`External Reference`,
    definition: msg`The supplier's packing-slip or shipment number, recorded for audit; not used by any posting logic.`
  },

  // ── Shipments (ShipmentForm) ────────────────────────────────────────────
  "shipment-source-document": {
    term: msg`Source Document`,
    definition: msg`What this shipment is fulfilling — a sales order, an outbound transfer, an RMA return, or a manual shipment.`
  },
  "shipment-source-document-id": {
    term: msg`Source Document ID`,
    definition: msg`The specific SO, transfer, or RMA this shipment posts against; available IDs depend on the source document type above.`
  },

  // ── Inventory adjustment modal (InventoryStorageUnits) ──────────────────
  "inventory-adjustment-type": {
    term: msg`Adjustment Type`,
    definition: msg`Why stock is changing — Positive (found), Negative (lost/scrap), or Set (replace count with a measured value).`
  },
  "inventory-adjustment-serial-number": {
    term: msg`Serial Number`,
    definition: msg`The unique identifier on this physical unit; one row per serial, quantity is always 1.`
  },
  "inventory-adjustment-batch-number": {
    term: msg`Batch Number`,
    definition: msg`The lot identifier for this stock; one row per batch, quantity is the on-hand for that lot.`
  },
  "inventory-adjustment-expiration-date": {
    term: msg`Expiration Date`,
    definition: msg`When this specific lot/serial expires; drives FEFO picking and the shelf-life policy on consumption.`
  },

  // ── Traceability (EditExpiryModal) ──────────────────────────────────────
  "traceability-expiration-edit-date": {
    term: msg`New expiration date`,
    definition: msg`The corrected expiration for this lot/serial; existing on-hand stock is re-evaluated against shelf-life policy after the change.`
  }
} as const satisfies Record<string, GlossaryEntry>;
