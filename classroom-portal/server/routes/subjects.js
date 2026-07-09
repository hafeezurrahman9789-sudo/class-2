const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM subjects ORDER BY name').all());
});

router.post('/', authenticate, requireRole('staff'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'A subject name is required.' });
  const row = { id: uuid(), name: name.trim(), created_by: req.user.name, date: new Date().toISOString() };
  db.prepare('INSERT INTO subjects (id, name, created_by, date) VALUES (?,?,?,?)').run(row.id, row.name, row.created_by, row.date);
  res.json(row);
});

router.put('/:id', authenticate, requireRole('staff'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'A subject name is required.' });
  const info = db.prepare('UPDATE subjects SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Subject not found.' });
  res.json({ ok: true });
});

// Deleting a subject cascades to its notes, assignments, and submissions (see db.js FKs).
router.delete('/:id', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const info = db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Subject not found.' });
  res.json({ ok: true });
});

module.exports = router;
