const { verifyToken, COOKIE_NAME } = require('./auth');

function authenticate(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not logged in.' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  req.user = payload; // { role, regNo, name }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
