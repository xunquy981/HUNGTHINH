
import React, { useMemo, useState } from 'react';
import { Button } from '../ui/Primitives';
import { useSettings } from '../../contexts/SettingsContext';
import { useNotification } from '../../contexts/NotificationContext';
import { TemplateEngine } from './TemplateEngine';
import { StockCardTemplate, ReportTemplate } from './Templates';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    filename: string;
    data?: any; 
    children?: React.ReactNode; 
}

export const PrintPreviewModal: React.FC<Props> = ({ isOpen, onClose, title, filename, data, children }) => {
    const { settings } = useSettings();
    const { showNotification } = useNotification();
    const [isPdfLoading, setIsPdfLoading] = useState(false);

    const handlePrint = () => {
        document.title = filename; 
        window.print();
    };

    const handleDownloadPdf = async () => {
        const element = document.getElementById('print-area');
        if (!element) return;

        setIsPdfLoading(true);
        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: 'white'
            });

            const imgData = canvas.toDataURL('image/png');
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = 210;
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            pdf.save(`${filename}.pdf`);
            showNotification('Đã lưu file PDF thành công', 'success');
        } catch (error) {
            showNotification('Lỗi khi tạo PDF', 'error');
        } finally {
            setIsPdfLoading(false);
        }
    };

    // Calculate content unconditionally to obey Hook rules
    const content = useMemo(() => {
        if (children) return children;
        if (data) {
            let type: 'order' | 'quote' | 'import' | 'delivery' = 'order';
            if (data.code?.startsWith('BG') || data.code?.startsWith('QT')) type = 'quote';
            else if (data.code?.startsWith('PN') || data.code?.startsWith('IMP')) type = 'import';
            else if (data.code?.startsWith('PGH')) type = 'delivery';
            
            const config = settings.documents[type];
            return <TemplateEngine data={data} settings={settings} config={config} type={type} />;
        }
        return <div className="text-center p-10">Không có dữ liệu in</div>;
    }, [data, children, settings]);

    // Early return ONLY after hooks
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-print flex flex-col bg-slate-900/95 backdrop-blur-md animate-fadeIn">
            {/* Header Toolbar */}
            <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-slate-900 shadow-xl z-50 print:hidden">
                <div className="flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
                        <span className="material-symbols-outlined">print</span>
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-base leading-none">{title}</h3>
                        <p className="text-slate-400 text-[10px] font-medium mt-1 uppercase tracking-widest">A4 Preview Mode</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={onClose} className="bg-white/10 text-white border-none hover:bg-white/20 h-10 rounded-xl px-6">Đóng</Button>
                    <Button variant="primary" onClick={handleDownloadPdf} loading={isPdfLoading} className="bg-rose-600 hover:bg-rose-700 border-none h-10 rounded-xl px-6 shadow-lg shadow-rose-900/20" icon="picture_as_pdf">Lưu PDF</Button>
                    <Button variant="primary" onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-700 border-none h-10 rounded-xl px-8 shadow-lg shadow-emerald-900/20" icon="print">In Ngay</Button>
                </div>
            </div>

            {/* Viewport */}
            <div className="flex-1 overflow-y-auto custom-scrollbar w-full flex justify-center p-8 bg-slate-950/50 print:p-0 print:bg-white print:block print:inset-0 print:absolute print:overflow-visible">
                <div 
                    id="print-area" 
                    className="bg-white shadow-[0_0_50px_rgba(0,0,0,0.5)] relative print:shadow-none print:m-0 w-[210mm] min-h-[297mm] transition-transform duration-300 origin-top"
                >
                    <style>{`
                        @media print { 
                            @page { size: A4; margin: 0; }
                            body { background: white; }
                            #print-area { width: 100% !important; height: auto !important; box-shadow: none !important; margin: 0 !important; }
                        }
                    `}</style>
                    {content}
                </div>
            </div>
        </div>
    );
};
