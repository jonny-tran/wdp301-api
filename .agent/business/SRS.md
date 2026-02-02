# AI AGENT SRS: CENTRAL KITCHEN & FRANCHISE MANAGEMENT SYSTEM (SP26SWP07)

## 1. PROJECT OVERVIEW

- **Project Name:** Central Kitchen & Franchise Management System (KFC Model)
- **Project Code:** SP26SWP07
- **Domain:** Food & Beverage (F&B) Supply Chain Management
- **Objective:** Manage the flow of goods from a Central Kitchen (CK) to multiple Franchise Stores with strict inventory control.

## 2. ABSOLUTE BUSINESS PRINCIPLES (NON-NEGOTIABLE)

### 2.1. Batch-Centric Inventory

- **Concept:** Products are never stored as a simple total quantity. Every item in the warehouse must belong to a **Batch**.
- **Formula:** `Inventory Item = Warehouse ID + Product ID + Batch ID`.
- **Requirement:** AI must always query the `Batch` table to check availability, never just the `Product` table.

### 2.2. FEFO (First Expired, First Out)

- **Logic:** When picking goods for an order, the system must automatically select Batches with the **earliest expiry date** first.
- **Algorithm:** `SELECT * FROM batches WHERE product_id = X ORDER BY expiry_date ASC`.

### 2.3. No Backorders (Strict Fulfillment)

- **Logic:** We do not track "owed" items.
- **Scenario:** Store orders 100 units. Warehouse only has 80.
- **Action:** 1. Approve 80 units (Partial Fulfillment).

2. Cancel the remaining 20 units immediately.
3. Notify the Store to place a new order later if needed.

- **Constraint:** `OrderItem.approved_qty <= OrderItem.requested_qty`.

### 2.4. Discrepancy Handling (Receiving)

- **Logic:** Real-time stock accuracy over administrative perfection.
- **Action:** When a Store receives a shipment:

1. Store Staff enters the **Actual Received Quantity**.
2. System updates Store Inventory **immediately** based on this number.
3. If `Actual Received != Shipped Quantity`, the system automatically generates a **Claim Ticket** for the Coordinator to investigate later.

## 3. ACTOR DEFINITIONS & PERMISSIONS

| Actor                     | Platform | Primary Responsibilities                                 |
| ------------------------- | -------- | -------------------------------------------------------- |
| **Franchise Store Staff** | Mobile   | Create Orders, Receive Goods, Report Issues (Claims).    |
| **Central Kitchen Staff** | Mobile   | Picking (Batch scanning), Production, Stock-in/out.      |
| **Supply Coordinator**    | Web      | Approve/Adjust Orders, Assign Drivers, Resolve Claims.   |
| **Manager**               | Web      | Manage Master Data (Recipes, Products, Prices), Reports. |
| **Admin**                 | Web      | User Management, System Configuration, Logs.             |

## 4. KEY WORKFLOWS FOR AI LOGIC

### 4.1. Ordering & Fulfillment

1. **Store** creates an `Order`. Status: `PENDING`.
2. **Coordinator** reviews. If stock is low, modifies `approved_qty` (No Backorder rule). Status: `APPROVED`.
3. **Kitchen Staff** performs Picking. System forces selection of Batches via FEFO.
4. **Kitchen Staff** confirms Picking. Status: `READY_TO_SHIP`.

### 4.2. Shipping & Receiving

1. **Coordinator** assigns a shipment to a route. Status: `SHIPPING`.
2. **Store Staff** receives goods on Mobile.
3. System executes:

- `UPDATE store_inventory SET quantity = quantity + actual_received`.
- `INSERT INTO inventory_transaction` (Audit Log).
- If `actual_received < shipped_qty` -> `INSERT INTO claim_tickets`.

## 5. TECHNICAL CONSTRAINTS FOR GENERATED CODE

- **Database:** PostgreSQL. Use `Snake_case` for columns.
- **Data Integrity:** Use **Transactions** (ACID) for all inventory movements. If any step fails (e.g., updating batch stock), the entire operation must rollback.
- **Validation:** Always validate that `batch.expiry_date > CURRENT_DATE` before allowing an export.
- **Audit Trail:** Every change in stock levels must have a corresponding entry in the `InventoryTransaction` table.

## 6. DATA ENTITY RELATIONSHIPS

- **Order:** One-to-many with **OrderItem**.
- **Shipment:** One-to-one with **Order**, but many-to-many with **Batch** (via **ShipmentItem**).
- **Product:** One-to-many with **Batch**.
- **Warehouse:** One-to-many with **Batch** (Inventory location).
