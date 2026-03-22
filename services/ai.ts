
import { GoogleGenAI, Type } from "@google/genai";
import { Product, Order, ImportItem, ViewState, ErrorLog, AppNotification, DebtRecord } from '../types';
import { formatCurrency } from '../utils/helpers';
import { db } from './db';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// --- CENTRALIZED AI CLIENT ---
// Fetches API Key from environment variable.
export const getAiClient = async () => {
    // API key must be obtained exclusively from the environment variable process.env.API_KEY.
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        throw new Error("MISSING_KEY");
    }
    // Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
    return new GoogleGenAI({ apiKey });
};

// Standardized Error Handler for UI display
export const handleAiError = (error: any): string => {
    // Security: Do not log the full error object if it contains the key in headers/url
    console.error("AI Operation Failed:", error.message || "Unknown Error");

    const msg = (error.message || '').toLowerCase();
    
    if (msg.includes("missing_key")) {
        return "Chưa cấu hình API Key hệ thống. Vui lòng kiểm tra biến môi trường.";
    }
    if (msg.includes("api key not valid") || msg.includes("unauthenticated")) {
        return "API Key không hợp lệ hoặc đã hết hạn.";
    }
    if (msg.includes("permission denied")) {
        return "API Key không có quyền truy cập model này.";
    }
    if (msg.includes("quota exceeded") || msg.includes("resource exhausted")) {
        return "Hết hạn mức sử dụng API (Quota Exceeded).";
    }
    if (msg.includes("candidate was blocked") || msg.includes("safety")) {
        return "Nội dung bị chặn bởi bộ lọc an toàn.";
    }
    if (msg.includes("failed to fetch") || msg.includes("network")) {
        return "Lỗi kết nối mạng. Vui lòng kiểm tra internet.";
    }
    if (msg.includes("requested entity was not found")) {
        return "Model AI hiện không khả dụng (Not Found).";
    }

    return "Lỗi xử lý AI. Vui lòng thử lại sau.";
};

// --- THINKING MODE CONFIG ---
// Use Gemini 3 Pro for deep reasoning tasks
const THINKING_MODEL = 'gemini-3-pro-preview';
const THINKING_CONFIG = { 
    thinkingConfig: { thinkingBudget: 32768 } // Max budget for deep thought
};

// Use Flash for fast, simple extraction tasks
const FAST_MODEL = 'gemini-3-flash-preview';

export const generateBusinessAdvisorInsight = async (
    data: {
        revenue: number,
        profit: number,
        margin: number,
        orderCount: number,
        topProducts: string[],
        ar: number,
        ap: number,
        lowStockCount: number,
        growthRate?: number,
        operatingExpenses?: number
    }
): Promise<{ text: string, cached: boolean, generatedAt?: number }> => {
    const dateKey = new Date().toISOString().slice(0, 10);
    const cacheKey = `insight-${dateKey}`;

    try {
        const cached = await db.aiCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            return { text: cached.value, cached: true, generatedAt: cached.timestamp };
        }
    } catch (e) {}

    try {
        const ai = await getAiClient();
        const prompt = `
            Vai trò: Giám đốc Tài chính (CFO) & Chiến lược gia ERP cấp cao.
            
            DỮ LIỆU TÀI CHÍNH KỲ NÀY:
            - Doanh thu: ${formatCurrency(data.revenue)}
            - Lợi nhuận ròng: ${formatCurrency(data.profit)}
            - Biên lợi nhuận: ${data.margin.toFixed(1)}%
            - Chi phí vận hành: ${formatCurrency(data.operatingExpenses || 0)}
            - Số đơn hàng: ${data.orderCount}
            - Phải thu (AR): ${formatCurrency(data.ar)}
            - Phải trả (AP): ${formatCurrency(data.ap)}
            - Top sản phẩm: ${data.topProducts.join(', ')}
            - Cảnh báo kho: ${data.lowStockCount} mã thấp
            
            NHIỆM VỤ (THINKING MODE):
            Hãy suy luận sâu về mối quan hệ giữa các con số. Ví dụ: Nếu doanh thu cao mà biên lợi nhuận thấp, có phải do chi phí vận hành hay giá vốn? Nếu AR cao, rủi ro dòng tiền là gì?
            
            KẾT QUẢ ĐẦU RA:
            Viết một bản báo cáo chiến lược ngắn (Markdown), tập trung vào "Insight" (Góc nhìn sâu) và "Action" (Hành động cụ thể).
            Giọng văn: Sắc sảo, chuyên nghiệp, đi thẳng vào vấn đề. Xưng "Em", gọi "Sếp".
        `;

        // Using GenerateContentResponse and .text property as per guidelines
        const response = await ai.models.generateContent({
            model: THINKING_MODEL,
            contents: prompt,
            config: THINKING_CONFIG
        });

        const text = response.text || 'Không có dữ liệu phân tích.';

        await db.aiCache.put({
            key: cacheKey,
            value: text,
            timestamp: Date.now(),
            expiresAt: Date.now() + CACHE_TTL_MS
        });

        return { text, cached: false, generatedAt: Date.now() };
    } catch (error: any) {
        return { text: `Lỗi phân tích: ${handleAiError(error)}`, cached: false };
    }
};

// --- NEW: ANOMALY DETECTION (Advanced AI Agent) ---
export interface AnomalyAlert {
    type: 'margin' | 'inventory' | 'debt' | 'sales';
    severity: 'high' | 'medium' | 'low';
    title: string;
    message: string;
    actionLabel?: string;
}

export const detectBusinessAnomalies = async (
    recentOrders: Order[],
    debts: DebtRecord[],
    products: Product[]
): Promise<AnomalyAlert[]> => {
    try {
        const ai = await getAiClient();
        
        // 1. Pre-process data locally to reduce token usage and noise
        const lowMarginOrders = recentOrders
            .filter(o => o.status === 'Completed')
            .map(o => {
                const cost = o.items.reduce((sum, i) => sum + ((i.costPrice || 0) * i.quantity), 0);
                const revenue = o.total - o.vatAmount; // Net revenue
                const margin = revenue > 0 ? (revenue - cost) / revenue : 0;
                return { code: o.code, margin, total: o.total };
            })
            .filter(o => o.margin < 0.05); // Filter orders with < 5% margin

        const deadStock = products
            .filter(p => p.stock > 20) // Only care if we have stock
            .map(p => ({ name: p.name, stock: p.stock, value: p.stock * p.importPrice }))
            .sort((a,b) => b.value - a.value)
            .slice(0, 10);

        const highRiskDebts = debts
            .filter(d => d.status === 'Overdue' && d.remainingAmount > 5000000)
            .map(d => ({ partner: d.partnerName, amount: d.remainingAmount, days: 30 })); // Simplified days

        // 2. Send summarized findings to AI for reasoning
        const prompt = `
            Hệ thống ERP vừa quét dữ liệu. Hãy phân tích các điểm bất thường sau và tạo cảnh báo:
            
            1. Đơn hàng biên lợi nhuận thấp (<5%): ${JSON.stringify(lowMarginOrders)}
            2. Hàng tồn kho giá trị cao (có thể là hàng chết): ${JSON.stringify(deadStock)}
            3. Nợ xấu rủi ro cao (>5tr): ${JSON.stringify(highRiskDebts)}
            
            NHIỆM VỤ:
            Trả về JSON array các cảnh báo quan trọng nhất (tối đa 3). Chỉ báo cáo những gì thực sự nguy hiểm.
            Schema: [{ "type": "margin|inventory|debt", "severity": "high|medium", "title": "...", "message": "...", "actionLabel": "..." }]
            
            Ví dụ message: "Đơn hàng DH-123 có biên lợi nhuận âm (-2%). Cần kiểm tra lại giá vốn."
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', // Flash is sufficient for structured extraction
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                systemInstruction: "Bạn là hệ thống giám sát rủi ro tự động (Risk Monitor Agent)."
            }
        });

        return JSON.parse(response.text || '[]');
    } catch (error) {
        console.error("Anomaly detection failed", error);
        return [];
    }
};

// --- NEW: SMART RESTOCK FORECASTING ---
export const forecastDemand = async (
    product: Product,
    salesHistory: { date: string, qty: number }[]
): Promise<{ quantity: number, reasoning: string, confidence: 'high' | 'medium' | 'low' }> => {
    try {
        const ai = await getAiClient();
        
        // Calculate basic velocity locally
        const totalSold = salesHistory.reduce((s, i) => s + i.qty, 0);
        const days = salesHistory.length || 1;
        const velocity = totalSold / days; // items per day

        const prompt = `
            Sản phẩm: ${product.name} (Tồn hiện tại: ${product.stock}, Min: ${product.minStock || 5}).
            Lịch sử bán 30 ngày qua (Ngày: SL): ${JSON.stringify(salesHistory.slice(-15))}
            Tốc độ bán bình quân: ${velocity.toFixed(1)} cái/ngày.
            
            NHIỆM VỤ (THINKING MODE):
            Dự báo nhu cầu nhập hàng để đủ bán trong 30 ngày tới.
            Cân nhắc xu hướng (tăng/giảm) từ dữ liệu lịch sử.
            Nếu hàng bán chậm, đề xuất nhập ít hoặc không nhập.
            
            TRẢ VỀ JSON:
            { "quantity": number, "reasoning": "Giải thích ngắn gọn...", "confidence": "high|medium|low" }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', // Flash is fine for simple forecasting
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        return JSON.parse(response.text || '{"quantity": 0, "reasoning": "Lỗi dự báo", "confidence": "low"}');
    } catch (error) {
        return { quantity: 0, reasoning: "Không thể dự báo", confidence: 'low' };
    }
};

export const analyzeErrorLogs = async (logs: ErrorLog[]): Promise<string> => {
    try {
        const ai = await getAiClient();
        const logsText = logs.map(l => `[${new Date(l.timestamp).toISOString()}] ${l.severity.toUpperCase()}: ${l.message} (Route: ${l.route})`).join('\n');
        
        const prompt = `
            Vai trò: Senior DevOps Engineer.
            Nhiệm vụ: Root Cause Analysis (RCA) cho nhật ký lỗi hệ thống ERP.
            
            LOGS:
            ${logsText}
            
            YÊU CẦU:
            Sử dụng khả năng suy luận (Thinking Mode) để kết nối các lỗi rời rạc. Tìm ra nguyên nhân gốc rễ (ví dụ: lỗi mạng dẫn đến lỗi dữ liệu, hay lỗi logic code).
            Đưa ra giải pháp khắc phục cụ thể cho người quản trị.
            Format: Markdown.
        `;

        const response = await ai.models.generateContent({
            model: THINKING_MODEL,
            contents: prompt,
            config: THINKING_CONFIG
        });

        return response.text || 'Không thể phân tích lỗi lúc này.';
    } catch (error: any) {
        return handleAiError(error);
    }
};

export const generateNotificationSummary = async (notifications: AppNotification[]): Promise<string> => {
    try {
        if (notifications.length === 0) return "Hệ thống bình thường, không có thông báo nào cần chú ý.";

        const ai = await getAiClient();
        const notifText = notifications.map(n => `- [${n.severity.toUpperCase()}] ${n.title}: ${n.message}`).join('\n');

        const prompt = `
            Vai trò: Trợ lý Điều hành Thông minh.
            Nhiệm vụ: Đọc danh sách các thông báo hệ thống và tổng hợp thành một bản tin vắn tắt (Briefing) cho Sếp.
            
            DANH SÁCH THÔNG BÁO:
            ${notifText}
            
            YÊU CẦU (THINKING MODE):
            1. Phân loại mức độ ưu tiên. Gom nhóm các vấn đề giống nhau (ví dụ: gom hết các thông báo tồn kho thấp lại).
            2. Viết một đoạn văn ngắn gọn (tối đa 3 câu) tóm tắt tình hình.
            3. Đề xuất hành động ngay lập tức nếu có vấn đề 'DANGER'.
            
            Giọng văn: Nhanh gọn, báo cáo kiểu quân đội/điều hành. Ví dụ: "Báo cáo Sếp, có 3 vấn đề nợ xấu cần xử lý ngay, kho hàng ổn định..."
        `;

        const response = await ai.models.generateContent({
            model: THINKING_MODEL,
            contents: prompt,
            config: THINKING_CONFIG
        });

        return response.text || 'Không thể tổng hợp thông báo.';
    } catch (error: any) {
        return handleAiError(error);
    }
};

export const parseImportDocument = async (
    payload: { 
        mimeType: string, 
        data: string // Base64 or Text content
    }
): Promise<{ supplier: string, items: any[], invoiceNo?: string }> => {
    try {
        const ai = await getAiClient();
        
        // Define prompt structure
        const prompt = `
            Bạn là một trợ lý nhập liệu AI. Nhiệm vụ: Trích xuất dữ liệu từ tài liệu nhập hàng (Hóa đơn, Phiếu xuất kho, hoặc File Excel thô).
            
            YÊU CẦU TRÍCH XUẤT (JSON):
            {
                "supplier": "Tên nhà cung cấp (nếu có, hoặc đoán từ header)",
                "invoiceNo": "Số hóa đơn/Số phiếu (nếu có)",
                "items": [
                    {
                        "sku": "Mã hàng/Mã phụ tùng (nếu có, nếu không hãy để trống)",
                        "productName": "Tên hàng hóa/Diễn giải",
                        "quantity": Number (Số lượng),
                        "price": Number (Đơn giá, nếu có),
                        "unit": "Đơn vị tính (Cái, Bộ, Mét...)"
                    }
                ]
            }
            
            LƯU Ý:
            - Nếu dữ liệu là một bảng tính (Excel/CSV text), hãy cố gắng map các cột tương ứng.
            - Nếu là ảnh hóa đơn, hãy OCR chính xác tên và số lượng.
            - Bỏ qua các dòng tổng cộng hoặc tiêu đề không phải hàng hóa.
            - Trả về chỉ JSON thuần.
        `;

        let model = FAST_MODEL;
        const contents: any[] = [];

        // Check if data is likely text (JSON/CSV) or Binary (Image/PDF)
        if (payload.mimeType === 'text/csv' || payload.mimeType === 'application/json' || payload.mimeType === 'text/plain') {
            // Text Mode
            model = THINKING_MODEL; // Use Thinking for complex CSV mapping
            contents.push({ role: 'user', parts: [{ text: prompt + `\n\nDATA:\n${payload.data}` }] });
        } else {
            // Vision Mode (Image/PDF)
            // Use gemini-2.5-flash-image for standard image generation/tasks
            model = 'gemini-2.5-flash-image'; 
            
            // FIX: Prohibited 'gemini-1.5-flash' replaced with 'gemini-3-flash-preview' for PDF/Multimodal tasks
            if (payload.mimeType === 'application/pdf') {
                 model = 'gemini-3-flash-preview';
            }

            contents.push({
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: payload.mimeType, data: payload.data } }
                ]
            });
        }

        const response = await ai.models.generateContent({
            model: model,
            contents: contents,
            config: { responseMimeType: "application/json" } // Force JSON
        });

        return JSON.parse(response.text || '{}');
    } catch (error: any) {
        throw new Error(handleAiError(error));
    }
};

// Deprecated alias for backward compatibility if needed, redirecting to new function
export const parseInvoiceImage = async (base64Image: string) => {
    return parseImportDocument({ mimeType: 'image/jpeg', data: base64Image });
};

export const enrichProductInfo = async (rawInput: string): Promise<Partial<Product>> => {
    try {
        const ai = await getAiClient();
        const prompt = `Dựa trên tên "${rawInput}", hãy tìm mã SKU, hãng, kích thước, đơn vị tính và phân kho phù hợp. 
        Trả về JSON: { 
            "name": string, 
            "sku": string, 
            "brand": string, 
            "unit": string (Cái, Bộ, Vòng, v.v.),
            "dimensions": string, 
            "retailPrice": number (Giá bán gợi ý, cao hơn giá vốn ~30%),
            "location": "bearing"|"belt"|"seal"|"lubricant"|"pneumatic"|"hydraulic" 
        }.`;
        
        const response = await ai.models.generateContent({ 
            model: FAST_MODEL, 
            contents: prompt, 
            config: { responseMimeType: "application/json" } 
        });
        return JSON.parse(response.text || '{}');
    } catch (error: any) { 
        throw new Error(handleAiError(error)); 
    }
};

export const parseTransactionText = async (text: string): Promise<{ type: 'income' | 'expense', amount: number, category: string, description: string, date?: string }> => {
    try {
        const ai = await getAiClient();
        const prompt = `
            Phân tích câu lệnh tài chính sau và trích xuất dữ liệu JSON: "${text}"
            Schema: { "type": "income"|"expense", "amount": number, "category": string, "description": string, "date": string (YYYY-MM-DD) }
        `;

        const response = await ai.models.generateContent({
            model: THINKING_MODEL, // Use thinking to better understand context/intent
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 32768 }
            }
        });

        return JSON.parse(response.text || '{}');
    } catch (error: any) {
        throw new Error(handleAiError(error));
    }
};

export const scanReceiptImage = async (base64Image: string): Promise<{ total: number, date?: string, merchant?: string, category?: string }> => {
    try {
        const ai = await getAiClient();
        const prompt = `Trích xuất thông tin từ hóa đơn/biên lai này: Tổng tiền (total), Ngày (date YYYY-MM-DD), Tên đơn vị (merchant), và đoán loại chi phí (category). Trả về JSON.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/jpeg", data: base64Image } }
                ]
            }
        });
        
        return JSON.parse(response.text || '{}');
    } catch (error: any) {
        throw new Error(handleAiError(error));
    }
};

export const scanBusinessCard = async (base64Image: string): Promise<{ name: string, phone: string, email: string, address: string, taxId: string, company: string }> => {
    try {
        const ai = await getAiClient();
        const prompt = `Trích xuất thông tin từ danh thiếp này. Trả về JSON: { "name", "company", "phone", "email", "address", "taxId" }.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/jpeg", data: base64Image } }
                ]
            }
        });
        
        return JSON.parse(response.text || '{}');
    } catch (error: any) {
        throw new Error(handleAiError(error));
    }
};

export const parseContactString = async (text: string): Promise<Partial<{ name: string, phone: string, email: string, address: string, taxId: string, company: string }>> => {
    try {
        const ai = await getAiClient();
        const prompt = `Phân tích đoạn văn bản chứa thông tin liên hệ sau và trích xuất JSON: "${text}". Schema: { "name", "company", "phone", "email", "address", "taxId" }.`;
        
        const response = await ai.models.generateContent({
            model: FAST_MODEL,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        
        return JSON.parse(response.text || '{}');
    } catch (error: any) {
        throw new Error(handleAiError(error));
    }
};
