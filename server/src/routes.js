const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { sign, setCookie, requireAuth, requireRole, COOKIE } = require('./auth');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype) || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new HttpError(400, 'File harus berupa gambar (JPG/PNG) atau PDF'));
  },
});

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- helpers ----------
function toObjects(r) {
  return r.rows.map((row) => {
    const o = {};
    r.columns.forEach((c, i) => { o[c] = typeof row[i] === 'bigint' ? Number(row[i]) : row[i]; });
    return o;
  });
}
async function all(sql, args = [], ex = db) { return toObjects(await ex.execute({ sql, args })); }
async function one(sql, args = [], ex = db) { return (await all(sql, args, ex))[0] || null; }
async function run(sql, args = [], ex = db) {
  const r = await ex.execute({ sql, args });
  return { id: r.lastInsertRowid !== undefined ? Number(r.lastInsertRowid) : null, changes: r.rowsAffected };
}
async function withTx(fn) {
  const tx = await db.transaction('write');
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    tx.close();
  }
}
const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // WIB
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

async function nextNumber(ex, table, prefix, dateStr) {
  const d = (dateStr || today()).slice(0, 7).replace('-', '/');
  const like = `${prefix}/${d}/%`;
  const r = await one(`SELECT number FROM ${table} WHERE number LIKE ? ORDER BY id DESC LIMIT 1`, [like], ex);
  const seq = r ? int(r.number.split('/').pop()) + 1 : 1;
  return `${prefix}/${d}/${String(seq).padStart(4, '0')}`;
}

async function notify(ex, roles, title, message, link) {
  for (const role of [].concat(roles)) {
    await run('INSERT INTO notifications (role, title, message, link) VALUES (?,?,?,?)', [role, title, message, link], ex);
  }
}

async function saveFile(ex, file, userId) {
  if (!file) return null;
  const r = await run('INSERT INTO files (filename, mime, size, data, uploaded_by) VALUES (?,?,?,?,?)',
    [file.originalname, file.mimetype, file.size, new Uint8Array(file.buffer), userId], ex);
  return r.id;
}

async function balance(ex, location, { productId, poItemId }) {
  if (poItemId) {
    const r = await one('SELECT COALESCE(SUM(qty),0) AS s FROM stock_ledger WHERE location=? AND po_item_id=?', [location, poItemId], ex);
    return int(r.s);
  }
  const r = await one('SELECT COALESCE(SUM(qty),0) AS s FROM stock_ledger WHERE location=? AND product_id=?', [location, productId], ex);
  return int(r.s);
}

async function poItemsProgress(ex, poId) {
  return all(`
    SELECT pi.*, p.code AS product_code, p.name AS product_name, p.flute, p.substance, p.price_m2, p.unit,
      COALESCE((SELECT SUM(bi.qty) FROM bast_items bi JOIN bast b ON b.id=bi.bast_id WHERE bi.po_item_id=pi.id AND b.type='WH_PROD'),0) AS qty_produced,
      COALESCE((SELECT SUM(bi.qty) FROM bast_items bi JOIN bast b ON b.id=bi.bast_id WHERE bi.po_item_id=pi.id AND b.type='PROD_DEL'),0) AS qty_to_delivery,
      COALESCE((SELECT SUM(qty) FROM stock_ledger WHERE location='production' AND po_item_id=pi.id),0) AS stock_production,
      COALESCE((SELECT SUM(qty) FROM stock_ledger WHERE location='delivery' AND po_item_id=pi.id),0) AS stock_delivery,
      COALESCE((SELECT SUM(qty) FROM stock_ledger WHERE location='delivered' AND po_item_id=pi.id),0) AS qty_delivered
    FROM po_items pi JOIN products p ON p.id=pi.product_id WHERE pi.po_id=? ORDER BY pi.id`, [poId], ex);
}

async function refreshPoStatus(ex, poId) {
  const po = await one('SELECT status FROM purchase_orders WHERE id=?', [poId], ex);
  if (!po || po.status === 'batal') return;
  const items = await poItemsProgress(ex, poId);
  const sum = (k) => items.reduce((a, b) => a + int(b[k]), 0);
  const ordered = sum('qty'), produced = sum('qty_produced'), toDel = sum('qty_to_delivery'), delivered = sum('qty_delivered');
  const signed = await one("SELECT COUNT(*) AS n FROM delivery_orders WHERE po_id=? AND status='ditandatangani'", [poId], ex);
  const inv = await one('SELECT COUNT(*) AS n FROM invoices WHERE po_id=?', [poId], ex);
  let status = 'baru';
  if (ordered > 0 && delivered >= ordered) status = int(inv.n) >= int(signed.n) && int(signed.n) > 0 ? 'selesai' : 'terkirim';
  else if (toDel > 0 || delivered > 0) status = 'pengiriman';
  else if (ordered > 0 && produced >= ordered) status = 'siap_kirim';
  else if (produced > 0) status = 'produksi';
  await run('UPDATE purchase_orders SET status=? WHERE id=?', [status, poId], ex);
}

// ---------- auth ----------
router.post('/auth/login', h(async (req, res) => {
  const { username, password } = req.body || {};
  const u = await one('SELECT * FROM users WHERE username=?', [str(username).toLowerCase()]);
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) throw new HttpError(401, 'Username atau password salah');
  if (!u.active) throw new HttpError(403, 'Akun dinonaktifkan, hubungi admin');
  const token = sign(u);
  setCookie(res, token);
  res.json({ user: { id: u.id, username: u.username, name: u.name, role: u.role } });
}));

router.post('/auth/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });

router.use(requireAuth);

router.get('/auth/me', h(async (req, res) => {
  const u = await one('SELECT id, username, name, role, active FROM users WHERE id=?', [req.user.id]);
  if (!u || !u.active) throw new HttpError(401, 'Sesi tidak valid');
  res.json({ user: u });
}));

router.post('/auth/password', h(async (req, res) => {
  const { old_password, new_password } = req.body || {};
  const u = await one('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!bcrypt.compareSync(String(old_password || ''), u.password_hash)) throw new HttpError(400, 'Password lama salah');
  if (str(new_password).length < 6) throw new HttpError(400, 'Password baru minimal 6 karakter');
  await run('UPDATE users SET password_hash=? WHERE id=?', [bcrypt.hashSync(new_password, 10), u.id]);
  res.json({ ok: true });
}));

// ---------- users (admin) ----------
router.get('/users', requireRole('admin'), h(async (req, res) => {
  res.json(await all('SELECT id, username, name, role, active, created_at FROM users ORDER BY role, name'));
}));
router.post('/users', requireRole('admin'), h(async (req, res) => {
  const { username, name, role, password } = req.body || {};
  if (!str(username) || !str(name) || !role || str(password).length < 6) throw new HttpError(400, 'Lengkapi data (password minimal 6 karakter)');
  if (await one('SELECT id FROM users WHERE username=?', [str(username).toLowerCase()])) throw new HttpError(400, 'Username sudah dipakai');
  const r = await run('INSERT INTO users (username, name, role, password_hash) VALUES (?,?,?,?)',
    [str(username).toLowerCase(), str(name), role, bcrypt.hashSync(password, 10)]);
  res.json({ id: r.id });
}));
router.put('/users/:id', requireRole('admin'), h(async (req, res) => {
  const id = int(req.params.id);
  const { name, role, active, password } = req.body || {};
  const u = await one('SELECT * FROM users WHERE id=?', [id]);
  if (!u) throw new HttpError(404, 'User tidak ditemukan');
  if (id === req.user.id && (active === false || active === 0 || (role && role !== 'admin'))) throw new HttpError(400, 'Tidak bisa menonaktifkan / mengubah role akun sendiri');
  await run('UPDATE users SET name=?, role=?, active=? WHERE id=?', [str(name) || u.name, role || u.role, active === undefined ? u.active : (active ? 1 : 0), id]);
  if (password) {
    if (str(password).length < 6) throw new HttpError(400, 'Password minimal 6 karakter');
    await run('UPDATE users SET password_hash=? WHERE id=?', [bcrypt.hashSync(password, 10), id]);
  }
  res.json({ ok: true });
}));

// ---------- settings ----------
router.get('/settings', h(async (req, res) => {
  const rows = await all('SELECT key, value FROM settings');
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}));
router.put('/settings', requireRole('admin'), h(async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    await run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, str(v)]);
  }
  res.json({ ok: true });
}));

// ---------- products ----------
router.get('/products', h(async (req, res) => {
  res.json(await all(`SELECT p.*, COALESCE((SELECT SUM(qty) FROM stock_ledger l WHERE l.location='warehouse' AND l.product_id=p.id),0) AS stock
    FROM products p ORDER BY CASE p.flute WHEN 'B' THEN 1 WHEN 'C' THEN 2 ELSE 3 END, p.code`));
}));
router.post('/products', requireRole('admin', 'warehouse'), h(async (req, res) => {
  const { code, name, flute, substance, price_m2, unit, min_stock } = req.body || {};
  if (!str(code) || !str(name) || !str(flute) || !str(substance)) throw new HttpError(400, 'Kode, nama, flute dan substance wajib diisi');
  if (await one('SELECT id FROM products WHERE code=?', [str(code)])) throw new HttpError(400, 'Kode barang sudah ada');
  const r = await run('INSERT INTO products (code, name, flute, substance, price_m2, unit, min_stock) VALUES (?,?,?,?,?,?,?)',
    [str(code), str(name), str(flute), str(substance), Number(price_m2) || 0, str(unit) || 'lembar', int(min_stock)]);
  res.json({ id: r.id });
}));
router.put('/products/:id', requireRole('admin', 'warehouse'), h(async (req, res) => {
  const p = await one('SELECT * FROM products WHERE id=?', [int(req.params.id)]);
  if (!p) throw new HttpError(404, 'Barang tidak ditemukan');
  const b = { ...p, ...req.body };
  await run('UPDATE products SET name=?, flute=?, substance=?, price_m2=?, unit=?, min_stock=?, active=? WHERE id=?',
    [str(b.name), str(b.flute), str(b.substance), Number(b.price_m2) || 0, str(b.unit) || 'lembar', int(b.min_stock), b.active ? 1 : 0, p.id]);
  res.json({ ok: true });
}));

// ---------- stock ----------
router.get('/stock/warehouse', h(async (req, res) => {
  res.json(await all(`SELECT p.*, COALESCE(SUM(l.qty),0) AS stock
    FROM products p LEFT JOIN stock_ledger l ON l.product_id=p.id AND l.location='warehouse'
    GROUP BY p.id ORDER BY CASE p.flute WHEN 'B' THEN 1 WHEN 'C' THEN 2 ELSE 3 END, p.code`));
}));

async function stockByPoItem(location) {
  return all(`SELECT l.po_item_id, l.po_id, pi.description, p.code AS product_code, p.name AS product_name, p.unit,
      po.po_number, po.customer_name, po.customer_address, SUM(l.qty) AS stock, MAX(l.created_at) AS last_update
    FROM stock_ledger l JOIN po_items pi ON pi.id=l.po_item_id JOIN products p ON p.id=l.product_id JOIN purchase_orders po ON po.id=l.po_id
    WHERE l.location=? GROUP BY l.po_item_id HAVING SUM(l.qty) <> 0 ORDER BY po.customer_name, po.po_number`, [location]);
}
router.get('/stock/production', h(async (req, res) => res.json(await stockByPoItem('production'))));
router.get('/stock/delivery', h(async (req, res) => res.json(await stockByPoItem('delivery'))));

router.get('/stock/ledger', h(async (req, res) => {
  const where = []; const args = [];
  if (req.query.location) { where.push('l.location=?'); args.push(req.query.location); }
  if (req.query.product_id) { where.push('l.product_id=?'); args.push(int(req.query.product_id)); }
  if (req.query.po_id) { where.push('l.po_id=?'); args.push(int(req.query.po_id)); }
  if (req.query.ref_type) { where.push('l.ref_type=?'); args.push(req.query.ref_type); }
  if (req.query.from) { where.push('l.trx_date>=?'); args.push(req.query.from); }
  if (req.query.to) { where.push('l.trx_date<=?'); args.push(req.query.to); }
  const limit = Math.min(int(req.query.limit) || 300, 2000);
  res.json(await all(`SELECT l.*, p.code AS product_code, p.name AS product_name, p.unit, po.po_number, po.customer_name, u.name AS user_name,
      CASE l.ref_type WHEN 'BAST' THEN (SELECT number FROM bast WHERE id=l.ref_id) WHEN 'DO' THEN (SELECT number FROM delivery_orders WHERE id=l.ref_id) ELSE NULL END AS ref_number
    FROM stock_ledger l JOIN products p ON p.id=l.product_id LEFT JOIN purchase_orders po ON po.id=l.po_id LEFT JOIN users u ON u.id=l.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.id DESC LIMIT ${limit}`, args));
}));

router.post('/stock/warehouse/:dir', requireRole('warehouse', 'admin'), h(async (req, res) => {
  const dir = req.params.dir;
  if (!['in', 'out'].includes(dir)) throw new HttpError(404, 'Tidak ditemukan');
  const { product_id, qty, trx_date, party, reference, note } = req.body || {};
  const q = int(qty);
  if (q <= 0) throw new HttpError(400, 'Jumlah harus lebih dari 0');
  const out = await withTx(async (tx) => {
    const p = await one('SELECT * FROM products WHERE id=?', [int(product_id)], tx);
    if (!p) throw new HttpError(400, 'Barang tidak ditemukan');
    if (dir === 'out') {
      const bal = await balance(tx, 'warehouse', { productId: p.id });
      if (bal < q) throw new HttpError(400, `Stok ${p.code} di gudang hanya ${bal} ${p.unit}`);
    }
    const r = await run(`INSERT INTO stock_ledger (location, product_id, qty, ref_type, party, reference, note, trx_date, created_by)
      VALUES ('warehouse',?,?,?,?,?,?,?,?)`,
      [p.id, dir === 'in' ? q : -q, dir === 'in' ? 'SUPPLIER_IN' : 'MANUAL_OUT', str(party), str(reference), str(note), str(trx_date) || today(), req.user.id], tx);
    if (dir === 'in') await notify(tx, 'admin', 'Barang masuk gudang', `${q} ${p.unit} ${p.code} dari ${str(party) || 'supplier'}`, '/stok/gudang');
    else await notify(tx, 'admin', 'Barang keluar gudang', `${q} ${p.unit} ${p.code} — ${str(note) || 'tanpa keterangan'}`, '/stok/gudang');
    return r;
  });
  res.json({ id: out.id });
}));

// ---------- files ----------
router.get('/files/:id', h(async (req, res) => {
  const r = await db.execute({ sql: 'SELECT filename, mime, data FROM files WHERE id=?', args: [int(req.params.id)] });
  if (!r.rows.length) throw new HttpError(404, 'File tidak ditemukan');
  const [filename, mime, data] = r.rows[0];
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`);
  res.send(Buffer.from(data));
}));

// ---------- purchase orders ----------
router.get('/po', h(async (req, res) => {
  const where = []; const args = [];
  if (req.query.status) { where.push('po.status=?'); args.push(req.query.status); }
  if (req.query.q) { where.push('(po.po_number LIKE ? OR po.customer_name LIKE ?)'); args.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  res.json(await all(`SELECT po.*, u.name AS created_by_name,
      (SELECT COALESCE(SUM(qty),0) FROM po_items WHERE po_id=po.id) AS total_qty,
      (SELECT COALESCE(SUM(qty),0) FROM stock_ledger WHERE location='delivered' AND po_id=po.id) AS delivered_qty,
      (SELECT COALESCE(SUM(bi.qty),0) FROM bast_items bi JOIN bast b ON b.id=bi.bast_id WHERE b.po_id=po.id AND b.type='WH_PROD') AS produced_qty,
      (SELECT COUNT(*) FROM po_items WHERE po_id=po.id) AS item_count
    FROM purchase_orders po LEFT JOIN users u ON u.id=po.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY po.id DESC`, args));
}));

router.get('/po/:id', h(async (req, res) => {
  const id = int(req.params.id);
  const po = await one('SELECT po.*, u.name AS created_by_name, f.filename AS file_name, f.mime AS file_mime FROM purchase_orders po LEFT JOIN users u ON u.id=po.created_by LEFT JOIN files f ON f.id=po.file_id WHERE po.id=?', [id]);
  if (!po) throw new HttpError(404, 'PO tidak ditemukan');
  po.items = await poItemsProgress(db, id);
  po.basts = await all('SELECT b.*, (SELECT SUM(qty) FROM bast_items WHERE bast_id=b.id) AS total_qty FROM bast b WHERE po_id=? ORDER BY id', [id]);
  po.delivery_orders = await all('SELECT * FROM delivery_orders WHERE po_id=? ORDER BY id', [id]);
  po.invoices = await all('SELECT * FROM invoices WHERE po_id=? ORDER BY id', [id]);
  res.json(po);
}));

function parseItems(raw) {
  let items = raw;
  if (typeof raw === 'string') { try { items = JSON.parse(raw); } catch { items = []; } }
  return Array.isArray(items) ? items : [];
}

async function writePoItems(tx, poId, items) {
  if (!items.length) throw new HttpError(400, 'Minimal 1 item barang');
  for (const it of items) {
    const p = await one('SELECT id FROM products WHERE id=?', [int(it.product_id)], tx);
    if (!p) throw new HttpError(400, 'Jenis barang tidak valid');
    if (int(it.qty) <= 0) throw new HttpError(400, 'Jumlah item harus lebih dari 0');
    if (!str(it.description)) throw new HttpError(400, 'Deskripsi item wajib diisi (mis. ukuran box & cap customer)');
    await run('INSERT INTO po_items (po_id, product_id, description, qty, sheet_length, sheet_width, unit_price) VALUES (?,?,?,?,?,?,?)',
      [poId, p.id, str(it.description), int(it.qty), Number(it.sheet_length) || null, Number(it.sheet_width) || null, Number(it.unit_price) || null], tx);
  }
}

router.post('/po', requireRole('admin'), upload.single('scan'), h(async (req, res) => {
  const b = req.body || {};
  if (!str(b.po_number) || !str(b.customer_name)) throw new HttpError(400, 'Nomor PO dan nama customer wajib diisi');
  const items = parseItems(b.items);
  const id = await withTx(async (tx) => {
    const fileId = await saveFile(tx, req.file, req.user.id);
    const r = await run(`INSERT INTO purchase_orders (po_number, customer_name, customer_address, customer_phone, po_date, due_date, notes, file_id, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, [str(b.po_number), str(b.customer_name), str(b.customer_address), str(b.customer_phone), str(b.po_date) || today(), str(b.due_date) || null, str(b.notes), fileId, req.user.id], tx);
    await writePoItems(tx, r.id, items);
    await notify(tx, ['warehouse', 'production', 'delivery'], `PO baru: ${str(b.po_number)}`, `Customer ${str(b.customer_name)} — ${items.length} item. Silakan siapkan barang.`, `/po/${r.id}`);
    return r.id;
  });
  res.json({ id });
}));

router.put('/po/:id', requireRole('admin'), upload.single('scan'), h(async (req, res) => {
  const id = int(req.params.id);
  const b = req.body || {};
  await withTx(async (tx) => {
    const po = await one('SELECT * FROM purchase_orders WHERE id=?', [id], tx);
    if (!po) throw new HttpError(404, 'PO tidak ditemukan');
    const used = await one('SELECT COUNT(*) AS n FROM bast WHERE po_id=?', [id], tx);
    const fileId = req.file ? await saveFile(tx, req.file, req.user.id) : po.file_id;
    await run(`UPDATE purchase_orders SET po_number=?, customer_name=?, customer_address=?, customer_phone=?, po_date=?, due_date=?, notes=?, file_id=? WHERE id=?`,
      [str(b.po_number) || po.po_number, str(b.customer_name) || po.customer_name, str(b.customer_address), str(b.customer_phone), str(b.po_date) || po.po_date, str(b.due_date) || null, str(b.notes), fileId, id], tx);
    if (b.items !== undefined) {
      if (int(used.n) > 0) {
        // Hanya harga satuan yang boleh diubah setelah ada BAST
        for (const it of parseItems(b.items)) {
          if (it.id) await run('UPDATE po_items SET unit_price=? WHERE id=? AND po_id=?', [Number(it.unit_price) || null, int(it.id), id], tx);
        }
      } else {
        await run('DELETE FROM po_items WHERE po_id=?', [id], tx);
        await writePoItems(tx, id, parseItems(b.items));
      }
    }
    await notify(tx, ['warehouse', 'production', 'delivery'], `PO diperbarui: ${str(b.po_number) || po.po_number}`, 'Admin memperbarui data PO.', `/po/${id}`);
  });
  res.json({ ok: true });
}));

router.post('/po/:id/cancel', requireRole('admin'), h(async (req, res) => {
  const id = int(req.params.id);
  const used = await one('SELECT COUNT(*) AS n FROM bast WHERE po_id=?', [id]);
  if (int(used.n) > 0) throw new HttpError(400, 'PO sudah diproses (ada BAST), tidak bisa dibatalkan');
  await withTx(async (tx) => {
    await run("UPDATE purchase_orders SET status='batal' WHERE id=?", [id], tx);
    const po = await one('SELECT po_number FROM purchase_orders WHERE id=?', [id], tx);
    await notify(tx, ['warehouse', 'production', 'delivery'], `PO dibatalkan: ${po.po_number}`, 'PO ini dibatalkan oleh admin.', `/po/${id}`);
  });
  res.json({ ok: true });
}));

// ---------- BAST ----------
router.get('/bast', h(async (req, res) => {
  const where = []; const args = [];
  if (req.query.type) { where.push('b.type=?'); args.push(req.query.type); }
  if (req.query.po_id) { where.push('b.po_id=?'); args.push(int(req.query.po_id)); }
  if (req.query.available_for_do) where.push("b.type='PROD_DEL' AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.bast_id=b.id)");
  res.json(await all(`SELECT b.*, po.po_number, po.customer_name, u.name AS created_by_name,
      (SELECT SUM(qty) FROM bast_items WHERE bast_id=b.id) AS total_qty,
      (SELECT id FROM delivery_orders WHERE bast_id=b.id) AS do_id
    FROM bast b JOIN purchase_orders po ON po.id=b.po_id LEFT JOIN users u ON u.id=b.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.id DESC`, args));
}));

router.get('/bast/:id', h(async (req, res) => {
  const b = await one(`SELECT b.*, po.po_number, po.customer_name, po.customer_address, po.customer_phone, u.name AS created_by_name
    FROM bast b JOIN purchase_orders po ON po.id=b.po_id LEFT JOIN users u ON u.id=b.created_by WHERE b.id=?`, [int(req.params.id)]);
  if (!b) throw new HttpError(404, 'BAST tidak ditemukan');
  b.items = await all(`SELECT bi.*, pi.description, p.code AS product_code, p.name AS product_name, p.unit
    FROM bast_items bi JOIN po_items pi ON pi.id=bi.po_item_id JOIN products p ON p.id=bi.product_id WHERE bi.bast_id=? ORDER BY bi.id`, [b.id]);
  b.do = await one('SELECT id, number, status FROM delivery_orders WHERE bast_id=?', [b.id]);
  res.json(b);
}));

router.post('/bast', h(async (req, res) => {
  const { type, po_id, bast_date, giver_name, receiver_name, notes } = req.body || {};
  const role = req.user.role;
  if (type === 'WH_PROD' && !['production', 'admin'].includes(role)) throw new HttpError(403, 'BAST Gudang → Produksi dibuat oleh Produksi');
  if (type === 'PROD_DEL' && !['delivery', 'production', 'admin'].includes(role)) throw new HttpError(403, 'BAST Produksi → Delivery dibuat oleh Delivery');
  if (!['WH_PROD', 'PROD_DEL'].includes(type)) throw new HttpError(400, 'Jenis BAST tidak valid');
  if (!str(giver_name) || !str(receiver_name)) throw new HttpError(400, 'Nama pihak yang menyerahkan dan menerima wajib diisi');
  const items = parseItems(req.body.items).filter((i) => int(i.qty) > 0);
  if (!items.length) throw new HttpError(400, 'Isi jumlah minimal pada 1 item');

  const id = await withTx(async (tx) => {
    const po = await one('SELECT * FROM purchase_orders WHERE id=?', [int(po_id)], tx);
    if (!po) throw new HttpError(400, 'PO tidak ditemukan');
    if (po.status === 'batal') throw new HttpError(400, 'PO sudah dibatalkan');
    const progress = await poItemsProgress(tx, po.id);
    const perProduct = {};
    for (const it of items) {
      const pi = progress.find((p) => p.id === int(it.po_item_id));
      if (!pi) throw new HttpError(400, 'Item tidak termasuk dalam PO ini');
      const q = int(it.qty);
      if (type === 'WH_PROD') {
        const remaining = int(pi.qty) - int(pi.qty_produced);
        if (q > remaining) throw new HttpError(400, `${pi.description}: sisa kebutuhan PO hanya ${remaining}`);
        perProduct[pi.product_id] = (perProduct[pi.product_id] || 0) + q;
      } else if (q > int(pi.stock_production)) {
        throw new HttpError(400, `${pi.description}: stok barang jadi di produksi hanya ${pi.stock_production}`);
      }
      it._pi = pi;
    }
    if (type === 'WH_PROD') {
      for (const [pid, q] of Object.entries(perProduct)) {
        const bal = await balance(tx, 'warehouse', { productId: int(pid) });
        if (bal < q) {
          const p = await one('SELECT code, unit FROM products WHERE id=?', [int(pid)], tx);
          throw new HttpError(400, `Stok ${p.code} di gudang hanya ${bal} ${p.unit}, dibutuhkan ${q}`);
        }
      }
    }
    const prefix = type === 'WH_PROD' ? 'BAST-GP' : 'BAST-PD';
    const date = str(bast_date) || today();
    const number = await nextNumber(tx, 'bast', prefix, date);
    const r = await run('INSERT INTO bast (number, type, po_id, bast_date, giver_name, receiver_name, notes, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [number, type, po.id, date, str(giver_name), str(receiver_name), str(notes), req.user.id], tx);
    const [from, to] = type === 'WH_PROD' ? ['warehouse', 'production'] : ['production', 'delivery'];
    for (const it of items) {
      const q = int(it.qty);
      const pi = it._pi;
      await run('INSERT INTO bast_items (bast_id, po_item_id, product_id, qty) VALUES (?,?,?,?)', [r.id, pi.id, pi.product_id, q], tx);
      const note = `${number} — PO ${po.po_number} (${po.customer_name})`;
      await run(`INSERT INTO stock_ledger (location, product_id, po_id, po_item_id, qty, ref_type, ref_id, party, note, trx_date, created_by) VALUES (?,?,?,?,?,'BAST',?,?,?,?,?)`,
        [from, pi.product_id, po.id, pi.id, -q, r.id, po.customer_name, note, date, req.user.id], tx);
      await run(`INSERT INTO stock_ledger (location, product_id, po_id, po_item_id, qty, ref_type, ref_id, party, note, trx_date, created_by) VALUES (?,?,?,?,?,'BAST',?,?,?,?,?)`,
        [to, pi.product_id, po.id, pi.id, q, r.id, po.customer_name, note, date, req.user.id], tx);
    }
    await refreshPoStatus(tx, po.id);
    if (type === 'WH_PROD') await notify(tx, ['admin', 'warehouse'], `BAST Gudang → Produksi: ${number}`, `PO ${po.po_number} (${po.customer_name}) — barang diserahterimakan ke produksi.`, `/bast/${r.id}`);
    else await notify(tx, ['admin', 'production', 'delivery'], `BAST Produksi → Delivery: ${number}`, `PO ${po.po_number} (${po.customer_name}) — barang jadi siap dikirim.`, `/bast/${r.id}`);
    return r.id;
  });
  res.json({ id });
}));

// ---------- Delivery Orders ----------
router.get('/do', h(async (req, res) => {
  const where = []; const args = [];
  if (req.query.status) { where.push('d.status=?'); args.push(req.query.status); }
  if (req.query.invoiceable) where.push("d.status='ditandatangani' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.do_id=d.id)");
  res.json(await all(`SELECT d.*, po.po_number, po.customer_name, b.number AS bast_number, u.name AS created_by_name,
      (SELECT SUM(qty) FROM bast_items WHERE bast_id=d.bast_id) AS total_qty,
      (SELECT id FROM invoices WHERE do_id=d.id) AS invoice_id,
      (SELECT number FROM invoices WHERE do_id=d.id) AS invoice_number
    FROM delivery_orders d JOIN purchase_orders po ON po.id=d.po_id JOIN bast b ON b.id=d.bast_id LEFT JOIN users u ON u.id=d.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.id DESC`, args));
}));

router.get('/do/:id', h(async (req, res) => {
  const d = await one(`SELECT d.*, po.po_number, po.customer_name, po.customer_address, po.customer_phone, po.po_date, b.number AS bast_number,
      u.name AS created_by_name, f.filename AS signed_file_name, f.mime AS signed_file_mime
    FROM delivery_orders d JOIN purchase_orders po ON po.id=d.po_id JOIN bast b ON b.id=d.bast_id LEFT JOIN users u ON u.id=d.created_by LEFT JOIN files f ON f.id=d.signed_file_id
    WHERE d.id=?`, [int(req.params.id)]);
  if (!d) throw new HttpError(404, 'DO tidak ditemukan');
  d.items = await all(`SELECT bi.*, pi.description, pi.sheet_length, pi.sheet_width, pi.unit_price, p.code AS product_code, p.name AS product_name, p.unit, p.price_m2
    FROM bast_items bi JOIN po_items pi ON pi.id=bi.po_item_id JOIN products p ON p.id=bi.product_id WHERE bi.bast_id=? ORDER BY bi.id`, [d.bast_id]);
  d.items.forEach((it) => {
    const area = it.sheet_length && it.sheet_width ? (it.sheet_length * it.sheet_width) / 1e6 : null;
    it.suggested_price = it.unit_price || (area ? Math.round(area * it.price_m2) : 0);
  });
  d.invoice = await one('SELECT id, number, status FROM invoices WHERE do_id=?', [d.id]);
  res.json(d);
}));

router.post('/do', requireRole('delivery', 'admin'), h(async (req, res) => {
  const { bast_id, do_date, driver, vehicle_no, ship_to, notes } = req.body || {};
  const id = await withTx(async (tx) => {
    const b = await one('SELECT b.*, po.po_number, po.customer_name, po.customer_address FROM bast b JOIN purchase_orders po ON po.id=b.po_id WHERE b.id=?', [int(bast_id)], tx);
    if (!b || b.type !== 'PROD_DEL') throw new HttpError(400, 'Pilih BAST Produksi → Delivery yang valid');
    if (await one('SELECT id FROM delivery_orders WHERE bast_id=?', [b.id], tx)) throw new HttpError(400, 'BAST ini sudah dibuatkan DO');
    const date = str(do_date) || today();
    const number = await nextNumber(tx, 'delivery_orders', 'DO', date);
    const r = await run('INSERT INTO delivery_orders (number, bast_id, po_id, do_date, driver, vehicle_no, ship_to, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [number, b.id, b.po_id, date, str(driver), str(vehicle_no), str(ship_to) || b.customer_address, str(notes), req.user.id], tx);
    await notify(tx, 'admin', `DO dibuat: ${number}`, `PO ${b.po_number} (${b.customer_name}) sedang disiapkan untuk dikirim.`, `/do/${r.id}`);
    return r.id;
  });
  res.json({ id });
}));

router.post('/do/:id/ship', requireRole('delivery', 'admin'), h(async (req, res) => {
  const d = await one('SELECT * FROM delivery_orders WHERE id=?', [int(req.params.id)]);
  if (!d) throw new HttpError(404, 'DO tidak ditemukan');
  if (d.status !== 'dibuat') throw new HttpError(400, 'DO sudah dalam pengiriman / selesai');
  await run("UPDATE delivery_orders SET status='dikirim' WHERE id=?", [d.id]);
  res.json({ ok: true });
}));

router.post('/do/:id/signed', requireRole('delivery', 'admin'), upload.single('scan'), h(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Upload scan / foto DO yang sudah ditandatangani customer');
  await withTx(async (tx) => {
    const d = await one('SELECT d.*, po.po_number, po.customer_name FROM delivery_orders d JOIN purchase_orders po ON po.id=d.po_id WHERE d.id=?', [int(req.params.id)], tx);
    if (!d) throw new HttpError(404, 'DO tidak ditemukan');
    const fileId = await saveFile(tx, req.file, req.user.id);
    if (d.status === 'ditandatangani') {
      // ganti file scan saja
      await run('UPDATE delivery_orders SET signed_file_id=? WHERE id=?', [fileId, d.id], tx);
      return;
    }
    const date = str(req.body.signed_at) || today();
    await run("UPDATE delivery_orders SET status='ditandatangani', signed_file_id=?, signed_at=?, received_by_customer=? WHERE id=?",
      [fileId, date, str(req.body.received_by_customer), d.id], tx);
    const items = await all('SELECT * FROM bast_items WHERE bast_id=?', [d.bast_id], tx);
    for (const it of items) {
      const note = `${d.number} — diterima ${d.customer_name}`;
      await run(`INSERT INTO stock_ledger (location, product_id, po_id, po_item_id, qty, ref_type, ref_id, party, note, trx_date, created_by) VALUES ('delivery',?,?,?,?,'DO',?,?,?,?,?)`,
        [it.product_id, d.po_id, it.po_item_id, -it.qty, d.id, d.customer_name, note, date, req.user.id], tx);
      await run(`INSERT INTO stock_ledger (location, product_id, po_id, po_item_id, qty, ref_type, ref_id, party, note, trx_date, created_by) VALUES ('delivered',?,?,?,?,'DO',?,?,?,?,?)`,
        [it.product_id, d.po_id, it.po_item_id, it.qty, d.id, d.customer_name, note, date, req.user.id], tx);
    }
    await refreshPoStatus(tx, d.po_id);
    await notify(tx, 'admin', `DO bertanda tangan: ${d.number}`, `Customer ${d.customer_name} sudah menerima barang. Silakan buat invoice.`, `/do/${d.id}`);
  });
  res.json({ ok: true });
}));

router.post('/do/:id/receive', requireRole('admin'), h(async (req, res) => {
  await run("UPDATE delivery_orders SET admin_received_at=datetime('now') WHERE id=? AND status='ditandatangani' AND admin_received_at IS NULL", [int(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- Invoices ----------
router.get('/invoices', requireRole('admin'), h(async (req, res) => {
  res.json(await all(`SELECT i.*, po.po_number, po.customer_name, d.number AS do_number FROM invoices i
    JOIN purchase_orders po ON po.id=i.po_id JOIN delivery_orders d ON d.id=i.do_id ORDER BY i.id DESC`));
}));

router.get('/invoices/:id', requireRole('admin'), h(async (req, res) => {
  const i = await one(`SELECT i.*, po.po_number, po.po_date, po.customer_name, po.customer_address, po.customer_phone, d.number AS do_number, d.do_date
    FROM invoices i JOIN purchase_orders po ON po.id=i.po_id JOIN delivery_orders d ON d.id=i.do_id WHERE i.id=?`, [int(req.params.id)]);
  if (!i) throw new HttpError(404, 'Invoice tidak ditemukan');
  i.items = await all('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY id', [i.id]);
  res.json(i);
}));

router.post('/invoices', requireRole('admin'), h(async (req, res) => {
  const { do_id, invoice_date, due_date, tax_rate, notes } = req.body || {};
  const items = parseItems(req.body.items).filter((it) => int(it.qty) > 0);
  if (!items.length) throw new HttpError(400, 'Invoice minimal 1 item');
  const id = await withTx(async (tx) => {
    const d = await one('SELECT * FROM delivery_orders WHERE id=?', [int(do_id)], tx);
    if (!d) throw new HttpError(400, 'DO tidak ditemukan');
    if (d.status !== 'ditandatangani') throw new HttpError(400, 'Invoice hanya bisa dibuat dari DO yang sudah ditandatangani customer');
    if (await one('SELECT id FROM invoices WHERE do_id=?', [d.id], tx)) throw new HttpError(400, 'DO ini sudah dibuatkan invoice');
    const subtotal = items.reduce((a, it) => a + int(it.qty) * (Number(it.unit_price) || 0), 0);
    const rate = Number(tax_rate) || 0;
    const tax = Math.round(subtotal * rate / 100);
    const date = str(invoice_date) || today();
    const number = await nextNumber(tx, 'invoices', 'INV', date);
    const r = await run('INSERT INTO invoices (number, do_id, po_id, invoice_date, due_date, subtotal, tax_rate, tax, total, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [number, d.id, d.po_id, date, str(due_date) || null, subtotal, rate, tax, subtotal + tax, str(notes), req.user.id], tx);
    for (const it of items) {
      const q = int(it.qty), p = Number(it.unit_price) || 0;
      await run('INSERT INTO invoice_items (invoice_id, description, qty, unit, unit_price, amount) VALUES (?,?,?,?,?,?)', [r.id, str(it.description), q, str(it.unit) || 'pcs', p, q * p], tx);
    }
    await run("UPDATE delivery_orders SET admin_received_at=COALESCE(admin_received_at, datetime('now')) WHERE id=?", [d.id], tx);
    await refreshPoStatus(tx, d.po_id);
    return r.id;
  });
  res.json({ id });
}));

router.put('/invoices/:id/status', requireRole('admin'), h(async (req, res) => {
  const status = req.body.status === 'lunas' ? 'lunas' : 'belum_lunas';
  await run('UPDATE invoices SET status=?, paid_at=? WHERE id=?', [status, status === 'lunas' ? today() : null, int(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- notifications ----------
router.get('/notifications', h(async (req, res) => {
  res.json(await all(`SELECT n.*, CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS is_read FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=? WHERE n.role=? ORDER BY n.id DESC LIMIT 50`, [req.user.id, req.user.role]));
}));
router.post('/notifications/read', h(async (req, res) => {
  const ids = req.body.ids;
  if (Array.isArray(ids) && ids.length) {
    for (const id of ids) await run('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?,?)', [int(id), req.user.id]);
  } else {
    await run('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) SELECT id, ? FROM notifications WHERE role=?', [req.user.id, req.user.role]);
  }
  res.json({ ok: true });
}));

// ---------- search ----------
router.get('/search', h(async (req, res) => {
  const q = `%${str(req.query.q)}%`;
  if (str(req.query.q).length < 2) return res.json([]);
  const out = [];
  (await all('SELECT id, po_number, customer_name FROM purchase_orders WHERE po_number LIKE ? OR customer_name LIKE ? ORDER BY id DESC LIMIT 6', [q, q]))
    .forEach((r) => out.push({ type: 'PO', label: r.po_number, sub: r.customer_name, link: `/po/${r.id}` }));
  (await all('SELECT b.id, b.number, po.customer_name FROM bast b JOIN purchase_orders po ON po.id=b.po_id WHERE b.number LIKE ? OR po.customer_name LIKE ? ORDER BY b.id DESC LIMIT 5', [q, q]))
    .forEach((r) => out.push({ type: 'BAST', label: r.number, sub: r.customer_name, link: `/bast/${r.id}` }));
  (await all('SELECT d.id, d.number, po.customer_name FROM delivery_orders d JOIN purchase_orders po ON po.id=d.po_id WHERE d.number LIKE ? OR po.customer_name LIKE ? ORDER BY d.id DESC LIMIT 5', [q, q]))
    .forEach((r) => out.push({ type: 'DO', label: r.number, sub: r.customer_name, link: `/do/${r.id}` }));
  if (req.user.role === 'admin') {
    (await all('SELECT i.id, i.number, po.customer_name FROM invoices i JOIN purchase_orders po ON po.id=i.po_id WHERE i.number LIKE ? OR po.customer_name LIKE ? ORDER BY i.id DESC LIMIT 5', [q, q]))
      .forEach((r) => out.push({ type: 'Invoice', label: r.number, sub: r.customer_name, link: `/invoice/${r.id}` }));
  }
  (await all('SELECT id, code, name FROM products WHERE code LIKE ? OR name LIKE ? LIMIT 5', [q, q]))
    .forEach((r) => out.push({ type: 'Barang', label: r.code, sub: r.name, link: `/stok/gudang?q=${encodeURIComponent(r.code)}` }));
  res.json(out);
}));

// ---------- dashboard ----------
router.get('/dashboard', h(async (req, res) => {
  const sumLoc = async (loc) => int((await one('SELECT COALESCE(SUM(qty),0) AS s FROM stock_ledger WHERE location=?', [loc])).s);
  const month = today().slice(0, 7);
  const totals = {
    warehouse: await sumLoc('warehouse'),
    production: await sumLoc('production'),
    delivery: await sumLoc('delivery'),
    delivered_month: int((await one("SELECT COALESCE(SUM(qty),0) AS s FROM stock_ledger WHERE location='delivered' AND substr(trx_date,1,7)=?", [month])).s),
  };
  const poStatus = Object.fromEntries((await all('SELECT status, COUNT(*) AS n FROM purchase_orders GROUP BY status')).map((r) => [r.status, int(r.n)]));

  // pergerakan 7 hari terakhir
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() + 7 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10);
    days.push(d);
  }
  const mv = await all(`SELECT trx_date,
      SUM(CASE WHEN location='warehouse' AND ref_type='SUPPLIER_IN' THEN qty ELSE 0 END) AS masuk,
      SUM(CASE WHEN location='production' AND qty>0 THEN qty ELSE 0 END) AS produksi,
      SUM(CASE WHEN location='delivered' THEN qty ELSE 0 END) AS terkirim
    FROM stock_ledger WHERE trx_date>=? GROUP BY trx_date`, [days[0]]);
  const movement = days.map((d) => {
    const r = mv.find((m) => m.trx_date === d) || {};
    return { date: d, masuk: int(r.masuk), produksi: int(r.produksi), terkirim: int(r.terkirim) };
  });

  const recentPo = await all(`SELECT po.id, po.po_number, po.customer_name, po.status, po.po_date, po.due_date,
      (SELECT COALESCE(SUM(qty),0) FROM po_items WHERE po_id=po.id) AS total_qty,
      (SELECT COALESCE(SUM(qty),0) FROM stock_ledger WHERE location='delivered' AND po_id=po.id) AS delivered_qty,
      (SELECT COALESCE(SUM(bi.qty),0) FROM bast_items bi JOIN bast b ON b.id=bi.bast_id WHERE b.po_id=po.id AND b.type='WH_PROD') AS produced_qty
    FROM purchase_orders po WHERE po.status <> 'batal' ORDER BY po.id DESC LIMIT 6`);
  const lowStock = await all(`SELECT p.id, p.code, p.name, p.unit, p.min_stock, COALESCE(SUM(l.qty),0) AS stock FROM products p
    LEFT JOIN stock_ledger l ON l.product_id=p.id AND l.location='warehouse' WHERE p.active=1 AND p.min_stock>0
    GROUP BY p.id HAVING stock <= p.min_stock ORDER BY stock ASC LIMIT 6`);
  const signedDo = await all(`SELECT d.id, d.number, d.signed_at, d.admin_received_at, po.customer_name, po.po_number FROM delivery_orders d
    JOIN purchase_orders po ON po.id=d.po_id WHERE d.status='ditandatangani' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.do_id=d.id) ORDER BY d.id DESC LIMIT 6`);
  const activity = await all(`SELECT l.id, l.location, l.qty, l.ref_type, l.note, l.party, l.created_at, p.code AS product_code, u.name AS user_name
    FROM stock_ledger l JOIN products p ON p.id=l.product_id LEFT JOIN users u ON u.id=l.created_by ORDER BY l.id DESC LIMIT 8`);
  const inv = await one("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS t FROM invoices WHERE status='belum_lunas'");
  const invMonth = await one('SELECT COALESCE(SUM(total),0) AS t FROM invoices WHERE substr(invoice_date,1,7)=?', [month]);
  const doOpen = await one("SELECT COUNT(*) AS n FROM delivery_orders WHERE status IN ('dibuat','dikirim')");
  const bastMonth = await one("SELECT COUNT(*) AS n FROM bast WHERE substr(bast_date,1,7)=?", [month]);
  const productCount = await one('SELECT COUNT(*) AS n FROM products WHERE active=1');
  const inMonth = int((await one("SELECT COALESCE(SUM(qty),0) AS s FROM stock_ledger WHERE location='warehouse' AND ref_type='SUPPLIER_IN' AND substr(trx_date,1,7)=?", [month])).s);
  const outMonth = -int((await one("SELECT COALESCE(SUM(qty),0) AS s FROM stock_ledger WHERE location='warehouse' AND qty<0 AND substr(trx_date,1,7)=?", [month])).s);

  res.json({
    totals, poStatus, movement, recentPo, lowStock, signedDo, activity,
    invoice: { unpaid_count: int(inv.n), unpaid_total: Number(inv.t), month_total: Number(invMonth.t) },
    doOpen: int(doOpen.n), bastMonth: int(bastMonth.n), productCount: int(productCount.n), inMonth, outMonth,
  });
}));

// ---------- error handler ----------
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 10 MB' : err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

module.exports = router;
