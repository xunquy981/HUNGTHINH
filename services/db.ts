
import Dexie, { type Table } from 'dexie';
import { Product, Order, Partner, DebtRecord, ImportOrder, Transaction, InventoryLog, DeliveryNote, Quote, AuditLog, ReturnNote, PurchaseReturnNote, ReceivingNote, ErrorLog, AICacheEntry, AppNotification } from '../types';
import { tokenize } from '../utils/helpers';
import { DB_SCHEMA_VERSION } from '../constants/versions';

// New interface for Multi-warehouse stock tracking
export interface StockLevel {
  id: string; // [productId]-[warehouseId]
  productId: string;
  warehouseId: string;
  quantity: number;
  updatedAt: number;
}

export class ERPDatabase extends Dexie {
  products!: Table<Product & { searchWords?: string[] }>;
  stockLevels!: Table<StockLevel>;
  orders!: Table<Order & { searchWords?: string[] }>;
  partners!: Table<Partner & { searchWords?: string[] }>;
  debtRecords!: Table<DebtRecord>;
  importOrders!: Table<ImportOrder>;
  transactions!: Table<Transaction>;
  inventoryLogs!: Table<InventoryLog>;
  deliveryNotes!: Table<DeliveryNote>;
  quotes!: Table<Quote>;
  settings!: Table<{key: string, value: any}>;
  auditLogs!: Table<AuditLog>;
  returnNotes!: Table<ReturnNote>;
  purchaseReturnNotes!: Table<PurchaseReturnNote>;
  receivingNotes!: Table<ReceivingNote>;
  errorLogs!: Table<ErrorLog>;
  aiCache!: Table<AICacheEntry>;
  notifications!: Table<AppNotification>;
  meta!: Table<{key: string, value: any}>;

  constructor() {
    super('ERP_Bearing_DB');
    
    // Performance Upgrade: Version controlled by constants/versions.ts
    // This ensures backup/restore logic stays in sync with DB structure
    (this as any).version(DB_SCHEMA_VERSION).stores({
      products: 'id, sku, name, brand, location, stock, retailPrice, createdAt, updatedAt, isDeleted, seedTag, *searchWords, image',
      stockLevels: 'id, productId, warehouseId, quantity',
      orders: 'id, code, customerName, phone, date, status, paymentStatus, fulfillmentStatus, total, quoteId, partnerId, createdAt, updatedAt, isDeleted, seedTag, *searchWords',
      partners: 'id, code, name, type, phone, debt, createdAt, updatedAt, isDeleted, seedTag, *searchWords',
      debtRecords: 'id, partnerId, partnerName, orderCode, status, type, totalAmount, remainingAmount, dueDate, createdAt, updatedAt, seedTag',
      importOrders: 'id, code, supplierId, supplierName, date, status, total, warehouse, invoiceNo, createdAt, updatedAt, seedTag',
      transactions: 'id, date, type, category, method, amount, referenceCode, createdAt, updatedAt, seedTag',
      inventoryLogs: 'id, productId, sku, type, date, timestamp, createdAt, updatedAt, seedTag',
      deliveryNotes: 'id, code, orderCode, orderId, date, status, createdAt, updatedAt, seedTag',
      quotes: 'id, code, customerName, date, status, total, convertedOrderId, createdAt, updatedAt, seedTag',
      settings: 'key',
      auditLogs: 'id, module, entityType, entityId, entityCode, action, createdAt, createdById, refCode, severity, seedTag, [module+createdAt], [entityType+entityId]',
      returnNotes: 'id, code, orderCode, customerId, date, createdAt, seedTag',
      purchaseReturnNotes: 'id, code, importCode, supplierId, date, createdAt, seedTag',
      receivingNotes: 'id, code, importCode, supplierId, date, createdAt, seedTag',
      errorLogs: '++id, timestamp, severity, route',
      aiCache: 'key, expiresAt',
      notifications: 'id, type, severity, timestamp, isDismissed, sourceId',
      meta: 'key'
    });

    // --- AUTOMATIC INDEXING HOOKS ---
    // Fixed TS errors by casting mods to any or Partial<T>

    this.products.hook('creating', (primKey, obj) => {
        obj.searchWords = tokenize(`${obj.name} ${obj.sku} ${obj.brand || ''} ${obj.location || ''}`);
    });
    this.products.hook('updating', (mods, primKey, obj, trans) => {
        const updates = mods as Partial<Product>;
        const newObj = { ...obj, ...updates };
        if (updates.name || updates.sku || updates.brand || updates.location) {
            return { searchWords: tokenize(`${newObj.name} ${newObj.sku} ${newObj.brand || ''} ${newObj.location || ''}`) };
        }
    });

    this.partners.hook('creating', (primKey, obj) => {
        obj.searchWords = tokenize(`${obj.name} ${obj.phone || ''} ${obj.code} ${obj.email || ''}`);
    });
    this.partners.hook('updating', (mods, primKey, obj, trans) => {
        const updates = mods as Partial<Partner>;
        const newObj = { ...obj, ...updates };
        if (updates.name || updates.phone || updates.code) {
            return { searchWords: tokenize(`${newObj.name} ${newObj.phone || ''} ${newObj.code} ${newObj.email || ''}`) };
        }
    });

    this.orders.hook('creating', (primKey, obj) => {
        obj.searchWords = tokenize(`${obj.code} ${obj.customerName} ${obj.phone || ''}`);
    });
    this.orders.hook('updating', (mods, primKey, obj, trans) => {
        const updates = mods as Partial<Order>;
        const newObj = { ...obj, ...updates };
        if (updates.code || updates.customerName || updates.phone) {
            return { searchWords: tokenize(`${newObj.code} ${newObj.customerName} ${newObj.phone || ''}`) };
        }
    });
  }
}

export const db = new ERPDatabase();
