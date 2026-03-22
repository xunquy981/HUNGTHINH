
import { useState, useCallback, useMemo } from 'react';
import { ViewState } from '../types';
import { getAiClient, handleAiError } from '../services/ai';

export const useVoiceAssistant = (
    onNavigate: (view: ViewState, params?: any) => void, 
    onSearch: (query: string) => void
) => {
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [feedback, setFeedback] = useState('');

    const recognition = useMemo(() => {
        if (typeof window !== 'undefined' && (window as any).webkitSpeechRecognition) {
            return new (window as any).webkitSpeechRecognition();
        }
        return null;
    }, []);

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'vi-VN';
            window.speechSynthesis.speak(utterance);
        }
    };

    const processIntentWithGemini = async (text: string) => {
        if (!text) return;
        
        setIsProcessing(true);
        try {
            // Retrieve AI Client centrally
            const ai = await getAiClient();
            
            const prompt = `
                Vai trò: Trợ lý giọng nói ERP Hưng Thịnh.
                Câu lệnh: "${text}".
                
                Phân tích ý định và trả về JSON thuần:
                {
                    "type": "NAVIGATE" | "SEARCH" | "CREATE" | "UNKNOWN",
                    "target": string,
                    "reply": string
                }

                Ánh xạ màn hình (target):
                - "Bàn làm việc", "Trang chủ", "Tổng quan" -> "DASHBOARD"
                - "Bán hàng", "POS", "Quầy" -> "POS"
                - "Đơn hàng", "Hóa đơn" -> "ORDERS"
                - "Kho", "Sản phẩm", "Hàng hóa" -> "INVENTORY"
                - "Thẻ kho", "Lịch sử kho" -> "INVENTORY_HISTORY"
                - "Nhập hàng", "Phiếu nhập" -> "IMPORTS"
                - "Khách hàng", "Đối tác", "Nhà cung cấp" -> "PARTNERS"
                - "Công nợ", "Nợ nần" -> "DEBTS"
                - "Sổ quỹ", "Phiếu thu", "Phiếu chi", "Tiền mặt" -> "TRANSACTIONS"
                - "Báo cáo", "Doanh thu", "Lợi nhuận" -> "REPORTS"
                - "Nhật ký", "Truy vết" -> "AUDIT_LOGS"
                - "Hệ thống", "Lỗi", "Bảo trì" -> "SYSTEM_LOGS"

                Ví dụ:
                - "Cho tôi xem thẻ kho" -> {"type": "NAVIGATE", "target": "INVENTORY_HISTORY", "reply": "Đang mở lịch sử kho hàng."}
                - "Tìm đơn anh Tuấn" -> {"type": "SEARCH", "target": "anh Tuấn", "reply": "Đang truy xuất đơn hàng của anh Tuấn."}
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });

            const result = JSON.parse(response.text || '{}');
            setFeedback(result.reply || "Đã rõ.");
            speak(result.reply || "Đã rõ.");

            if (result.type === 'NAVIGATE') onNavigate(result.target as ViewState);
            else if (result.type === 'SEARCH') onSearch(result.target);
            else if (result.type === 'CREATE') onNavigate(text.toLowerCase().includes('nhập') ? 'IMPORTS' : 'POS');

        } catch (error: any) {
            const friendlyMsg = handleAiError(error);
            setFeedback(friendlyMsg);
            speak("Gặp lỗi kết nối AI.");
        } finally {
            setIsProcessing(false);
            setTimeout(() => setFeedback(''), 4000);
        }
    };

    const startListening = useCallback(() => {
        if (!recognition) return;
        recognition.lang = 'vi-VN';
        recognition.onstart = () => { setIsListening(true); setFeedback('Đang nghe...'); };
        recognition.onresult = (event: any) => {
            const text = event.results[0][0].transcript;
            setTranscript(text);
            processIntentWithGemini(text);
        };
        recognition.onerror = () => { setIsListening(false); setFeedback('Không nghe rõ.'); };
        recognition.onend = () => setIsListening(false);
        recognition.start();
    }, [recognition]);

    return { isListening, isProcessing, transcript, feedback, startListening };
};
