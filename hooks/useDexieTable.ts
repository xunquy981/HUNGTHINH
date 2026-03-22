
import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Table, Collection } from 'dexie';

export interface SortItem {
  key: string;
  direction: 'asc' | 'desc';
}

interface UseDexieTableProps<T> {
  table: Table<T, any>;
  itemsPerPage?: number;
  filterFn?: (item: T) => boolean;
  defaultSort?: string;
  includeDeleted?: boolean;
  indexedKeys?: string[];
  searchQuery?: string; // NEW: Explicit search query support
}

export function useDexieTable<T extends { id: string | number }>(props: UseDexieTableProps<T>) {
  const { table, itemsPerPage = 10, filterFn, defaultSort = 'id', includeDeleted = false, indexedKeys, searchQuery } = props;

  const [currentPage, setCurrentPage] = useState(1);
  const [sortState, setSortState] = useState<SortItem[]>([{ key: defaultSort, direction: 'desc' }]);

  // 1. Reset Page on Filter Change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterFn, includeDeleted, searchQuery]);

  // Helper: Verify if a key is safe to sort by
  const getSafeSortKey = useCallback((requestedKey: string): string => {
      if (!table || !table.schema) return 'id';
      
      const schema = table.schema;
      const validKeys = new Set<string>();
      
      if (schema.primKey.keyPath) {
          if (Array.isArray(schema.primKey.keyPath)) {
              schema.primKey.keyPath.forEach(k => validKeys.add(k));
          } else {
              validKeys.add(schema.primKey.keyPath);
          }
      }
      
      schema.indexes.forEach(idx => {
          if (Array.isArray(idx.keyPath)) {
              idx.keyPath.forEach(k => validKeys.add(k));
          } else if (typeof idx.keyPath === 'string') {
              validKeys.add(idx.keyPath);
          }
      });

      if (indexedKeys) indexedKeys.forEach(k => validKeys.add(k));

      if (validKeys.has(requestedKey)) return requestedKey;
      if (validKeys.has('createdAt')) return 'createdAt';
      if (validKeys.has('updatedAt')) return 'updatedAt';
      if (validKeys.has('id')) return 'id';
      
      // Fix: Ensure keyPath is a string before using it as fallback
      if (typeof schema.primKey.keyPath === 'string') return schema.primKey.keyPath;
      return 'id';
  }, [table, indexedKeys]);

  // Fetch Data Live
  const result = useLiveQuery(async () => {
    let collection: Collection<T, any>;
    
    // PERFORMANCE OPTIMIZATION:
    // If there is a search query, use the Multi-Entry Index 'searchWords' directly.
    if (searchQuery && searchQuery.trim().length > 0 && (table.schema.indexes.some(idx => idx.name === 'searchWords'))) {
        collection = table.where('searchWords').startsWithIgnoreCase(searchQuery.trim());
    } else {
        // Standard Sort path
        const primarySort = sortState[0];
        const safeKey = getSafeSortKey(primarySort?.key || defaultSort);

        if (safeKey) {
            collection = table.orderBy(safeKey);
            if (primarySort?.direction === 'desc') {
                collection = collection.reverse();
            }
        } else {
            collection = table.toCollection().reverse(); 
        }
    }

    // Apply Soft Delete & Custom Filters
    collection = collection.filter((item: any) => {
        if (!includeDeleted && item.isDeleted) return false;
        if (filterFn && !filterFn(item)) return false;
        return true;
    });

    // Count Total (Efficient)
    const count = await collection.count();

    // Pagination
    const offset = (currentPage - 1) * itemsPerPage;
    const items = await collection.offset(offset).limit(itemsPerPage).toArray();

    // Secondary Sort (In-Memory for current page)
    if (searchQuery || sortState.length > 1) {
        items.sort((a: any, b: any) => {
            for (const sort of sortState) {
                const valA = a[sort.key];
                const valB = b[sort.key];
                
                if (valA === valB) continue;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }

    return { data: items, totalItems: count };
  }, [table, currentPage, itemsPerPage, sortState, filterFn, includeDeleted, getSafeSortKey, searchQuery]);

  const isLoading = result === undefined;
  const { data = [], totalItems = 0 } = result || {};

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Clamp Page
  useEffect(() => {
      if (totalPages > 0 && currentPage > totalPages) {
          setCurrentPage(totalPages);
      } else if (totalPages > 0 && currentPage < 1) {
          setCurrentPage(1);
      }
  }, [totalPages, currentPage]);

  const handleSort = (key: string, isShift: boolean) => {
      setSortState(prev => {
          const existingIdx = prev.findIndex(s => s.key === key);
          if (!isShift) {
              if (existingIdx !== -1 && existingIdx === 0) {
                  return [{ key, direction: prev[0].direction === 'asc' ? 'desc' : 'asc' }];
              } else {
                  return [{ key, direction: 'desc' }];
              }
          } else {
              const newSort = [...prev];
              if (existingIdx !== -1) {
                  newSort[existingIdx] = { 
                      ...newSort[existingIdx], 
                      direction: newSort[existingIdx].direction === 'asc' ? 'desc' : 'asc' 
                  };
              } else {
                  if (newSort.length < 3) newSort.push({ key, direction: 'desc' });
              }
              return newSort;
          }
      });
      setCurrentPage(1);
  };

  return {
    data,
    totalItems,
    totalPages,
    currentPage,
    setCurrentPage,
    sortState,
    setSortState,
    requestSort: handleSort,
    isLoading
  };
}
