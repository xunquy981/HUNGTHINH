
import { removeVietnameseTones } from './helpers';
import { TransactionType } from '../types';

/**
 * Intelligent category detection based on description keywords
 */
const EXPENSE_KEYWORDS: Record<string, string[]> = {
    'salary': ['luong', 'thuong', 'ung luong', 'nhan vien', 'cong nhat', 'bao hiem', 'bhxh', 'salary', 'nv'],
    'rent': ['thue nha', 'mat bang', 'van phong', 'coc nha', 'kho bai', 'rent', 'lease'],
    'utilities': ['dien', 'nuoc', 'internet', 'wifi', 'rac', 'cuoc', 'mobile', 'dt', 'viettel', 'fpt', 'vnpt', 'billing'],
    'marketing': ['quang cao', 'fb', 'facebook', 'google', 'ads', 'to roi', 'banner', 'bien hieu', 'tiep khach', 'marketing'],
    'maintenance': ['sua chua', 'bao tri', 'son', 'hong', 'thay the', 'may lanh', 'den', 'maintenance', 'fix'],
    'tax': ['thue', 'phi', 'le phi', 'mon bai', 'gtgt', 'vat', 'tax', 'invoice'],
    'drawing': ['rut von', 'tieu dung', 'ca nhan', 'sep', 'rut tien', 'drawing'],
    'import': ['nhap hang', 'mua hang', 'nhap kho', 'thanh toan ncc', 'purchase', 'bill'],
};

const INCOME_KEYWORDS: Record<string, string[]> = {
    'sale': ['ban hang', 'doanh thu', 'tien hang', 'khach tra', 'ban le', 'pos', 'order'],
    'debt_collection': ['thu no', 'khach tra no', 'thanh toan no', 'doi no', 'receivable'],
    'manual': ['thu ngoai', 'gop von', 'vay', 'muon', 'invest', 'capital'],
    'supplier_refund': ['ncc hoan', 'tra hang ncc', 'refund', 'money back'],
};

export const detectTransactionCategory = (
    text: string, 
    type: TransactionType
): string | null => {
    if (!text || text.length < 2) return null;

    const normalizedText = removeVietnameseTones(text).toLowerCase();
    const map = type === 'expense' ? EXPENSE_KEYWORDS : INCOME_KEYWORDS;

    for (const [category, keywords] of Object.entries(map)) {
        if (keywords.some(keyword => normalizedText.includes(keyword))) {
            return category;
        }
    }

    // Heuristics for codes
    if (type === 'income' && (normalizedText.includes('dh-') || normalizedText.includes('don hang'))) {
        return 'sale';
    }
    if (type === 'expense' && (normalizedText.includes('pn-') || normalizedText.includes('nhap hang'))) {
        return 'import';
    }

    return null;
};
