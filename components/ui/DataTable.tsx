
import React from 'react';
import { TOKENS } from './Tokens';
import { TableSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface SortItem {
  key: string;
  direction: 'asc' | 'desc';
}

export interface ColumnDef<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  filterable?: boolean;
  // Cấu hình hiển thị trên Mobile
  mobileLabel?: string; // Nhãn hiển thị trên mobile (VD: "Giá:")
  hideOnMobile?: boolean; // Ẩn cột này trên mobile
  isMobileTitle?: boolean; // Dùng làm tiêu đề chính của Card mobile
  isMobileSubtitle?: boolean; // Dùng làm tiêu đề phụ
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  emptyIcon?: string;
  className?: string;
  maxHeight?: string;
  sort?: {
    items: SortItem[];
    onSort: (key: string, isShift: boolean) => void;
  };
  columnFilters?: Record<string, string>;
  onColumnFilterChange?: (key: string, value: string) => void;
  rowClassName?: (item: T) => string;
}

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  isLoading,
  onRowClick,
  emptyMessage = "Không tìm thấy dữ liệu",
  emptyIcon = "search_off",
  className = '',
  maxHeight = 'calc(100vh - 350px)',
  sort,
  columnFilters,
  onColumnFilterChange,
  rowClassName
}: DataTableProps<T>) {
  if (isLoading) return <TableSkeleton rows={10} />;

  if (!data || data.length === 0) {
    return <EmptyState title="Danh sách trống" description={emptyMessage} icon={emptyIcon} />;
  }

  const handleHeaderClick = (col: ColumnDef<T>, e: React.MouseEvent) => {
    if (col.sortable && sort && col.accessorKey) {
      sort.onSort(String(col.accessorKey), e.shiftKey);
    }
  };

  // --- MOBILE CARD RENDER ---
  const renderMobileCard = (item: T, index: number) => {
    const titleCol = columns.find(c => c.isMobileTitle) || columns[0];
    const subTitleCol = columns.find(c => c.isMobileSubtitle);
    const otherCols = columns.filter(c => c !== titleCol && c !== subTitleCol && !c.hideOnMobile);

    return (
      <div 
        key={item.id}
        onClick={() => onRowClick?.(item)}
        className={`bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-3 active:scale-[0.98] transition-all ${onRowClick ? 'cursor-pointer' : ''}`}
      >
        <div className="flex justify-between items-start mb-2">
            <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 dark:text-white text-sm truncate">
                    {titleCol.cell ? titleCol.cell(item, index) : String(item[titleCol.accessorKey as keyof T] || '')}
                </div>
                {subTitleCol && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {subTitleCol.cell ? subTitleCol.cell(item, index) : String(item[subTitleCol.accessorKey as keyof T] || '')}
                    </div>
                )}
            </div>
            {/* Action column usually is the last one */}
            {columns[columns.length - 1].header === '' && (
                <div className="shrink-0 ml-2">
                    {columns[columns.length - 1].cell?.(item, index)}
                </div>
            )}
        </div>
        
        <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            {otherCols.map((col, idx) => {
                if(col.header === '') return null; // Skip action col (handled above)
                return (
                    <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">{col.mobileLabel || col.header}</span>
                        <div className="font-bold text-slate-700 dark:text-slate-200 text-right">
                            {col.cell ? col.cell(item, index) : String(item[col.accessorKey as keyof T] || '---')}
                        </div>
                    </div>
                );
            })}
        </div>
      </div>
    );
  };

  return (
    <div className={`w-full h-full flex flex-col ${className}`}>
      {/* DESKTOP VIEW (Hidden on Mobile) */}
      <div className={`hidden md:block w-full overflow-hidden border ${TOKENS.COLORS.BORDER.LIGHT} ${TOKENS.RADIUS.CARD} bg-white dark:bg-slate-900 shadow-sm flex-1`}>
        <div className="overflow-auto custom-scrollbar h-full" style={{ maxHeight }}>
          <table className="w-full text-left border-separate border-spacing-0 min-w-full">
            <thead className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
              <tr>
                {columns.map((col, idx) => {
                  const sortItem = sort?.items.find(s => s.key === col.accessorKey);
                  const isSorted = !!sortItem;

                  return (
                    <th 
                      key={idx} 
                      className={`px-6 pt-4 pb-3 border-b ${TOKENS.COLORS.BORDER.LIGHT} ${col.width || ''} group/header sticky top-0 bg-inherit`}
                    >
                      <div 
                        onClick={(e) => handleHeaderClick(col, e)}
                        className={`flex items-center gap-1.5 mb-2 ${col.sortable ? 'cursor-pointer select-none' : ''} ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}
                      >
                          <span className={`${TOKENS.TEXT.SUBHEADING} whitespace-nowrap group-hover/header:text-indigo-600 transition-colors`}>
                              {col.header}
                          </span>
                          {col.sortable && (
                              <span className={`material-symbols-outlined text-[16px] transition-all ${isSorted ? 'text-indigo-600 dark:text-indigo-400 opacity-100' : 'opacity-0 group-hover/header:opacity-30'}`}>
                                  {sortItem?.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                              </span>
                          )}
                      </div>

                      {/* Quick Filter Input */}
                      {col.filterable && onColumnFilterChange && col.accessorKey && (
                          <div className="relative" onClick={e => e.stopPropagation()}>
                              <input 
                                  type="text"
                                  value={columnFilters?.[String(col.accessorKey)] || ''}
                                  onChange={(e) => onColumnFilterChange(String(col.accessorKey), e.target.value)}
                                  className="w-full h-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                                  placeholder={`Lọc...`}
                              />
                              {columnFilters?.[String(col.accessorKey)] && (
                                  <button 
                                      onClick={() => onColumnFilterChange(String(col.accessorKey), '')}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
                                  >
                                      <span className="material-symbols-outlined text-[14px]">close</span>
                                  </button>
                              )}
                          </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr 
                  key={item.id} 
                  onClick={() => onRowClick?.(item)}
                  className={`group transition-all duration-200 ${onRowClick ? 'cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10' : ''} ${rowClassName ? rowClassName(item) : ''}`}
                >
                  {columns.map((col, idx) => (
                    <td 
                      key={idx} 
                      className={`px-6 py-4 ${index !== data.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''} ${TOKENS.TEXT.BODY} text-${col.align || 'left'} truncate whitespace-nowrap`}
                    >
                      {col.cell ? col.cell(item, index) : (col.accessorKey ? String(item[col.accessorKey] || '---') : '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOBILE VIEW (Visible on Mobile) */}
      <div className="md:hidden flex-1 overflow-y-auto custom-scrollbar pb-20">
          {data.map((item, index) => renderMobileCard(item, index))}
      </div>
    </div>
  );
}
