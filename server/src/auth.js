const jwt = require('jsonwebtoken');

// JWT_SECRET dari environment; jika tidak diisi, dibuat acak & disimpan di database (lihat db.js)
let SECRET = process.env.JWT_SECRET || null;
const setSecret = (s) => { if (!process.env.JWT_SECRET) SECRET = s; };
const COOKIE = 'isms_token';

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name, username: user.username }, SECRET, { expiresIn: '7d' });
}

function setCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE] || (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesi berakhir, silakan login kembali' });
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Anda tidak memiliki akses untuk aksi ini' });
  next();
};

module.exports = { sign, setCookie, requireAuth, requireRole, COOKIE, setSecret };
