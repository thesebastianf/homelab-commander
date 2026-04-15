import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { portReservationBody } from '../validation/schemas.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM port_reservations ORDER BY port_range_start');
  res.json(rows.map(mapReservation));
}));

router.post('/', validateBody(portReservationBody), asyncHandler(async (req, res) => {
  const { name, description, portRangeStart, portRangeEnd, groupName, color } = req.body;
  const { rows: [row] } = await pool.query(
    `INSERT INTO port_reservations (name, description, port_range_start, port_range_end, group_name, color)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, description || '', portRangeStart, portRangeEnd, groupName || 'default', color || '#3b82f6']
  );
  res.status(201).json(mapReservation(row));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM port_reservations WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

function mapReservation(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    portRangeStart: row.port_range_start,
    portRangeEnd: row.port_range_end,
    groupName: row.group_name,
    color: row.color,
    createdAt: row.created_at,
  };
}

export default router;
