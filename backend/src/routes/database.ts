import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';

const router = Router();

// Database statistics
router.get('/stats', asyncHandler(async (_req, res) => {
  const { rows: dbSize } = await pool.query(
    `SELECT sum(pg_total_relation_size(schemaname||'.'||tablename))::bigint as size
     FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`
  );
  const { rows: connCount } = await pool.query(
    `SELECT count(*) as connections FROM pg_stat_activity WHERE datname = current_database()`
  );
  const { rows: tableCount } = await pool.query(
    `SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const { rows: version } = await pool.query('SELECT version() as version');

  res.json({
    databaseSize: dbSize[0]?.size || 0,
    connections: connCount[0]?.connections || 0,
    tables: tableCount[0]?.count || 0,
    version: version[0]?.version || 'Unknown',
  });
}));

// List all tables
router.get('/tables', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT 
      tablename,
      schemaname,
      (SELECT count(*) FROM information_schema.columns WHERE table_name = t.tablename AND table_schema = t.schemaname)::int as column_count,
      (SELECT count(*) FROM information_schema.key_column_usage WHERE table_name = t.tablename)::int as constraint_count
    FROM pg_tables t
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  
  res.json(rows);
}));

// Get table schema
router.get('/tables/:tableName/schema', asyncHandler(async (req, res) => {
  const tableNameRaw = req.params.tableName;
  const tableName = Array.isArray(tableNameRaw) ? tableNameRaw[0] : tableNameRaw;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    res.status(400).json({ error: 'Invalid table name' });
    return;
  }

  const { rows: columns } = await pool.query(`
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [tableName]);

  const { rows: constraints } = await pool.query(`
    SELECT 
      constraint_name,
      constraint_type
    FROM information_schema.table_constraints
    WHERE table_name = $1 AND table_schema = 'public'
  `, [tableName]);

  const safeIdentifier = `"${tableName}"`;
  const { rows: rowCount } = await pool.query(`SELECT count(*) as count FROM ${safeIdentifier}`);

  res.json({
    columns,
    constraints,
    rowCount: rowCount[0]?.count || 0,
  });
}));

// Query table with pagination
router.post('/query', validateBody(z.object({
  query: z.string().min(1).max(5000),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
})), asyncHandler(async (req, res) => {
  const { query, limit, offset } = req.body;
  
  // Basic safety check - only allow SELECT queries
  if (!/^\s*SELECT\s+/i.test(query)) {
    return res.status(400).json({ error: 'Only SELECT queries are allowed' });
  }

  try {
    const pagedQuery = `SELECT * FROM (${query}) AS q LIMIT $1 OFFSET $2`;
    const { rows } = await pool.query(pagedQuery, [limit, offset]);
    const { rows: countResult } = await pool.query(
      `SELECT count(*) as total FROM (${query}) AS count_query`
    );
    
    res.json({
      rows,
      total: countResult[0]?.total || 0,
      limit,
      offset,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}));

export default router;
