const express = require('express');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware');
const { uploadPdf, deleteStoredFile, UPLOAD_DIR } = require('../uploadUtil');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const rows = db.prepare('SELECT id, original_name, uploader, date FROM testpdfs ORDER BY date DESC').all();
  res.json(rows);
});

router.post('/', authenticate, requireRole('staff'), uploadPdf.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received.' });
  const row = { id: uuid(), original_name: req.file.originalname, stored_name: req.file.filename, uploader: req.user.name, date: new Date().toISOString() };
  db.prepare('INSERT INTO testpdfs (id, original_name, stored_name, uploader, date) VALUES (?,?,?,?,?)')
    .run(row.id, row.original_name, row.stored_name, row.uploader, row.date);
  res.json({ id: row.id, original_name: row.original_name, uploader: row.uploader, date: row.date });
});

router.put('/:id/rename', authenticate, requireRole('staff'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'A file name is required.' });
  const info = db.prepare('UPDATE testpdfs SET original_name = ? WHERE id = ?').run(name.trim(), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'File not found.' });
  res.json({ ok: true });
});

router.put('/:id/replace', authenticate, requireRole('staff'), uploadPdf.single('file'), (req, res) => {
  const note = db.prepare('SELECT * FROM testpdfs WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'File not found.' });
  deleteStoredFile(note.stored_name);
  db.prepare('UPDATE testpdfs SET original_name=?, stored_name=?, date=? WHERE id=?')
    .run(req.file.originalname, req.file.filename, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const note = db.prepare('SELECT * FROM testpdfs WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'File not found.' });
  deleteStoredFile(note.stored_name);
  db.prepare('DELETE FROM testpdfs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/:id/file', authenticate, (req, res) => {
  const note = db.prepare('SELECT * FROM testpdfs WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'File not found.' });
  const filePath = path.join(UPLOAD_DIR, note.stored_name);
  if (req.query.download === '1') {
    res.download(filePath, note.original_name);
  } else {
    res.contentType('application/pdf');
    res.sendFile(filePath);
  }
});

module.exports = router;
