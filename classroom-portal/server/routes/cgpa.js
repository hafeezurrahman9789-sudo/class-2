const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware');

const router = express.Router();

router.get('/', authenticate, requireRole('student'), (req, res) => {
  const row = db.prepare('SELECT data FROM cgpa_entries WHERE reg_no = ? COLLATE NOCASE').get(req.user.regNo);
  res.json(row ? JSON.parse(row.data) : null);
});

router.put('/', authenticate, requireRole('student'), (req, res) => {
  const data = JSON.stringify(req.body.semesters || []);
  db.prepare(`
    INSERT INTO cgpa_entries (reg_no, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(reg_no) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(req.user.regNo, data, new Date().toISOString());
  res.json({ ok: true });
});

module.exports = router;
