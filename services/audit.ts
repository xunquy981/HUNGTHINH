
import { db } from './db';
import { AuditLog, AuditAction, AuditModule } from '../types';

interface LogAuditParams {
  module: AuditModule;
  entityType: string;
  entityId: string;
  entityCode?: string;
  action: AuditAction;
  summary: string;
  actor: { id: string; name: string };
  before?: any;
  after?: any;
  refType?: string;
  refCode?: string;
  tags?: string[];
}

/**
 * Loại bỏ các trường dữ liệu nặng hoặc không cần thiết khỏi snapshot log
 */
const cleanForLog = (data: any) => {
  if (!data || typeof data !== 'object') return data;
  const clone = JSON.parse(JSON.stringify(data));
  const exclude = ['image', 'images', 'logo', 'signature', 'customCss', 'searchWords', 'seedTag'];
  
  const strip = (obj: any) => {
    Object.keys(obj).forEach(key => {
      if (exclude.some(ex => key.toLowerCase().includes(ex))) {
        obj[key] = '[DATA_STRIPPED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        strip(obj[key]);
      }
    });
  };
  strip(clone);
  return clone;
};

/**
 * Tính toán sự khác biệt giữa 2 object (Simplified Diff)
 */
const calculateDiff = (before: any, after: any) => {
    if (!before || !after) return null;
    const diff: any = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    
    allKeys.forEach(key => {
        if (['updatedAt', 'searchWords'].includes(key)) return;
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
            diff[key] = {
                from: before[key],
                to: after[key]
            };
        }
    });
    return Object.keys(diff).length > 0 ? diff : null;
};

export const logAudit = async (params: LogAuditParams, tx?: any) => {
  try {
    const beforeClean = cleanForLog(params.before);
    const afterClean = cleanForLog(params.after);
    const diff = calculateDiff(beforeClean, afterClean);

    const entry: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: Date.now(),
      createdById: params.actor.id,
      createdByName: params.actor.name,
      module: params.module,
      entityType: params.entityType,
      entityId: params.entityId,
      entityCode: params.entityCode,
      action: params.action,
      summary: params.summary,
      before: beforeClean,
      after: afterClean,
      diff: diff, // Store calculated diff for quick UI rendering
      severity: params.action === 'Delete' || params.action === 'SoftDelete' ? 'warn' : 'info',
      refType: params.refType,
      refCode: params.refCode,
      tags: params.tags || [],
    };

    // Nếu có transaction được truyền vào, dùng transaction đó để ghi đè tính nhất quán
    const targetTable = tx ? tx.auditLogs : db.auditLogs;
    await targetTable.add(entry);
  } catch (error) {
    console.error('Lỗi khi ghi nhật ký truy vết:', error);
  }
};
