const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/users', (req, res) => {
  res.json({
    students: db.prepare('SELECT id, reg_no, name, created_at FROM students ORDER BY name').all(),
    staff: db.prepare('SELECT id, reg_no, name, created_at FROM staff ORDER BY name').all(),
  });
});

// Pre-register a student or staff account so they don't have to register themselves.
router.post('/users', (req, res) => {
  const { role, regNo, name } = req.body;
  if (!['students', 'staff'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (!regNo || !regNo.trim()) return res.status(400).json({ error: 'A register number is required.' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'A name is required.' });

  const existing = db.prepare(`SELECT * FROM ${role} WHERE reg_no = ? COLLATE NOCASE`).get(regNo.trim());
  if (existing) return res.status(409).json({ error: 'That register number is already registered.' });

  const row = { id: uuid(), reg_no: regNo.trim(), name: name.trim(), created_at: new Date().toISOString() };
  db.prepare(`INSERT INTO ${role} (id, reg_no, name, created_at) VALUES (?,?,?,?)`)
    .run(row.id, row.reg_no, row.name, row.created_at);
  res.json(row);
});

router.delete('/users/:role/:regNo', (req, res) => {
  const { role, regNo } = req.params;
  if (!['students', 'staff'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  db.prepare(`DELETE FROM ${role} WHERE reg_no = ?`).run(regNo);
  res.json({ ok: true });
});

router.get('/logs', (req, res) => {
  res.json(db.prepare('SELECT * FROM logs ORDER BY time DESC LIMIT 300').all());
});

module.exports = router;
