
// Helper: Remove Vietnamese Tones for Search
export const removeVietnameseTones = (str: string) => {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
    str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
    str = str.replace(/đ/g,"d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); 
    return str.toLowerCase();
}

// Helper: Normalize string for search
export const normalizeText = (str: string) => removeVietnameseTones(str || '').toLowerCase().trim();

// PERFORMANCE: Tokenizer for Full-Text Search Indexing
export const tokenize = (str: string): string[] => {
    if (!str) return [];
    const normalized = removeVietnameseTones(str).toLowerCase();
    // Split by space, dash, dot, or common separators
    const tokens = normalized.split(/[\s\-\.,;/]+/).filter(x => x.length > 0);
    return [...new Set(tokens)]; // Unique tokens
};

// Helper: Safe Rounding
export const safeRound = (num: number) => Math.round(num);

/**
 * parseDate: Chuyển đổi chuỗi (ISO hoặc VN) sang đối tượng Date.
 */
export const parseDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return new Date(0);
    // Nếu là VN format DD/MM/YYYY
    if (dateStr.includes('/') && dateStr.split('/').length === 3) {
        const [d, m, y] = dateStr.split('/');
        return new Date(Number(y), Number(m) - 1, Number(d));
    }
    // Mặc định ISO hoặc JS Date string
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
};

/**
 * formatDisplayDate: Chuyển đổi từ ISO (YYYY-MM-DD) sang hiển thị VN (DD/MM/YYYY).
 */
export const formatDisplayDate = (isoDate: string | undefined | null) => {
    if (!isoDate) return '--/--/----';
    if (isoDate.includes('/')) return isoDate; // Đã là định dạng hiển thị
    const parts = isoDate.split('T')[0].split('-');
    if (parts.length !== 3) return isoDate;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
};

/**
 * formatDateISO: Định dạng đối tượng Date sang chuỗi ISO (YYYY-MM-DD) để lưu DB.
 */
export const formatDateISO = (date: Date) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${y}-${m}-${d}`;
};

/**
 * getCurrentDate: Lấy ngày hiện tại chuẩn ISO YYYY-MM-DD.
 */
export const getCurrentDate = () => formatDateISO(new Date());

/**
 * formatInputDate: Chuẩn hóa ngày để lưu vào DB (ISO YYYY-MM-DD).
 * Dùng cho input type="date" và trước khi save vào DB.
 */
export const formatInputDate = (date: Date | string | number | undefined) => {
    if (!date) return getCurrentDate();
    // Nếu đã là chuỗi ISO YYYY-MM-DD thì trả về nguyên bản
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    
    const d = new Date(date);
    return isNaN(d.getTime()) ? getCurrentDate() : formatDateISO(d);
};

/**
 * formatDateDDMMYYYY: Legacy function - Alias to formatDisplayDate
 */
export const formatDateDDMMYYYY = formatDisplayDate;

/**
 * parseISOToDate: Dùng cho các hàm tính toán khoảng cách ngày.
 */
export const parseISOToDate = (str: string | undefined | null) => {
    if(!str) return null;
    const parts = str.split('T')[0].split('-');
    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d);
};

// Helper: Format Relative Time
export const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return 'Vừa xong';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    return new Date(timestamp).toLocaleDateString('vi-VN');
};

export const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

export const getStartOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
export const getEndOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth() + 1, 0);

export const getDaysDiff = (targetDate: Date, baseDate: Date = new Date()) => {
    const d1 = new Date(targetDate); d1.setHours(0,0,0,0);
    const d2 = new Date(baseDate); d2.setHours(0,0,0,0);
    const diffTime = d2.getTime() - d1.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Helper: Standard Currency Format
export const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN').format(value) + ' VND'; 
};

export const generateUUID = (prefix: string = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const toCSV = (rows: Record<string, any>[], headers: { key: string; label: string }[]) => {
  const headerRow = headers.map(h => h.label).join(',');
  const body = rows.map(row => {
    return headers.map(header => {
      let val = row[header.key];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""'); 
      if (val.search(/("|,|\n)/g) >= 0) val = `"${val}"`;
      return val;
    }).join(',');
  }).join('\n');
  return `\uFEFF${headerRow}\n${body}`;
};

export const downloadTextFile = (filename: string, content: string, mime = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const readMoney = (number: number) => {
    if (number === 0) return "Không đồng";
    const CHU_SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
    const TEN_LOP = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
    const doc3So = (baso: string) => {
        const tram = parseInt(baso[0]);
        const chuc = parseInt(baso[1]);
        const donvi = parseInt(baso[2]);
        let k = "";
        if (tram === 0 && chuc === 0 && donvi === 0) return "";
        if (tram !== 0) { k += CHU_SO[tram] + " trăm"; if (chuc === 0 && donvi !== 0) k += " linh"; }
        if (chuc !== 0 && chuc !== 1) { k += " " + CHU_SO[chuc] + " mươi"; if (chuc === 0 && donvi !== 0) k += " linh"; }
        if (chuc === 1) k += " mười";
        if (donvi === 1) { if (chuc !== 0 && chuc !== 1) k += " mốt"; else k += " " + CHU_SO[donvi]; }
        else if (donvi === 5) { if (chuc !== 0) k += " lăm"; else k += " " + CHU_SO[donvi]; }
        else if (donvi !== 0) k += " " + CHU_SO[donvi];
        return k;
    };
    const str = Math.abs(number).toString();
    let i = str.length;
    const groups = [];
    while (i > 0) { const start = Math.max(0, i - 3); groups.push(str.slice(start, i).padStart(3, '0')); i -= 3; }
    let result = "";
    for (let j = groups.length - 1; j >= 0; j--) { const d = doc3So(groups[j]); if (d) result += " " + d + " " + TEN_LOP[j]; }
    result = result.trim();
    return result.charAt(0).toUpperCase() + result.slice(1) + " đồng";
};

export const calcAvailableStock = (stock: number, reserved?: number) => Math.max(0, stock - (reserved || 0));
export const copyToClipboard = async (text: string) => { try { await navigator.clipboard.writeText(text); return true; } catch (err) { return false; } };

export const normalizeOrder = (order: any) => {
    let items = order.items;
    if (!items || !Array.isArray(items)) {
        items = order.cart || [];
    }
    
    items = items.map((i: any) => ({
        ...i,
        quantity: Number(i.quantity) || 0,
        price: Number(i.price) || 0,
        total: Number(i.total) || ((Number(i.price) || 0) * (Number(i.quantity) || 0)),
        costPrice: Number(i.costPrice) || 0
    }));

    let total = order.total;
    if (total === undefined || total === null) {
        total = order.totalAmount;
    }
    
    if ((total === undefined || total === null || total === 0) && items.length > 0) {
        const subtotal = items.reduce((sum: number, item: any) => sum + item.total, 0);
        const discount = Number(order.discount) || 0;
        const shipping = Number(order.shippingFee) || 0;
        const vatAmount = Number(order.vatAmount) || 0;
        total = Math.max(0, subtotal - discount + vatAmount + shipping);
    }

    let date = order.date;
    if (!date) {
        date = order.createdAt ? formatDateISO(new Date(order.createdAt)) : getCurrentDate();
    }

    const { cart, totalAmount, ...rest } = order;

    return {
        ...rest,
        items,
        total: Number(total) || 0,
        date
    };
};
