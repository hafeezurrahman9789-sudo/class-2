const express = require('express');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware');
const { uploadPdf, deleteStoredFile, UPLOAD_DIR } = require('../uploadUtil');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  if (req.user.role === 'student') {
    return res.json(db.prepare('SELECT * FROM submissions WHERE reg_no = ? COLLATE NOCASE').all(req.user.regNo));
  }
  res.json(db.prepare('SELECT * FROM submissions ORDER BY date DESC').all());
});

// Student submits or resubmits their PDF for a given assignment
router.post('/', authenticate, requireRole('student'), uploadPdf.single('file'), (req, res) => {
  const { assignmentId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file received.' });
  if (!assignmentId) return res.status(400).json({ error: 'Missing assignment.' });

  const existing = db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND reg_no = ? COLLATE NOCASE').get(assignmentId, req.user.regNo);
  if (existing) deleteStoredFile(existing.stored_name);

  const row = {
    id: existing ? existing.id : uuid(),
    assignment_id: assignmentId,
    reg_no: req.user.regNo,
    student_name: req.user.name,
    original_name: req.file.originalname,
    stored_name: req.file.filename,
    date: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO submissions (id, assignment_id, reg_no, student_name, original_name, stored_name, date, review, marks)
    VALUES (@id, @assignment_id, @reg_no, @student_name, @original_name, @stored_name, @date, '', '')
    ON CONFLICT(assignment_id, reg_no) DO UPDATE SET
      original_name=excluded.original_name, stored_name=excluded.stored_name, date=excluded.date
  `).run(row);
  res.json(row);
});

router.put('/:id/review', authenticate, requireRole('staff'), (req, res) => {
  const { review, marks } = req.body;
  const info = db.prepare('UPDATE submissions SET review = ?, marks = ? WHERE id = ?').run(review || '', marks || '', req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Submission not found.' });
  res.json({ ok: true });
});

router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
  const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found.' });
  deleteStoredFile(sub.stored_name);
  db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/:id/file', authenticate, (req, res) => {
  const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Not found.' });
  // Students may only open their own submission; staff/admin may open any.
  if (req.user.role === 'student' && sub.reg_no.toLowerCase() !== req.user.regNo.toLowerCase()) {
    return res.status(403).json({ error: 'Not your submission.' });
  }
  const filePath = path.join(UPLOAD_DIR, sub.stored_name);
  if (req.query.download === '1') res.download(filePath, sub.original_name);
  else { res.contentType('application/pdf'); res.sendFile(filePath); }
});

module.exports = router;
