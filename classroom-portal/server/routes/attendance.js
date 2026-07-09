const express = require('express');
const XLSX = require('xlsx');
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
    const row = db.prepare('SELECT * FROM attendance WHERE reg_no = ? COLLATE NOCASE').get(req.user.regNo);
    return res.json(row ? [row] : []);
  }
  res.json(db.prepare('SELECT * FROM attendance ORDER BY reg_no').all());
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
    const total = pick(n, ['total', 'totaldays', 'workingdays'], 0);
    const present = pick(n, ['present', 'dayspresent'], 0);
    const absent = pick(n, ['absent', 'daysabsent'], total && present !== '' ? Number(total) - Number(present) : 0);
    return { regNo: pick(n, ['regno', 'registerno', 'registernumber', 'reg']), name: pick(n, ['name', 'studentname']), total, present, absent };
  }).filter((r) => r.regNo);

  const tx = db.transaction((rows) => {
    db.prepare('DELETE FROM attendance').run();
    const stmt = db.prepare('INSERT INTO attendance (reg_no, name, total, present, absent) VALUES (?,?,?,?,?)');
    for (const r of rows) stmt.run(String(r.regNo), String(r.name || ''), Number(r.total) || 0, Number(r.present) || 0, Number(r.absent) || 0);
  });
  tx(parsed);
  res.json({ ok: true, count: parsed.length });
});

// Bulk save from the editable table in the staff/admin UI
router.put('/', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const tx = db.transaction((rows) => {
    db.prepare('DELETE FROM attendance').run();
    const stmt = db.prepare('INSERT INTO attendance (reg_no, name, total, present, absent) VALUES (?,?,?,?,?)');
    for (const r of rows) {
      if (!r.regNo) continue;
      stmt.run(String(r.regNo), String(r.name || ''), Number(r.total) || 0, Number(r.present) || 0, Number(r.absent) || 0);
    }
  });
  tx(rows);
  res.json({ ok: true });
});

router.delete('/:regNo', authenticate, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM attendance WHERE reg_no = ?').run(req.params.regNo);
  res.json({ ok: true });
});

module.exports = router;
