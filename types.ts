
export type ViewState = 
  | 'DASHBOARD' 
  | 'POS' 
  | 'ORDERS' 
  | 'QUOTES' 
  | 'INVENTORY' 
  | 'IMPORTS' 
  | 'PARTNERS' 
  | 'DEBTS' 
  | 'TRANSACTIONS' 
  | 'REPORTS' 
  | 'SETTINGS' 
  | 'AUDIT_LOGS' 
  | 'SYSTEM_LOGS' 
  | 'DELIVERY_NOTES' 
  | 'INVENTORY_HISTORY';

export type PartnerType = 'Customer' | 'Supplier';

export interface Partner {
  id: string;
  code: string;
  name: string;
  type: PartnerType;
  phone: string;
  email?: string;
  address?: string;
  taxId?: string;
  debt?: number;
  debtLimit?: number;
  createdAt: number;
  updatedAt: number;
  isDeleted?: boolean;
  seedTag?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  image?: string;
  brand?: string;
  location: string;
  stock: number;
  minStock?: number;
  stockReserved?: number;
  importPrice: number;
  retailPrice: number;
  unit?: string;
  dimensions?: string;
  createdAt: number;
  updatedAt: number;
  isDeleted?: boolean;
  seedTag?: string;
}

export interface OrderItem {
  id: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  total: number;
  costPrice?: number;
  deliveredQuantity?: number;
}

export type OrderStatus = 'PendingPayment' | 'Processing' | 'Shipping' | 'PartiallyShipped' | 'Completed' | 'Returned' | 'Cancelled';
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'debt';
export type PaymentStatus = 'Paid' | 'Unpaid' | 'Partial';
export type FulfillmentStatus = 'NotShipped' | 'Shipped' | 'Delivered' | 'Returned';

export interface Order {
  id: string;
  code: string;
  customerName: string;
  phone?: string;
  address?: string;
  taxId?: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  partnerId?: string;
  quoteId?: string;
  notes?: string;
  shippingFee?: number;
  lockedAt?: number;
  createdAt: number;
  updatedAt: number;
  isDeleted?: boolean;
  seedTag?: string;
}

export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Cancelled' | 'Expired' | 'Converted';

export interface QuoteItem extends OrderItem {}

export interface Quote {
  id: string;
  code: string;
  customerName: string;
  customerId?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  date: string;
  validUntil: string;
  status: QuoteStatus;
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes?: string;
  convertedOrderId?: string;
  createdAt: number;
  updatedAt: number;
  seedTag?: string;
}

export type ImportStatus = 'Pending' | 'Receiving' | 'Received' | 'Completed' | 'Cancelled';

export interface ImportItem {
  id: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  total: number;
  receivedQuantity?: number;
}

export interface ImportOrder {
  id: string;
  code: string;
  supplierId: string;
  supplierName: string;
  date: string;
  status: ImportStatus;
  warehouse: string;
  invoiceNo?: string;
  items: ImportItem[];
  total: number;
  amountPaid?: number;
  paymentMethod?: string;
  notes?: string;
  extraCosts?: number;
  lockedAt?: number;
  createdAt: number;
  updatedAt: number;
  seedTag?: string;
  isDeleted?: boolean;
}

export type DebtStatus = 'Pending' | 'Partial' | 'Paid' | 'Overdue' | 'DueSoon' | 'Void' | 'Normal';
export type DebtType = 'Receivable' | 'Payable';

export interface DebtPayment {
  id: string;
  date: string;
  amount: number;
  method: string;
  notes?: string;
}

export interface DebtRecord {
  id: string;
  partnerId: string;
  partnerName: string;
  orderCode: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  remainingAmount: number;
  status: DebtStatus;
  type: DebtType;
  payments?: DebtPayment[];
  createdAt: number;
  updatedAt: number;
  seedTag?: string;
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  category: string;
  amount: number;
  method: 'cash' | 'transfer' | 'card';
  description: string;
  referenceCode?: string;
  partnerName?: string;
  timestamp?: number; // Added for compatibility
  createdAt: number;
  updatedAt: number;
  seedTag?: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  type: string;
  changeAmount: number;
  oldStock: number;
  newStock: number;
  date: string;
  timestamp: number;
  referenceCode?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  seedTag?: string;
}

export type DeliveryStatus = 'Pending' | 'Shipping' | 'Delivered' | 'Cancelled';

export interface DeliveryNote {
  id: string;
  code: string;
  orderCode: string;
  orderId?: string;
  date: string;
  customerName: string;
  address: string;
  taxId?: string;
  shipperName?: string;
  shipperPhone?: string;
  notes?: string;
  items: OrderItem[];
  status: DeliveryStatus;
  subtotal?: number;
  total?: number;
  discount?: number;
  vatRate?: number;
  vatAmount?: number;
  createdAt: number;
  updatedAt: number;
  seedTag?: string;
}

export type AuditAction = 'Create' | 'Update' | 'Delete' | 'SoftDelete' | 'StatusChange' | 'Payment' | 'Adjust' | 'Lock' | 'Convert';
export type AuditModule = 'Orders' | 'Inventory' | 'Debts' | 'Imports' | 'Partners' | 'Settings' | 'Returns' | 'Transactions' | 'Quotes' | 'Delivery' | 'System';

export interface AuditLog {
  id: string;
  createdAt: number;
  createdById: string;
  createdByName: string;
  module: AuditModule;
  entityType: string;
  entityId: string;
  entityCode?: string;
  action: AuditAction;
  summary: string;
  before?: any;
  after?: any;
  diff?: any;
  severity: 'info' | 'warn' | 'error';
  refType?: string;
  refCode?: string;
  tags?: string[];
  seedTag?: string;
}

export interface ReceivingNote {
  id: string;
  code: string;
  importCode: string;
  date: string;
  items: any[];
  totalLandedCost?: number;
  supplierName?: string;
  createdAt: number;
  updatedAt: number;
  seedTag?: string;
}

export interface ReturnNote {
  id: string;
  code: string;
  orderCode: string;
  customerId: string;
  date: string;
  items: any[];
  refundAmount: number;
  reason: string;
  createdAt: number;
  seedTag?: string;
}

export interface PurchaseReturnNote {
  id: string;
  code: string;
  importCode: string;
  supplierId: string;
  date: string;
  items: any[];
  refundAmount: number;
  method: string;
  notes?: string;
  createdAt: number;
  seedTag?: string;
}

export interface ErrorLog {
  id?: number;
  timestamp: number;
  message: string;
  stack?: string;
  componentStack?: string;
  severity: 'error' | 'warning' | 'info';
  route: string;
  userAgent: string;
}

export interface AICacheEntry {
  key: string;
  value: string;
  timestamp: number;
  expiresAt: number;
}

export interface AppNotification {
  id: string;
  type: 'system' | 'order' | 'inventory' | 'debt';
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  timestamp: number;
  isDismissed: boolean;
  link?: { view: ViewState; params?: any };
  sourceId?: string;
}

export interface TableColumnConfig {
    key: string;
    label: string;
    visible: boolean;
    width?: string;
    align?: 'left' | 'center' | 'right';
}

export interface TemplateSection {
    id: string;
    visible: boolean;
    order: number;
    label: string;
}

export interface DocTypeConfig {
    title: string;
    footerNote: string;
    signatures: string[];
    sections: TemplateSection[];
    columns: TableColumnConfig[];
    colorTheme: string;
    customHeader?: string;
    customCss?: string;
    notes?: string;
    signatureOptions?: {
        showTitle: boolean;
        showStamp: boolean;
        showFullName: boolean;
    };
}

export interface AppSettings {
    general: {
        name: string;
        taxId: string;
        phone: string;
        email: string;
        website: string;
        address: string;
        logo: string;
        bankName?: string;
        bankAccount?: string;
        bankOwner?: string;
    };
    finance: {
        currency: string;
        vat: number;
        printInvoice: boolean;
        roundingRule: 'none' | '500' | '1000';
        defaultMarkupRate: number;
        lockDate?: string; // New: Accounting lock date (YYYY-MM-DD)
    };
    system: {
        orderPrefix: string;
        importPrefix: string;
        quotePrefix: string;
        returnPrefix: string;
        minStockDefault: number;
        debtDueDays: number;
        autoLockDays: number;
        preventNegativeStock: boolean;
    };
    appearance: {
        theme: 'light' | 'dark';
        density: 'comfortable' | 'compact';
        primaryColor: string;
        fontSize: number;
    };
    ai: {
        enabled: boolean;
        apiKey: string;
        analysisDepth: string;
        personality: string;
        autoCategorization: boolean;
    };
    documents: {
        order: DocTypeConfig;
        quote: DocTypeConfig;
        import: DocTypeConfig;
        delivery: DocTypeConfig;
    };
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  title?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ReconcileIssue {
  type: string;
  severity: 'High' | 'Medium' | 'Low';
  message: string;
  suggestedFix?: string;
  autoFixable?: boolean;
  entityId?: string;
  entityType?: 'Product' | 'Order' | 'Partner' | 'Transaction';
  action?: 'update_debt' | 'update_order_total' | 'reset_stock' | 'fix_reserved';
  payload?: any;
}

export interface BackupData {
  metadata: {
    appVersion: string;
    schemaVersion: number;
    exportedAt: number;
    source: string;
  };
  data: Record<string, any[]>;
}

export interface SearchResult {
  id: string;
  type: 'ORDER' | 'QUOTE' | 'PARTNER' | 'PRODUCT' | 'DELIVERY' | 'IMPORT';
  title: string;
  subtitle: string;
  view: ViewState;
  icon: string;
  status?: string;
  highlightId?: string;
  code?: string;
}
