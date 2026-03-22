
import { db } from './db';
import { BackupData } from '../types';
import { APP_VERSION, DB_SCHEMA_VERSION } from '../constants/versions';

// Các bảng bắt buộc phải có trong file backup để đảm bảo tính toàn vẹn khi Restore (Replace)
const CRITICAL_TABLES = ['products', 'orders', 'partners', 'debtRecords'];

export const exportBackup = async (): Promise<void> => {
  try {
    const data: Record<string, any[]> = {};
    
    // Dynamically iterate over all tables defined in the Dexie instance
    // This ensures no table is ever missed, even if new ones are added to schema
    for (const table of (db as any).tables) {
        data[table.name] = await table.toArray();
    }

    const backup: BackupData = {
      metadata: {
        appVersion: APP_VERSION,
        schemaVersion: DB_SCHEMA_VERSION,
        exportedAt: Date.now(),
        source: 'ERP_HUNGTHINH_PRO'
      },
      data: data
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `hungthinh-erp-v${APP_VERSION}-backup-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Backup export failed:', error);
    throw new Error('Không thể xuất dữ liệu. Vui lòng thử lại.');
  }
};

interface BackupAnalysis {
    isValid: boolean;
    summary: Record<string, number>;
    warnings: string[];
    errors: string[];
    correctedData: BackupData;
    metadata: any;
}

export const validateBackup = (json: any): BackupAnalysis => {
    const summary: Record<string, number> = {};
    const warnings: string[] = [];
    const errors: string[] = [];
    
    if (!json || !json.data) {
        throw new Error('Định dạng file backup không hợp lệ (Thiếu data block).');
    }

    const correctedData: any = { ...json };
    const availableTables = (db as any).tables.map((t: any) => t.name);
    const backupTableNames = Object.keys(correctedData.data);
    
    // 1. Analyze content based on backup data keys
    backupTableNames.forEach(tableName => {
        const rows = correctedData.data[tableName];
        if (Array.isArray(rows)) {
            summary[tableName] = rows.length;
            if (!availableTables.includes(tableName)) {
                warnings.push(`Bảng '${tableName}' trong file backup không tồn tại trong hệ thống hiện tại (Sẽ bị bỏ qua).`);
            }
        } else {
            correctedData.data[tableName] = []; // Normalize to empty array if invalid
            warnings.push(`Dữ liệu bảng '${tableName}' bị lỗi định dạng (Đã reset về rỗng).`);
        }
    });

    // 2. Check for Critical Tables
    // Nếu thiếu bảng quan trọng, đánh dấu là lỗi nghiêm trọng để ngăn chặn Restore (Replace)
    const missingCritical = CRITICAL_TABLES.filter(t => !backupTableNames.includes(t));
    if (missingCritical.length > 0) {
        errors.push(`File backup thiếu các bảng dữ liệu cốt lõi: ${missingCritical.join(', ')}. Không thể khôi phục để tránh mất dữ liệu.`);
    }

    // 3. Check Schema Version
    if (json.metadata?.schemaVersion && json.metadata.schemaVersion !== DB_SCHEMA_VERSION) {
        warnings.push(`Khác biệt phiên bản DB (Backup v${json.metadata.schemaVersion} vs App v${DB_SCHEMA_VERSION}). Một số dữ liệu có thể không tương thích.`);
    }

    return {
        isValid: errors.length === 0,
        summary,
        warnings,
        errors,
        correctedData: correctedData as BackupData,
        metadata: json.metadata || {}
    };
};

export const parseBackupFile = (file: File): Promise<BackupAnalysis> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);
        const analysis = validateBackup(json);
        resolve(analysis);
      } catch (err: any) {
        reject(new Error('File không phải định dạng JSON hợp lệ hoặc bị hỏng.'));
      }
    };
    reader.onerror = () => reject(new Error('Lỗi khi đọc file'));
    reader.readAsText(file);
  });
};

export const restoreBackup = async (backup: BackupData, mode: 'replace' | 'merge'): Promise<void> => {
  // Use all available tables for the transaction scope to ensure atomicity
  // (db as any).tables returns all Table objects defined in schema
  const tables = (db as any).tables;
  const tableNames = tables.map((t: any) => t.name);

  // EXECUTE ATOMIC TRANSACTION
  // If any error occurs inside, the entire DB state rolls back.
  await (db as any).transaction('rw', tables, async () => { 
    
    const backupTables = Object.keys(backup.data);

    for (const tableName of backupTables) {
      // 1. Skip tables not present in current schema to prevent Dexie errors
      if (!tableNames.includes(tableName)) {
          console.warn(`Skipping restore for table '${tableName}' (Schema mismatch)`);
          continue;
      }

      const table = (db as any).table(tableName);
      const rows = backup.data[tableName];

      // 2. Clear table if in replace mode
      if (mode === 'replace') {
        await table.clear();
      }

      // 3. Bulk Insert/Update
      if (rows && rows.length > 0) {
        // bulkPut updates existing keys (Merge) or creates new ones.
        // It's safer than bulkAdd which fails on duplicates.
        // This operation is part of the transaction.
        await table.bulkPut(rows);
      }
    }
  });
};
