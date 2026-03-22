# HUNG THINH ERP - END-TO-END TEST CHECKLIST (v3.9 Refactor)

## 🔴 P0: Critical Domain Flows (Must Pass)

### 1. Order Lifecycle (The "Happy Path")
- [ ] **Create Order (Paid & Complete)**: 
    - Action: POS > Add Item A (Qty: 5) > Pay Cash.
    - Check 1: `Products[A].stock` decreases by 5.
    - Check 2: `Transactions` has new "Income/Sale" entry.
    - Check 3: Order Status is `Completed`.
- [ ] **Create Order (Debt & Reserve)**: 
    - Action: POS > Select Customer > Add Item B (Qty: 10) > Toggle "Giao hàng sau" > Click "Ghi Nợ".
    - Check 1: `Products[B].stockReserved` increases by 10 (Stock remains unchanged).
    - Check 2: `DebtRecords` created for Customer.
    - Check 3: Order Status is `Processing`.

### 2. Regression Testing (Bug Fixes) - **CRITICAL**
- [ ] **Fix: Edit Reserved Order**: 
    - Setup: Create "Processing" order with Item A (Qty: 5).
    - Action: Edit Order > Change Item A Qty to 8 > Save.
    - Verify: `Products[A].stockReserved` updates from 5 -> 8 correctly. (Old bug: didn't update).
- [ ] **Fix: Cancel Paid Order (Refund)**: 
    - Setup: Create "Completed" order, fully paid.
    - Action: Open Order > Click "Delete/Cancel".
    - Verify: 
        1. Inventory returns (+qty).
        2. **New Transaction** "Expense/Refund" created automatically. (Old bug: Revenue stayed high).

### 3. Inventory & Supply Chain
- [ ] **Import Process (Average Cost)**: 
    - Setup: Product A has Stock: 10, Price: 100k.
    - Action: Import > Supplier X > Item A (Qty: 10, Price: 200k) > Confirm "Nhập kho".
    - Verify: Product A Stock = 20. `ImportPrice` updates to approx 150k (Moving Average).
- [ ] **Stock Adjustment**: 
    - Action: Inventory > Product A > Adjust > Set Qty = 5.
    - Verify: `InventoryLog` created with type "adjustment". Stock = 5.

### 4. Financial Reconciliation
- [ ] **Debt Collection**: 
    - Action: Debts > Select Receivable > "Thanh toán" (Partial 50%).
    - Verify: Debt `remainingAmount` decreases. Transaction "Income/DebtCollection" created.
- [ ] **Reports Integrity**:
    - Action: Go to Dashboard > Check "Revenue".
    - Verify: Sum of valid Orders matches exactly (excluding Cancelled).

---

## 🟡 P1: System Health & Performance

### 5. Performance (New Indexes)
- [ ] **Global Search**: 
    - Action: Type a specific SKU (e.g., "SKF-6205") into Topbar Search.
    - Verify: Results appear instantly (< 200ms) without UI lag.
- [ ] **Order List Load**:
    - Action: Open "Orders" page with > 1000 orders (simulated).
    - Verify: Stats (Unpaid/Processing) load immediately via Dexie Index count.

### 6. Data Safety
- [ ] **Backup & Restore**: 
    - Action: Settings > Data > Export Backup.
    - Action: Reset System (Clear DB).
    - Action: Restore Backup.
    - Verify: All Orders and Partners return correctly.
- [ ] **Data Reconciliation Tool**:
    - Action: Settings > System Logs > "Quét toàn hệ thống".
    - Verify: Returns "Hệ thống ổn định" (or lists valid issues if any data was manually messed up).

---

## 🟢 P2: UX Polish

### 7. Interface
- [ ] **Mobile Drawer**: Open POS on mobile size. Click Cart icon. Drawer slides up.
- [ ] **Theme Switch**: Toggle Dark Mode. Check Text contrast in Tables and Cards.
- [ ] **Print Templates**: Open Order > Print. Check if Company Info & Logo appear correctly.
