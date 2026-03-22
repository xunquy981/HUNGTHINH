
import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', width, height, circle }) => {
  return (
    <div 
      className={`shimmer bg-slate-200 dark:bg-slate-800 ${circle ? 'rounded-full' : 'rounded-2xl'} ${className}`}
      style={{ width, height }}
    />
  );
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
    <div className="w-full space-y-2 p-4">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <Skeleton width={48} height={48} className="rounded-xl shrink-0" />
                <div className="flex-1 space-y-3 min-w-0">
                    <Skeleton width="40%" height={16} />
                    <Skeleton width="20%" height={10} />
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    <Skeleton width={100} height={16} />
                    <Skeleton width={60} height={10} />
                </div>
            </div>
        ))}
    </div>
);

export const DetailSkeleton: React.FC = () => (
    <div className="space-y-10 p-2 animate-premium">
        {/* Header */}
        <div className="flex justify-between items-start">
            <div className="space-y-4">
                <Skeleton width={300} height={40} />
                <Skeleton width={180} height={20} />
            </div>
            <div className="flex gap-3">
                <Skeleton width={40} height={40} circle />
                <Skeleton width={40} height={40} circle />
            </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 gap-6">
            <Skeleton height={140} className="w-full" />
            <Skeleton height={140} className="w-full" />
        </div>

        {/* Content Body */}
        <div className="space-y-6">
            <div className="flex justify-between items-center px-2">
                <Skeleton width={180} height={24} />
                <Skeleton width={80} height={24} />
            </div>
            <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-4xl p-6 space-y-6">
                <Skeleton width="100%" height={50} />
                <Skeleton width="100%" height={50} />
                <Skeleton width="100%" height={50} />
            </div>
        </div>
    </div>
);
