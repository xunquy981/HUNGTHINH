
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Primitives';
import { Product, ImportItem } from '../../types';
import { forecastDemand } from '../../services/ai';
import { formatCurrency, getCurrentDate, addDays, formatDateISO } from '../../utils/helpers';
import { useApp as useAppContext } from '../../hooks/useApp';
import { CreateImportModal } from '../ImportModals';

interface SmartRestockModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SmartRestockModal: React.FC<SmartRestockModalProps> = ({ isOpen, onClose }) => {
    const { showNotification } = useAppContext();
    const [suggestions, setSuggestions] = useState<(ImportItem & { reasoning: string, confidence: string })[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    // Get low stock products
    const products = useLiveQuery(() => db.products.filter(p => !p.isDeleted && p.stock <= (p.minStock || 10)).toArray()) || [];

    useEffect(() => {
        if (isOpen) {
            setSuggestions([]);
            setProgress(0);
        }
    }, [isOpen]);

    const runAnalysis = async () => {
        if (products.length === 0) return;
        setIsAnalyzing(true);
        const results: any[] = [];
        
        // Calculate date range for sales history (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = formatDateISO(addDays(today, -30));
        
        // Batch fetch orders once
        const orders = await db.orders.where('date').aboveOrEqual(thirtyDaysAgo).toArray();

        for (let i = 0; i < products.length; i++) {
            const p = products[i];
            
            // Build sales history for this product
            const historyMap: Record<string, number> = {};
            orders.forEach(o => {
                const item = o.items.find((it: any) => it.id === p.id || it.sku === p.sku);
                if (item) {
                    historyMap[o.date] = (historyMap[o.date] || 0) + item.quantity;
                }
            });
            
            const historyArray = Object.entries(historyMap).map(([d, q]) => ({ date: d, qty: q }));
            
            // AI Forecast
            const forecast = await forecastDemand(p, historyArray);
            
            if (forecast.quantity > 0) {
                results.push({
                    id: p.id,
                    sku: p.sku,
                    productName: p.name,
                    unit: p.unit || 'Cái',
                    price: p.importPrice,
                    quantity: forecast.quantity,
                    total: forecast.quantity * p.importPrice,
                    reasoning: forecast.reasoning,
                    confidence: forecast.confidence
                });
            }
            
            setProgress(Math.round(((i + 1) / products.length) * 100));
        }

        setSuggestions(results);
        setIsAnalyzing(false);
    };

    const handleCreateImport = () => {
        setIsImportModalOpen(true);
    };

    const removeItem = (id: string) => {
        setSuggestions(prev => prev.filter(i => i.id !== id));
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title="Dự Báo Nhập Hàng Thông Minh"
                subtitle="Powered by Gemini 3.0"
                size="2xl"
                footer={
                    <div className="flex justify-between w-full">
                        <Button variant="secondary" onClick={onClose}>Đóng</Button>
                        <Button 
                            variant="primary" 
                            onClick={handleCreateImport} 
                            disabled={suggestions.length === 0} 
                            className="bg-indigo-600"
                            icon="add_shopping_cart"
                        >
                            Tạo phiếu nhập từ gợi ý
                        </Button>
                    </div>
                }
            >
                <div className="space-y-6">
                    {/* Control Panel */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 text-center">
                        <div className="flex justify-center mb-4">
                            <div className="size-16 rounded-3xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
                                <span className="material-symbols-outlined text-[32px]">online_prediction</span>
                            </div>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Phân tích nhu cầu</h3>
                        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
                            AI sẽ phân tích lịch sử bán hàng 30 ngày gần nhất và xu hướng thị trường để đề xuất số lượng nhập tối ưu cho {products.length} sản phẩm đang cạn kho.
                        </p>
                        
                        {!isAnalyzing && suggestions.length === 0 ? (
                            <Button variant="primary" onClick={runAnalysis} className="px-8 h-12 rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/30 font-black uppercase tracking-widest">
                                Bắt đầu phân tích
                            </Button>
                        ) : isAnalyzing ? (
                            <div className="max-w-xs mx-auto">
                                <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
                                    <span>Đang xử lý...</span>
                                    <span>{progress}%</span>
                                </div>
                                <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs font-bold text-emerald-600 bg-emerald-50 inline-block px-3 py-1 rounded-lg">
                                Đã tìm thấy {suggestions.length} đề xuất nhập hàng
                            </div>
                        )}
                    </div>

                    {/* Results Table */}
                    {suggestions.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                    <tr>
                                        <th className="px-4 py-3">Sản phẩm</th>
                                        <th className="px-4 py-3 text-center">Gợi ý nhập</th>
                                        <th className="px-4 py-3">Lý do AI</th>
                                        <th className="px-4 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {suggestions.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{item.productName}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">{item.sku}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="font-black text-indigo-600 text-lg">{item.quantity}</span>
                                                <span className="text-[9px] text-slate-400 block">{item.unit}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">"{item.reasoning}"</p>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <span className={`size-1.5 rounded-full ${item.confidence === 'high' ? 'bg-emerald-500' : item.confidence === 'medium' ? 'bg-amber-500' : 'bg-rose-500'}`}></span>
                                                    <span className="text-[9px] text-slate-400 font-bold uppercase">Độ tin cậy: {item.confidence}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-rose-500">
                                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>

            <CreateImportModal 
                isOpen={isImportModalOpen} 
                onClose={() => setIsImportModalOpen(false)} 
                initialItems={suggestions}
            />
        </>
    );
};
