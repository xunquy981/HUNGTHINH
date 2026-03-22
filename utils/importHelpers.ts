
import * as XLSX from 'xlsx';

export interface ParsedFile {
    headers: string[];
    rows: any[];
}

export const parseCSV = (content: string): ParsedFile => {
    const lines = content.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseLine = (text: string) => {
        const result = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') inQuote = !inQuote;
            else if (char === ',' && !inQuote) {
                result.push(cur.trim());
                cur = '';
            } else cur += char;
        }
        result.push(cur.trim());
        return result;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(line => {
        const values = parseLine(line);
        const row: any = {};
        headers.forEach((h, i) => { row[h] = values[i] || ''; });
        return row;
    });

    return { headers, rows };
};

export const parseExcel = (buffer: ArrayBuffer): ParsedFile => {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    if (jsonData.length === 0) return { headers: [], rows: [] };

    const headers = jsonData[0].map(String);
    const dataRows = jsonData.slice(1);

    const rows = dataRows.map(rowArray => {
        const rowObject: any = {};
        headers.forEach((header, index) => {
            rowObject[header] = rowArray[index] !== undefined ? rowArray[index] : '';
        });
        return rowObject;
    });

    return { headers, rows };
};

export const generateErrorCSV = (rows: any[], errors: Record<number, string[]>) => {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const csvRows = [
        [...headers, 'ERRORS'].join(','),
        ...rows.map((row, idx) => {
            if (!errors[idx]) return null;
            const values = headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`);
            return [...values, `"${errors[idx].join('; ')}"`].join(',');
        }).filter(Boolean)
    ];
    return `\uFEFF${csvRows.join('\n')}`;
};

export const SYSTEM_FIELDS = [
    { key: 'sku', label: 'Mã SKU (*)', required: true },
    { key: 'name', label: 'Tên sản phẩm (*)', required: true },
    { key: 'brand', label: 'Thương hiệu' },
    { key: 'dimensions', label: 'Quy cách' },
    { key: 'quantity', label: 'Số lượng thực tồn (*)', required: true, type: 'number' },
    { key: 'price', label: 'Giá vốn nhập', type: 'number' },
    { key: 'retailPrice', label: 'Giá bán lẻ', type: 'number' },
    { key: 'minStock', label: 'Tồn tối thiểu', type: 'number' }
];
