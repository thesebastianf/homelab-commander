import { pool } from '../database.js';

export async function auditLog(
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4)`,
      [action, resourceType, resourceId || null, JSON.stringify(details || {})]
    );
  } catch {
    // Audit logging should never crash the app
  }
}
