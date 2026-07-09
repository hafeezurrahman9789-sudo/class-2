const express = require('express');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware');
const { uploadPdf, deleteStoredFile, UPLOAD_DIR } = require('../uploadUtil');

const router = express.Router();

/* ---- Practical subjects/sections (independent from Notes/Assignments) ---- */
router.get('/subjects', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM practical_subjects ORDER BY name').all());
});

router.post('/subjects', authenticate, requireRole('staff'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'A section name is required.' });
  const row = { id: uuid(), name: name.trim(), created_by: req.user.name, date: new Date().toISOString() };
  db.prepare('INSERT INTO practical_subjects (id, name, created_by, date) VALUES (?,?,?,?)').run(row.id, row.name, row.created_by, row.date);
  res.json(row);
});

router.put('/subjects/:id', authenticate, requireRole('staff'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'A section name is required.' });
  const info = db.prepare('UPDATE practical_subjects SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Section not found.' });
  res.json({ ok: true });
});

router.delete('/subjects/:id', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const info = db.prepare('DELETE FROM practical_subjects WHERE id = ?').run(req.params.id); // files cascade via FK
  if (info.changes === 0) return res.status(404).json({ error: 'Section not found.' });
  res.json({ ok: true });
});

/* ---- Files within a practical section ---- */
router.get('/files', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM practical_files ORDER BY date DESC').all());
});

router.post('/files', authenticate, requireRole('staff'), uploadPdf.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received.' });
  const { subjectId } = req.body;
  if (!subjectId) return res.status(400).json({ error: 'Choose a section for this file.' });
  const subject = db.prepare('SELECT * FROM practical_subjects WHERE id = ?').get(subjectId);
  if (!subject) return res.status(400).json({ error: 'That section no longer exists.' });

  const row = { id: uuid(), subject_id: subjectId, original_name: req.file.originalname, stored_name: req.file.filename, uploader: req.user.name, date: new Date().toISOString() };
  db.prepare('INSERT INTO practical_files (id, subject_id, original_name, stored_name, uploader, date) VALUES (?,?,?,?,?,?)')
    .run(row.id, row.subject_id, row.original_name, row.stored_name, row.uploader, row.date);
  res.json(row);
});

router.put('/files/:id/rename', authenticate, requireRole('staff'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'A file name is required.' });
  const info = db.prepare('UPDATE practical_files SET original_name = ? WHERE id = ?').run(name.trim(), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'File not found.' });
  res.json({ ok: true });
});

router.put('/files/:id/replace', authenticate, requireRole('staff'), uploadPdf.single('file'), (req, res) => {
  const file = db.prepare('SELECT * FROM practical_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  deleteStoredFile(file.stored_name);
  db.prepare('UPDATE practical_files SET original_name=?, stored_name=?, date=? WHERE id=?')
    .run(req.file.originalname, req.file.filename, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

router.delete('/files/:id', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const file = db.prepare('SELECT * FROM practical_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  deleteStoredFile(file.stored_name);
  db.prepare('DELETE FROM practical_files WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/files/:id/file', authenticate, (req, res) => {
  const file = db.prepare('SELECT * FROM practical_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  const filePath = path.join(UPLOAD_DIR, file.stored_name);
  if (req.query.download === '1') res.download(filePath, file.original_name);
  else { res.contentType('application/pdf'); res.sendFile(filePath); }
});

module.exports = router;
