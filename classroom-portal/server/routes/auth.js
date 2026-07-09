const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { setSessionCookie, clearSessionCookie } = require('../auth');
const { authenticate } = require('../middleware');
const { loginLimiter, adminLoginLimiter, checkAdminLock, recordAdminFailure, clearAdminFailures } = require('../rateLimiter');

const router = express.Router();

function logAction(role, regNo, name, action) {
  db.prepare('INSERT INTO logs (role, reg_no, name, action, time) VALUES (?,?,?,?,?)')
    .run(role, regNo || null, name || null, action, new Date().toISOString());
}

// Student/staff login — register number + name. First time a register
// number is used, the account is created and the name saved; every login
// after that just checks the name against what's on file.
router.post('/login', loginLimiter, (req, res) => {
  const { role, regNo, name } = req.body;
  if (!['student', 'staff'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (!regNo || !regNo.trim()) return res.status(400).json({ error: 'Register number is required.' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });

  const table = role === 'student' ? 'students' : 'staff';
  const existing = db.prepare(`SELECT * FROM ${table} WHERE reg_no = ? COLLATE NOCASE`).get(regNo.trim());

  let user;
  if (existing) {
    if (existing.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
      return res.status(401).json({ error: "That name doesn't match our records for this register number." });
    }
    user = existing;
  } else {
    user = { id: uuid(), reg_no: regNo.trim(), name: name.trim(), created_at: new Date().toISOString() };
    db.prepare(`INSERT INTO ${table} (id, reg_no, name, created_at) VALUES (?,?,?,?)`)
      .run(user.id, user.reg_no, user.name, user.created_at);
  }

  setSessionCookie(res, { role, regNo: user.reg_no, name: user.name });
  logAction(role, user.reg_no, user.name, 'login');
  res.json({ role, regNo: user.reg_no, name: user.name });
});

router.post('/admin-login', adminLoginLimiter, (req, res) => {
  const { name, password } = req.body;
  const lockMsg = checkAdminLock(name || '');
  if (lockMsg) return res.status(429).json({ error: lockMsg });

  const ok = name === (process.env.ADMIN_NAME || 'Administrator') && password === (process.env.ADMIN_PASSWORD || 'Admin2026');
  if (!ok) {
    recordAdminFailure(name || 'unknown');
    return res.status(401).json({ error: 'Incorrect name or password.' });
  }
  clearAdminFailures(name);
  setSessionCookie(res, { role: 'admin', regNo: null, name: 'Administrator' });
  logAction('admin', null, 'Administrator', 'login');
  res.json({ role: 'admin', name: 'Administrator' });
});

router.post('/logout', authenticate, (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

module.exports = router;
