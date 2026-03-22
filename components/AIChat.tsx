
import React, { useState, useRef, useEffect } from 'react';
import { db } from '../services/db';
import { ViewState } from '../types';
import { formatCurrency, getCurrentDate } from '../utils/helpers';
import { getAiClient, handleAiError } from '../services/ai';

interface AIChatProps {
    currentView?: ViewState;
}

const AIChat: React.FC<AIChatProps> = ({ currentView = 'DASHBOARD' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([
        { role: 'model', text: 'Xin chào! Tôi là Trợ lý AI của Sếp XunQuy. Tôi có thể giúp gì cho Sếp hôm nay?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading, isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const getContextData = async () => {
        const orders = await db.orders.filter(o => o.status !== 'Cancelled').reverse().limit(50).toArray();
        const products = await db.products.filter(p => !p.isDeleted).limit(100).toArray();
        const debts = await db.debtRecords.limit(50).toArray();
        const partnerCount = await db.partners.count();

        const totalRevenue = orders.reduce((s,o) => s + o.total, 0);
        const totalReceivable = debts.filter(d => d.type === 'Receivable').reduce((s,d) => s + d.remainingAmount, 0);
        
        const todayStr = getCurrentDate();
        const todayOrders = orders.filter(o => o.date === todayStr);

        const productSales: Record<string, number> = {};
        orders.forEach(o => {
            o.items.forEach(i => {
                productSales[i.productName] = (productSales[i.productName] || 0) + i.quantity;
            });
        });
        const topProducts = Object.entries(productSales)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([name, qty]) => `- ${name}: ${qty} cái`)
            .join('\n');

        const lowStockItems = products
            .filter(p => p.stock <= (p.minStock || 10))
            .sort((a,b) => a.stock - b.stock)
            .slice(0, 5)
            .map(p => `- ${p.name} (Tồn: ${p.stock})`)
            .join('\n');
        
        let specificContext = "";
        
        switch(currentView) {
            case 'INVENTORY': specificContext = `Màn hình KHO HÀNG.`; break;
            case 'DEBTS': specificContext = `Màn hình CÔNG NỢ. Tổng phải thu ${formatCurrency(totalReceivable)}.`; break;
            case 'ORDERS': specificContext = `Màn hình ĐƠN HÀNG. Hôm nay có ${todayOrders.length} đơn.`; break;
            case 'PARTNERS': specificContext = `Màn hình ĐỐI TÁC. Chi tiết: ${partnerCount} đối tác.`; break;
            default: specificContext = `Màn hình TỔNG QUAN.`;
        }

        return `
            HỆ THỐNG ERP HƯNG THỊNH - BÁO CÁO NHANH:
            THỜI GIAN: ${new Date().toLocaleString('vi-VN')}
            TÀI CHÍNH: Doanh thu (mẫu): ${formatCurrency(totalRevenue)}, Tổng nợ phải thu: ${formatCurrency(totalReceivable)}
            TOP SẢN PHẨM: ${topProducts || "Chưa có dữ liệu"}
            CẢNH BÁO KHO: ${lowStockItems || "Kho ổn định"}
            NGỮ CẢNH: ${specificContext}
        `;
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setInput('');
        setIsLoading(true);

        try {
            // Retrieve AI client safely via service
            const ai = await getAiClient();
            const context = await getContextData();

            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview', // Use Thinking model for better chat reasoning
                contents: [
                    { role: 'user', parts: [{ text: context }] },
                    ...messages.slice(-6).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                    { role: 'user', parts: [{ text: userMsg }] }
                ],
                config: {
                    systemInstruction: "Bạn là chuyên gia phân tích dữ liệu ERP cho Cửa hàng Bạc Đạn Hưng Thịnh. Trả lời ngắn gọn, tập trung vào số liệu. Luôn xưng 'Em' và gọi 'Sếp'. Sử dụng Thinking Mode để suy luận kỹ câu hỏi của người dùng trước khi trả lời.",
                    thinkingConfig: { thinkingBudget: 32768 },
                }
            });

            const aiText = response.text || "Xin lỗi Sếp, em chưa hiểu ý ạ.";
            setMessages(prev => [...prev, { role: 'model', text: aiText }]);
        } catch (err: any) {
            const friendlyMsg = handleAiError(err);
            setMessages(prev => [...prev, { role: 'model', text: friendlyMsg }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`relative size-10 rounded-full flex items-center justify-center transition-all ${
                    isOpen 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 rotate-180' 
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105'
                }`}
                title="Trợ lý AI"
            >
                <span className={`material-symbols-outlined text-[24px] ${isOpen ? 'filled-icon' : ''}`}>smart_toy</span>
                {!isOpen && (
                     <span className="absolute top-0 right-0 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white dark:border-slate-900"></span>
                     </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-3 w-[380px] h-[550px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out] z-dropdown origin-top-right">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="size-9 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 shadow-inner">
                                <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-sm">Trợ lý AI XunQuy</h3>
                                <div className="flex items-center gap-1.5">
                                    <span className="size-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                    <span className="text-[10px] text-blue-100 font-medium uppercase tracking-widest">Thinking Mode</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white">
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50 dark:bg-slate-900/50">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                    m.role === 'user' 
                                        ? 'bg-blue-600 text-white rounded-tr-none' 
                                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none whitespace-pre-wrap'
                                }`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700 flex flex-col gap-2 shadow-sm">
                                    <div className="flex gap-1.5">
                                        <span className="size-2 bg-indigo-400 rounded-full animate-bounce"></span>
                                        <span className="size-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                        <span className="size-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Đang suy luận...</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shrink-0">
                        <div className="relative flex items-center">
                            <input 
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                                placeholder="Hỏi AI về cửa hàng..."
                                className="w-full bg-slate-100 dark:bg-slate-700 border-none rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-blue-500/50 transition-all font-medium text-slate-900 dark:text-white"
                                autoFocus
                            />
                            <button 
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="absolute right-2 p-1.5 bg-blue-600 text-white rounded-lg shadow-md disabled:opacity-50 hover:bg-blue-700 transition-all"
                            >
                                <span className="material-symbols-outlined text-[18px] block">send</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AIChat;
