const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts from this device. Please wait a few minutes and try again.' },
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin login attempts from this device. Please wait 15 minutes.' },
});

// Extra per-account lockout for the admin console, independent of IP.
const adminFailures = new Map(); // name -> { count, lockedUntil }
const ADMIN_MAX_FAILS = 5;
const ADMIN_LOCK_MS = 15 * 60 * 1000;

function checkAdminLock(name) {
  const rec = adminFailures.get(name);
  if (rec && rec.lockedUntil && rec.lockedUntil > Date.now()) {
    const minsLeft = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
    return `Too many failed attempts. Try again in about ${minsLeft} minute${minsLeft===1?'':'s'}.`;
  }
  return null;
}
function recordAdminFailure(name) {
  const rec = adminFailures.get(name) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= ADMIN_MAX_FAILS) { rec.lockedUntil = Date.now() + ADMIN_LOCK_MS; rec.count = 0; }
  adminFailures.set(name, rec);
}
function clearAdminFailures(name) { adminFailures.delete(name); }

module.exports = { loginLimiter, adminLoginLimiter, checkAdminLock, recordAdminFailure, clearAdminFailures };
