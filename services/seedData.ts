import { db } from './db';
import { generateUUID, getCurrentDate, formatDateISO, addDays } from '../utils/helpers';
import { Product, Partner, Order, Transaction, DebtRecord, InventoryLog, ImportOrder, Quote, DeliveryNote } from '../types';

export const seedDatabase = async () => {
    const today = new Date();
    const daysAgo = (n: number) => formatDateISO(addDays(today, -n));

    // 1. PRODUCTS (Rich set across categories)
    const products: Product[] = [
        { id: generateUUID('prod'), sku: 'SKF-6205-2RS1', name: 'Bạc đạn cầu SKF 6205-2RS1', brand: 'SKF', location: 'bearing', stock: 150, minStock: 20, importPrice: 65000, retailPrice: 110000, unit: 'Cái', dimensions: '25x52x15 mm', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('prod'), sku: 'NSK-6309-ZZ', name: 'Bạc đạn cầu NSK 6309-ZZ', brand: 'NSK', location: 'bearing', stock: 8, minStock: 10, importPrice: 180000, retailPrice: 260000, unit: 'Cái', dimensions: '45x100x25 mm', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('prod'), sku: 'KOYO-32210', name: 'Bạc đạn côn KOYO 32210 JR', brand: 'KOYO', location: 'bearing', stock: 45, minStock: 10, importPrice: 220000, retailPrice: 350000, unit: 'Bộ', dimensions: '50x90x23 mm', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('prod'), sku: 'NTN-UC205', name: 'Bạc đạn gối đỡ NTN UC205', brand: 'NTN', location: 'bearing', stock: 0, minStock: 15, importPrice: 85000, retailPrice: 140000, unit: 'Cái', dimensions: '25x52x34.1 mm', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('prod'), sku: 'MITSUBOSHI-B52', name: 'Dây curoa trơn bản B - B52', brand: 'MITSUBOSHI', location: 'belt', stock: 200, minStock: 50, importPrice: 45000, retailPrice: 85000, unit: 'Sợi', dimensions: '', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('prod'), sku: 'BANDO-SPA1000', name: 'Dây curoa BANDO SPA 1000', brand: 'BANDO', location: 'belt', stock: 120, minStock: 30, importPrice: 120000, retailPrice: 195000, unit: 'Sợi', dimensions: '', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('prod'), sku: 'SHELL-S2-V220', name: 'Mỡ bôi trơn chịu nhiệt Shell Gadus S2 V220', brand: 'SHELL', location: 'lubricant', stock: 5, minStock: 5, importPrice: 1150000, retailPrice: 1450000, unit: 'Xô 18kg', dimensions: '', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('prod'), sku: 'MOBIL-XHP222', name: 'Mỡ bò xanh Mobilgrease XHP 222', brand: 'MOBIL', location: 'lubricant', stock: 12, minStock: 10, importPrice: 1250000, retailPrice: 1600000, unit: 'Xô 16kg', dimensions: '', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('prod'), sku: 'NOK-TC-35-50-8', name: 'Phớt lò xo NOK TC 35x50x8', brand: 'NOK', location: 'seal', stock: 500, minStock: 100, importPrice: 15000, retailPrice: 35000, unit: 'Cái', dimensions: '35x50x8 mm', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('prod'), sku: 'BOSCH-GWS060', name: 'Máy mài góc Bosch GWS 060', brand: 'BOSCH', location: 'tool', stock: 25, minStock: 5, importPrice: 750000, retailPrice: 990000, unit: 'Cái', dimensions: '', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false }
    ];

    // 2. PARTNERS (Customers & Suppliers)
    const partners: Partner[] = [
        { id: generateUUID('cust'), code: 'KH-001', name: 'CÔNG TY TNHH CƠ KHÍ AN PHÁT', type: 'Customer', phone: '0909123456', address: 'KCN Vĩnh Lộc, Bình Chánh, TP.HCM', taxId: '0312345678', debt: 15500000, debtLimit: 50000000, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('cust'), code: 'KH-002', name: 'GARA Ô TÔ MINH TUẤN', type: 'Customer', phone: '0918889999', address: '12 Nguyễn Văn Linh, Q.7, TP.HCM', taxId: '', debt: 0, debtLimit: 20000000, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('cust'), code: 'KH-003', name: 'XƯỞNG MỘC ĐỨC THÀNH', type: 'Customer', phone: '0987654321', address: 'Hóc Môn, TP.HCM', taxId: '', debt: 5000000, debtLimit: 10000000, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('supp'), code: 'NCC-001', name: 'ĐẠI LÝ VÒNG BI HÙNG DŨNG', type: 'Supplier', phone: '02839998888', address: 'Tạ Uyên, Q.5, TP.HCM', taxId: '0300998877', debt: 50000000, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false },
        { id: generateUUID('supp'), code: 'NCC-002', name: 'NPP DÂY CUROA TÂN PHÚ', type: 'Supplier', phone: '02837776666', address: 'Tân Phú, TP.HCM', taxId: '0300887766', debt: 12000000, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false }
    ];

    // 3. ORDERS
    const orders: Order[] = [
        {
            id: generateUUID('ord'), code: 'DH-2402-001', customerName: 'Khách lẻ',
            date: daysAgo(5), status: 'Completed', paymentStatus: 'Paid', fulfillmentStatus: 'Delivered',
            items: [
                { id: products[0].id, sku: products[0].sku, productName: products[0].name, quantity: 10, price: 110000, total: 1100000, unit: 'Cái', costPrice: 65000, deliveredQuantity: 10 },
                { id: products[4].id, sku: products[4].sku, productName: products[4].name, quantity: 5, price: 85000, total: 425000, unit: 'Sợi', costPrice: 45000, deliveredQuantity: 5 }
            ],
            subtotal: 1525000, discount: 25000, vatRate: 0, vatAmount: 0, total: 1500000, amountPaid: 1500000,
            paymentMethod: 'cash', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false
        },
        {
            id: generateUUID('ord'), code: 'DH-2402-002', customerName: partners[0].name, partnerId: partners[0].id,
            phone: partners[0].phone, address: partners[0].address,
            date: daysAgo(2), status: 'Completed', paymentStatus: 'Unpaid', fulfillmentStatus: 'Delivered',
            items: [
                { id: products[2].id, sku: products[2].sku, productName: products[2].name, quantity: 20, price: 350000, total: 7000000, unit: 'Bộ', costPrice: 220000, deliveredQuantity: 20 },
                { id: products[6].id, sku: products[6].sku, productName: products[6].name, quantity: 2, price: 1450000, total: 2900000, unit: 'Xô', costPrice: 1150000, deliveredQuantity: 2 }
            ],
            subtotal: 9900000, discount: 0, vatRate: 8, vatAmount: 792000, total: 10692000, amountPaid: 0,
            paymentMethod: 'debt', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false
        },
        {
            id: generateUUID('ord'), code: 'DH-2402-003', customerName: partners[1].name, partnerId: partners[1].id,
            date: getCurrentDate(), status: 'Processing', paymentStatus: 'Partial', fulfillmentStatus: 'Shipped',
            items: [
                { id: products[0].id, sku: products[0].sku, productName: products[0].name, quantity: 50, price: 105000, total: 5250000, unit: 'Cái', costPrice: 65000, deliveredQuantity: 20 }
            ],
            subtotal: 5250000, discount: 0, vatRate: 0, vatAmount: 0, total: 5250000, amountPaid: 2000000,
            paymentMethod: 'transfer', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false
        },
        {
            id: generateUUID('ord'), code: 'DH-2402-004', customerName: partners[2].name, partnerId: partners[2].id,
            date: daysAgo(1), status: 'PendingPayment', paymentStatus: 'Unpaid', fulfillmentStatus: 'NotShipped',
            items: [
                { id: products[9].id, sku: products[9].sku, productName: products[9].name, quantity: 2, price: 990000, total: 1980000, unit: 'Cái', costPrice: 750000, deliveredQuantity: 0 }
            ],
            subtotal: 1980000, discount: 0, vatRate: 10, vatAmount: 198000, total: 2178000, amountPaid: 0,
            paymentMethod: 'cash', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false
        },
        {
            id: generateUUID('ord'), code: 'DH-2402-005', customerName: 'Khách vãng lai',
            date: daysAgo(10), status: 'Cancelled', paymentStatus: 'Unpaid', fulfillmentStatus: 'NotShipped',
            items: [
                { id: products[1].id, sku: products[1].sku, productName: products[1].name, quantity: 4, price: 260000, total: 1040000, unit: 'Cái', costPrice: 180000, deliveredQuantity: 0 }
            ],
            subtotal: 1040000, discount: 0, vatRate: 0, vatAmount: 0, total: 1040000, amountPaid: 0,
            paymentMethod: 'cash', createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false
        }
    ];

    // Reserve stock for processing orders
    products[0].stockReserved = 30; // 50 ordered - 20 delivered

    // 4. TRANSACTIONS
    const transactions: Transaction[] = [
        { id: generateUUID('txn'), date: daysAgo(5), type: 'income', category: 'sale', amount: 1500000, method: 'cash', description: 'Thu tiền đơn hàng DH-2402-001', referenceCode: 'DH-2402-001', partnerName: 'Khách lẻ', createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('txn'), date: getCurrentDate(), type: 'income', category: 'sale', amount: 2000000, method: 'transfer', description: 'Cọc đơn hàng DH-2402-003', referenceCode: 'DH-2402-003', partnerName: partners[1].name, createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('txn'), date: daysAgo(10), type: 'expense', category: 'rent', amount: 8000000, method: 'transfer', description: 'Thanh toán tiền thuê mặt bằng Tháng 2', createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('txn'), date: daysAgo(1), type: 'expense', category: 'utilities', amount: 1200000, method: 'cash', description: 'Tiền điện + Internet', createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('txn'), date: daysAgo(3), type: 'expense', category: 'salary', amount: 15000000, method: 'transfer', description: 'Lương nhân viên T1', createdAt: Date.now(), updatedAt: Date.now() }
    ];

    // 5. DEBTS
    const debts: DebtRecord[] = [
        { id: generateUUID('debt'), partnerId: partners[0].id, partnerName: partners[0].name, orderCode: 'DH-2402-002', issueDate: daysAgo(2), dueDate: addDays(new Date(), 30).toISOString(), totalAmount: 10692000, remainingAmount: 10692000, status: 'Pending', type: 'Receivable', createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('debt'), partnerId: partners[2].id, partnerName: partners[2].name, orderCode: 'DH-2401-099', issueDate: daysAgo(20), dueDate: daysAgo(5), totalAmount: 5000000, remainingAmount: 5000000, status: 'Overdue', type: 'Receivable', createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('debt'), partnerId: partners[3].id, partnerName: partners[3].name, orderCode: 'PN-2402-001', issueDate: daysAgo(15), dueDate: addDays(new Date(), 15).toISOString(), totalAmount: 50000000, remainingAmount: 50000000, status: 'Pending', type: 'Payable', createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('debt'), partnerId: partners[4].id, partnerName: partners[4].name, orderCode: 'PN-2402-002', issueDate: daysAgo(8), dueDate: addDays(new Date(), 22).toISOString(), totalAmount: 25000000, remainingAmount: 12000000, status: 'Partial', type: 'Payable', createdAt: Date.now(), updatedAt: Date.now() }
    ];

    // 6. IMPORTS
    const imports: ImportOrder[] = [
        {
            id: generateUUID('imp'), code: 'PN-2402-001', supplierName: partners[3].name, supplierId: partners[3].id,
            date: daysAgo(15), status: 'Received',
            items: [
                { id: products[0].id, sku: products[0].sku, productName: products[0].name, quantity: 200, price: 65000, total: 13000000, unit: 'Cái' },
                { id: products[1].id, sku: products[1].sku, productName: products[1].name, quantity: 50, price: 180000, total: 9000000, unit: 'Cái' }
            ],
            total: 24200000, amountPaid: 0,
            paymentMethod: 'debt', createdAt: Date.now(), updatedAt: Date.now(), warehouse: 'Kho chính'
        },
        {
            id: generateUUID('imp'), code: 'PN-2402-003', supplierName: partners[4].name, supplierId: partners[4].id,
            date: getCurrentDate(), status: 'Pending',
            items: [
                { id: products[4].id, sku: products[4].sku, productName: products[4].name, quantity: 100, price: 45000, total: 4500000, unit: 'Sợi' }
            ],
            total: 4500000, amountPaid: 0,
            paymentMethod: 'transfer', createdAt: Date.now(), updatedAt: Date.now(), warehouse: 'Kho chính'
        }
    ];

    // 7. QUOTES
    const quotes: Quote[] = [
        {
            id: generateUUID('quo'), code: 'BG-2402-001', customerName: partners[0].name, customerId: partners[0].id,
            date: daysAgo(3), validUntil: addDays(new Date(), 10).toISOString(), status: 'Sent',
            items: [
                { id: products[8].id, sku: products[8].sku, productName: products[8].name, quantity: 1000, price: 30000, total: 30000000, unit: 'Cái' }
            ],
            subtotal: 30000000, discount: 1000000, vatRate: 8, vatAmount: 2320000, total: 31320000,
            notes: 'Báo giá dự án bảo trì quý 1', createdAt: Date.now(), updatedAt: Date.now()
        },
        {
            id: generateUUID('quo'), code: 'BG-2402-002', customerName: 'CÔNG TY TNHH ABC',
            date: daysAgo(1), validUntil: addDays(new Date(), 7).toISOString(), status: 'Draft',
            items: [
                { id: products[9].id, sku: products[9].sku, productName: products[9].name, quantity: 5, price: 950000, total: 4750000, unit: 'Cái' }
            ],
            subtotal: 4750000, discount: 0, vatRate: 10, vatAmount: 475000, total: 5225000,
            notes: '', createdAt: Date.now(), updatedAt: Date.now()
        }
    ];

    // 8. DELIVERY NOTES
    const deliveryNotes: DeliveryNote[] = [
        {
            id: generateUUID('del'), code: 'PX-2402-001', orderId: orders[0].id, orderCode: orders[0].code,
            customerName: orders[0].customerName, address: orders[0].address || '', date: daysAgo(5), status: 'Delivered',
            items: [
                { id: products[0].id, sku: products[0].sku, productName: products[0].name, quantity: 10, price: 0, total: 0, unit: 'Cái' },
                { id: products[4].id, sku: products[4].sku, productName: products[4].name, quantity: 5, price: 0, total: 0, unit: 'Sợi' }
            ],
            shipperName: 'Nguyễn Văn A', shipperPhone: '0901234567',
            createdAt: Date.now(), updatedAt: Date.now()
        },
        {
            id: generateUUID('del'), code: 'PX-2402-002', orderId: orders[2].id, orderCode: orders[2].code,
            customerName: orders[2].customerName, address: orders[2].address || '', date: getCurrentDate(), status: 'Shipping',
            items: [
                { id: products[0].id, sku: products[0].sku, productName: products[0].name, quantity: 20, price: 0, total: 0, unit: 'Cái' }
            ],
            shipperName: 'Trần Văn B', shipperPhone: '0987654321',
            createdAt: Date.now(), updatedAt: Date.now()
        }
    ];

    // 9. INVENTORY LOGS
    const inventoryLogs: InventoryLog[] = [
        { id: generateUUID('invlog'), productId: products[0].id, productName: products[0].name, sku: products[0].sku, type: 'import', changeAmount: 200, oldStock: 0, newStock: 200, referenceCode: 'PN-2402-001', date: daysAgo(15), timestamp: Date.now(), note: 'Nhập hàng đầu kỳ', createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('invlog'), productId: products[0].id, productName: products[0].name, sku: products[0].sku, type: 'export', changeAmount: -10, oldStock: 200, newStock: 190, referenceCode: 'PX-2402-001', date: daysAgo(5), timestamp: Date.now(), note: 'Xuất bán', createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('invlog'), productId: products[0].id, productName: products[0].name, sku: products[0].sku, type: 'export', changeAmount: -20, oldStock: 190, newStock: 170, referenceCode: 'PX-2402-002', date: getCurrentDate(), timestamp: Date.now(), note: 'Xuất bán một phần', createdAt: Date.now(), updatedAt: Date.now() },
        { id: generateUUID('invlog'), productId: products[0].id, productName: products[0].name, sku: products[0].sku, type: 'adjust', changeAmount: -20, oldStock: 170, newStock: 150, referenceCode: 'ADJ-001', date: getCurrentDate(), timestamp: Date.now(), note: 'Hàng lỗi, xuất hủy', createdAt: Date.now(), updatedAt: Date.now() }
    ];

    // Clear and Seed
    await (db as any).transaction('rw', [db.products, db.partners, db.orders, db.transactions, db.debtRecords, db.inventoryLogs, db.auditLogs, db.notifications, db.deliveryNotes, db.quotes, db.importOrders], async () => {
        await db.products.clear();
        await db.partners.clear();
        await db.orders.clear();
        await db.transactions.clear();
        await db.debtRecords.clear();
        await db.inventoryLogs.clear();
        await db.auditLogs.clear();
        await db.notifications.clear();
        await db.deliveryNotes.clear();
        await db.quotes.clear();
        await db.importOrders.clear();

        await db.products.bulkAdd(products);
        await db.partners.bulkAdd(partners);
        await db.orders.bulkAdd(orders);
        await db.transactions.bulkAdd(transactions);
        await db.debtRecords.bulkAdd(debts);
        await db.importOrders.bulkAdd(imports);
        await db.quotes.bulkAdd(quotes);
        await db.deliveryNotes.bulkAdd(deliveryNotes);
        await db.inventoryLogs.bulkAdd(inventoryLogs);
    });

    console.log("Database seeded successfully with Rich Mock Data.");
};