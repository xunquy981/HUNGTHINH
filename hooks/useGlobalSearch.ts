
import { useState, useEffect } from 'react';
import { db } from '../services/db';
import { ViewState } from '../types';

export interface SearchResult {
  id: string;
  type: 'ORDER' | 'QUOTE' | 'PARTNER' | 'PRODUCT' | 'DELIVERY' | 'IMPORT';
  title: string;
  subtitle: string;
  view: ViewState;
  icon: string;
  status?: string;
  code?: string;
}

export const useGlobalSearch = (query: string) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // PERFORMANCE: Use Multi-Entry Index 'searchWords' for blazing fast queries.
        // Dexie's startsWith on a multi-entry index matches if ANY word in the array starts with the query.
        
        const limit = 5;

        // Parallel queries using Indexes
        const [orders, quotes, partners, products, deliveries, imports] = await Promise.all([
            // Orders: Search by Code OR searchWords index
            db.orders.where('searchWords').startsWithIgnoreCase(trimmedQuery).limit(limit).toArray(),
            
            // Quotes: Code
            db.quotes.where('code').startsWithIgnoreCase(trimmedQuery).limit(limit).toArray(),
            
            // Partners: searchWords index
            db.partners.where('searchWords').startsWithIgnoreCase(trimmedQuery).limit(limit).toArray(),
            
            // Products: searchWords index (covers SKU, Name, Brand)
            db.products.where('searchWords').startsWithIgnoreCase(trimmedQuery).limit(limit).toArray(),
            
            // Deliveries: Code
            db.deliveryNotes.where('code').startsWithIgnoreCase(trimmedQuery).limit(limit).toArray(),
            
            // Imports: Code
            db.importOrders.where('code').startsWithIgnoreCase(trimmedQuery).limit(limit).toArray()
        ]);

        const formattedResults: SearchResult[] = [
          ...orders.map(o => ({
            id: o.id,
            type: 'ORDER' as const,
            title: `Đơn hàng ${o.code}`,
            subtitle: `${o.customerName} • ${o.total.toLocaleString()}đ`,
            view: 'ORDERS' as ViewState,
            icon: 'receipt_long',
            status: o.status,
            code: o.code
          })),
          ...quotes.map(q => ({
            id: q.id,
            type: 'QUOTE' as const,
            title: `Báo giá ${q.code}`,
            subtitle: `${q.customerName} • ${q.validUntil}`,
            view: 'QUOTES' as ViewState,
            icon: 'request_quote',
            status: q.status,
            code: q.code
          })),
          ...partners.map(p => ({
            id: p.id,
            type: 'PARTNER' as const,
            title: p.name,
            subtitle: `${p.code} • ${p.phone}`,
            view: 'PARTNERS' as ViewState,
            icon: 'groups',
            code: p.code
          })),
          ...products.map(p => ({
            id: p.id,
            type: 'PRODUCT' as const,
            title: p.name,
            subtitle: `${p.sku} • Tồn: ${p.stock}`,
            view: 'INVENTORY' as ViewState,
            icon: 'inventory_2',
            code: p.sku
          })),
          ...deliveries.map(d => ({
            id: d.id,
            type: 'DELIVERY' as const,
            title: `Phiếu giao ${d.code}`,
            subtitle: `${d.customerName} (${d.orderCode})`,
            view: 'DELIVERY_NOTES' as ViewState,
            icon: 'local_shipping',
            status: d.status,
            code: d.code
          })),
          ...imports.map(i => ({
            id: i.id,
            type: 'IMPORT' as const,
            title: `Phiếu nhập ${i.code}`,
            subtitle: `${i.supplierName} • ${i.total.toLocaleString()}đ`,
            view: 'IMPORTS' as ViewState,
            icon: 'input',
            status: i.status,
            code: i.code
          }))
        ];

        setResults(formattedResults);
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, isSearching };
};
