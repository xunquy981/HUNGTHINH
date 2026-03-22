
import { db } from './db';
import { formatDateISO, getCurrentDate, addDays, normalizeOrder, parseISOToDate, getDaysDiff } from '../utils/helpers';
import { Product, Order, Transaction, DebtRecord } from '../types';

export interface DashboardData {
    kpis: {
        realRevenue: number;
        grossProfit: number;
        cashIn: number;
        cashOut: number;
        netCashFlow: number;
        ar: number;
        ap: number;
        orderCount: number;
    };
    chartData: {
        date: string;
        label: string;
        revenue: number;
        profit: number;
        cashIn: number;
        cashOut: number;
    }[];
    aging: {
        ar: { onTime: number; over7: number; over30: number; over90: number };
        ap: { onTime: number; over7: number; over30: number; over90: number };
    };
    topProducts: { name: string; qty: number; revenue: number }[];
    lowStockList: Product[];
    todo: {
        pendingOrders: number;
        shippingDeliveries: number;
        pendingQuotes: number;
        overdueDebts: number;
    };
}

export const getDashboardMetrics = async (startDate: string, endDate: string): Promise<DashboardData> => {
    // 1. Fetch Data in Parallel (Optimized Queries)
    const [rawOrders, transactions, allDebts, allProducts] = await Promise.all([
        db.orders
            .where('date')
            .between(startDate, endDate, true, true)
            .filter(o => !o.isDeleted && o.status !== 'Cancelled')
            .toArray(),
        db.transactions
            .where('date')
            .between(startDate, endDate, true, true)
            .toArray(),
        // Optimized: Only fetch active debts (not Void)
        db.debtRecords
            .where('status').notEqual('Void')
            .filter(d => d.remainingAmount > 0)
            .toArray(),
        db.products
            .filter(p => !p.isDeleted)
            .toArray()
    ]) as [Order[], Transaction[], DebtRecord[], Product[]];

    // 2. Prepare Product Map for Cost Calculation
    const productMap = new Map<string, Product>(allProducts.map(p => [p.id, p]));

    // 3. Initialize Aggregation Containers
    let realRevenue = 0;
    let grossProfit = 0;
    let completedOrderCount = 0;
    const productPerformance: Record<string, { name: string, qty: number, revenue: number }> = {};
    
    const dateMap: Record<string, any> = {};
    const start = parseISOToDate(startDate)!;
    const end = parseISOToDate(endDate)!;
    const dayDiff = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    
    for (let i = 0; i <= dayDiff; i++) {
        const d = addDays(start, i);
        const iso = formatDateISO(d);
        dateMap[iso] = { 
            date: iso, 
            label: `${d.getDate()}/${d.getMonth() + 1}`, 
            revenue: 0, profit: 0, cashIn: 0, cashOut: 0 
        };
    }

    // 4. Process Orders
    rawOrders.forEach(rawOrder => {
        const o = normalizeOrder(rawOrder);
        const isoDate = o.date;

        if (o.status === 'Completed') {
            realRevenue += o.total;
            completedOrderCount++;

            let orderCost = 0;
            o.items?.forEach((i: any) => {
                let unitCost = i.costPrice;
                if (!unitCost || unitCost === 0) {
                    const p = productMap.get(i.id);
                    unitCost = p ? p.importPrice : 0;
                }
                orderCost += (unitCost * (i.quantity || 0));

                if (i.sku) {
                    if (!productPerformance[i.sku]) productPerformance[i.sku] = { name: i.productName || 'Unknown', qty: 0, revenue: 0 };
                    productPerformance[i.sku].qty += i.quantity || 0;
                    productPerformance[i.sku].revenue += i.total || 0;
                }
            });

            const profit = o.total - orderCost;
            grossProfit += profit;

            if (dateMap[isoDate]) {
                dateMap[isoDate].revenue += o.total;
                dateMap[isoDate].profit += profit;
            }
        }
    });

    // 5. Process Transactions
    let cashIn = 0;
    let cashOut = 0;

    transactions.forEach(t => {
        const isoDate = t.date;
        if (t.type === 'income') {
            cashIn += t.amount;
            if (dateMap[isoDate]) dateMap[isoDate].cashIn += t.amount;
        } else {
            cashOut += t.amount;
            if (dateMap[isoDate]) dateMap[isoDate].cashOut += t.amount;
        }
    });

    // 6. Process Debts (Aging)
    const today = new Date();
    const aging = {
        ar: { onTime: 0, over7: 0, over30: 0, over90: 0 },
        ap: { onTime: 0, over7: 0, over30: 0, over90: 0 }
    };

    let totalAR = 0;
    let totalAP = 0;
    let overdueCount = 0;

    allDebts.forEach(d => {
        const dueDate = parseISOToDate(d.dueDate);
        const daysOverdue = dueDate ? getDaysDiff(today, dueDate) : 0;
        
        const target = d.type === 'Receivable' ? aging.ar : aging.ap;
        const amount = d.remainingAmount;

        if (d.type === 'Receivable') totalAR += amount;
        else totalAP += amount;

        if (daysOverdue <= 0) target.onTime += amount;
        else if (daysOverdue <= 7) target.over7 += amount;
        else if (daysOverdue <= 30) target.over30 += amount;
        else target.over90 += amount;

        if (daysOverdue > 0 && d.type === 'Receivable') overdueCount++;
    });

    // 7. Inventory Alerts & Todo (Optimized: Use Index counts)
    // Low stock filter still runs on allProducts, but that array is already in memory from Step 1.
    const lowStockList = allProducts.filter(p => p.stock <= (p.minStock || 5));
    
    // Use .count() queries which are very fast
    const [pendingOrders, shippingDeliveries, pendingQuotes] = await Promise.all([
        db.orders.where('status').equals('Processing').count(),
        db.deliveryNotes.where('status').equals('Shipping').count(),
        db.quotes.where('status').anyOf('Draft', 'Sent').count()
    ]);

    return {
        kpis: {
            realRevenue, grossProfit, cashIn, cashOut,
            netCashFlow: cashIn - cashOut,
            ar: totalAR, ap: totalAP,
            orderCount: completedOrderCount
        },
        chartData: Object.values(dateMap),
        aging,
        topProducts: Object.values(productPerformance).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
        lowStockList: lowStockList.sort((a, b) => a.stock - b.stock).slice(0, 5),
        todo: { pendingOrders, shippingDeliveries, pendingQuotes, overdueDebts: overdueCount }
    };
};
