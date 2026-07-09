const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM assignments ORDER BY date DESC').all());
});

router.post('/', authenticate, requireRole('staff'), (req, res) => {
  const { title, description, due, subjectId } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'A title is required.' });
  if (!subjectId) return res.status(400).json({ error: 'Choose a subject for this assignment.' });
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) return res.status(400).json({ error: 'That subject no longer exists.' });

  const row = { id: uuid(), subject_id: subjectId, title: title.trim(), description: description || '', due_date: due || '', uploader: req.user.name, date: new Date().toISOString() };
  db.prepare('INSERT INTO assignments (id, subject_id, title, description, due_date, uploader, date) VALUES (?,?,?,?,?,?,?)')
    .run(row.id, row.subject_id, row.title, row.description, row.due_date, row.uploader, row.date);
  res.json(row);
});

router.delete('/:id', authenticate, requireRole('staff', 'admin'), (req, res) => {
  db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id); // submissions cascade via FK
  res.json({ ok: true });
});

module.exports = router;
