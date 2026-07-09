const express = require('express');
const XLSX = require('xlsx');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware');
const { uploadSpreadsheet } = require('../uploadUtil');

const router = express.Router();

function normRow(row) {
  const out = {};
  for (const k in row) out[String(k).trim().toLowerCase().replace(/[\s_]+/g, '')] = row[k];
  return out;
}
function pick(n, keys, def = '') {
  for (const k of keys) if (n[k] !== undefined && n[k] !== '') return n[k];
  return def;
}

router.get('/', authenticate, (req, res) => {
  if (req.user.role === 'student') {
    return res.json(db.prepare('SELECT * FROM semresults WHERE reg_no = ? COLLATE NOCASE ORDER BY semester').all(req.user.regNo));
  }
  res.json(db.prepare('SELECT * FROM semresults ORDER BY reg_no, semester').all());
});

router.post('/upload', authenticate, requireRole('staff'), uploadSpreadsheet.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received.' });
  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  } catch (e) {
    return res.status(400).json({ error: 'Could not read that spreadsheet.' });
  }
  const parsed = rows.map((r) => {
    const n = normRow(r);
    return {
      regNo: pick(n, ['regno', 'registerno', 'registernumber', 'reg']),
      name: pick(n, ['name', 'studentname']),
      semester: pick(n, ['semester', 'sem']),
      sgpa: pick(n, ['sgpa', 'gpa']),
      credits: pick(n, ['credits', 'credit']),
    };
  }).filter((r) => r.regNo);

  const tx = db.transaction((rows) => {
    db.prepare('DELETE FROM semresults').run();
    const stmt = db.prepare('INSERT INTO semresults (id, reg_no, name, semester, sgpa, credits) VALUES (?,?,?,?,?,?)');
    for (const r of rows) stmt.run(uuid(), String(r.regNo), String(r.name || ''), String(r.semester || ''), String(r.sgpa || ''), String(r.credits || ''));
  });
  tx(parsed);
  res.json({ ok: true, count: parsed.length });
});

router.put('/', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const tx = db.transaction((rows) => {
    db.prepare('DELETE FROM semresults').run();
    const stmt = db.prepare('INSERT INTO semresults (id, reg_no, name, semester, sgpa, credits) VALUES (?,?,?,?,?,?)');
    for (const r of rows) {
      if (!r.regNo) continue;
      stmt.run(r.id || uuid(), String(r.regNo), String(r.name || ''), String(r.semester || ''), String(r.sgpa || ''), String(r.credits || ''));
    }
  });
  tx(rows);
  res.json({ ok: true });
});

router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM semresults WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
