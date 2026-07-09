const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM quizzes ORDER BY date DESC, created_at DESC').all());
});

router.post('/', authenticate, requireRole('staff'), (req, res) => {
  const { title, description, formUrl, date } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'A title is required.' });
  const row = {
    id: uuid(), title: title.trim(), description: description || '', form_url: formUrl || '',
    date: date || '', uploader: req.user.name, created_at: new Date().toISOString(),
  };
  db.prepare('INSERT INTO quizzes (id, title, description, form_url, date, uploader, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(row.id, row.title, row.description, row.form_url, row.date, row.uploader, row.created_at);
  res.json(row);
});

router.put('/:id', authenticate, requireRole('staff'), (req, res) => {
  const { title, description, formUrl, date } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'A title is required.' });
  const info = db.prepare('UPDATE quizzes SET title=?, description=?, form_url=?, date=? WHERE id=?')
    .run(title.trim(), description || '', formUrl || '', date || '', req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Quiz not found.' });
  res.json({ ok: true });
});

router.delete('/:id', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const info = db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id); // scores cascade via FK
  if (info.changes === 0) return res.status(404).json({ error: 'Quiz not found.' });
  res.json({ ok: true });
});

// Leaderboard: everyone (rank, name, score), highest first.
router.get('/:id/scores', authenticate, (req, res) => {
  const rows = db.prepare('SELECT reg_no, name, score FROM quiz_scores WHERE quiz_id = ?').all(req.params.id);
  rows.sort((a, b) => (parseFloat(b.score) || -Infinity) - (parseFloat(a.score) || -Infinity));
  res.json(rows);
});

// Staff bulk-saves the whole score sheet at once (same editable-table pattern as attendance).
router.put('/:id/scores', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const tx = db.transaction((rows) => {
    db.prepare('DELETE FROM quiz_scores WHERE quiz_id = ?').run(req.params.id);
    const stmt = db.prepare('INSERT INTO quiz_scores (id, quiz_id, reg_no, name, score) VALUES (?,?,?,?,?)');
    for (const r of rows) {
      if (!r.regNo) continue;
      stmt.run(uuid(), req.params.id, String(r.regNo), String(r.name || ''), String(r.score ?? ''));
    }
  });
  tx(rows);
  res.json({ ok: true });
});

module.exports = router;
