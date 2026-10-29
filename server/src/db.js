const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const url = process.env.DATABASE_URL || 'file:' + path.join(__dirname, '..', 'data', 'inventory.db');
if (url.startsWith('file:')) {
  fs.mkdirSync(path.dirname(url.replace(/^file:/, '')), { recursive: true });
}

const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','warehouse','production','delivery')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  flute TEXT NOT NULL,
  substance TEXT NOT NULL,
  price_m2 REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'lembar',
  min_stock INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'sheet',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  uploaded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_address TEXT,
  customer_phone TEXT,
  po_date TEXT NOT NULL,
  due_date TEXT,
  notes TEXT,
  file_id INTEGER,
  status TEXT NOT NULL DEFAULT 'baru',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS po_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  qty INTEGER NOT NULL,
  sheet_length REAL,
  sheet_width REAL,
  unit_price REAL
);
CREATE TABLE IF NOT EXISTS bast (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('WH_PROD','PROD_DEL','WH_DEL')),
  po_id INTEGER NOT NULL,
  bast_date TEXT NOT NULL,
  giver_name TEXT NOT NULL,
  receiver_name TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bast_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bast_id INTEGER NOT NULL,
  po_item_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location TEXT NOT NULL CHECK (location IN ('warehouse','production','delivery','delivered')),
  product_id INTEGER NOT NULL,
  po_id INTEGER,
  po_item_id INTEGER,
  qty INTEGER NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id INTEGER,
  party TEXT,
  reference TEXT,
  note TEXT,
  trx_date TEXT NOT NULL DEFAULT (date('now')),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_loc ON stock_ledger(location, product_id);
CREATE INDEX IF NOT EXISTS idx_ledger_poitem ON stock_ledger(location, po_item_id);
CREATE TABLE IF NOT EXISTS delivery_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  bast_id INTEGER NOT NULL UNIQUE,
  po_id INTEGER NOT NULL,
  do_date TEXT NOT NULL,
  driver TEXT,
  vehicle_no TEXT,
  ship_to TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'dibuat',
  signed_file_id INTEGER,
  signed_at TEXT,
  received_by_customer TEXT,
  admin_received_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  do_id INTEGER NOT NULL UNIQUE,
  po_id INTEGER NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  subtotal REAL NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'belum_lunas',
  paid_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit TEXT,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);
CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

// Daftar harga & substance dari tabel referensi (Harga include / m2)
const PRICE_TABLE = [
  [4322, 4420, 7318, 'M125', 'M125', 'M125'],
  [4450, 4549, 7446, 'K125', 'M125', 'M125'],
  [4578, 4677, 7575, 'K125', 'M125', 'K125'],
  [4673, 4772, 7669, 'K150', 'M125', 'M125'],
  [4801, 4900, 7798, 'K150', 'M125', 'K125'],
  [5024, 5123, 8020, 'K150', 'M125', 'K150'],
  [5316, 5418, 8427, 'K200', 'M125', 'M125'],
  [5449, 5551, 8560, 'K200', 'M125', 'K125'],
  [5680, 5783, 8792, 'K200', 'M125', 'K150'],
  [6143, 6245, 9254, 'K200', 'M125', 'K200'],
  [6587, 6694, 9814, 'K275', 'M125', 'M125'],
  [6727, 6833, 9953, 'K275', 'M125', 'K125'],
  [6966, 7073, 10193, 'K275', 'M125', 'K150'],
  [7446, 7552, 10673, 'K275', 'M125', 'K200'],
  [8826, 8936, 12168, 'K275', 'M125', 'K275'],
  [5200, 5302, 8311, 'WK150', 'M125', 'M125'],
  [5333, 5436, 8445, 'WK150', 'M125', 'K125'],
  [5565, 5667, 8676, 'WK150', 'M125', 'K150'],
  [6027, 6130, 9139, 'WK150', 'M125', 'K200'],
  [7326, 7432, 10553, 'WK150', 'M125', 'K275'],
  [6350, 6460, 9692, 'WK150', 'M125', 'WK150'],
  [5778, 5881, 8890, 'WK200', 'M125', 'M125'],
  [5912, 6014, 9023, 'WK200', 'M125', 'K125'],
  [6143, 6245, 9254, 'WK200', 'M125', 'K150'],
  [6607, 6708, 9718, 'WK200', 'M125', 'K200'],
  [7926, 8032, 11153, 'WK200', 'M125', 'K275'],
  [6971, 7081, 10313, 'WK200', 'M125', 'WK150'],
  [7592, 7702, 10935, 'WK200', 'M125', 'WK200'],
];

async function migrate() {
  await db.executeMultiple(SCHEMA);

  const users = await db.execute('SELECT COUNT(*) AS n FROM users');
  if (Number(users.rows[0].n) === 0) {
    const seedUsers = [
      ['admin', 'admin123', 'Administrator', 'admin'],
      ['gudang', 'gudang123', 'Staff Gudang', 'warehouse'],
      ['produksi', 'produksi123', 'Staff Produksi', 'production'],
      ['delivery', 'delivery123', 'Staff Delivery', 'delivery'],
    ];
    for (const [u, p, n, r] of seedUsers) {
      await db.execute({
        sql: 'INSERT INTO users (username, password_hash, name, role) VALUES (?,?,?,?)',
        args: [u, bcrypt.hashSync(p, 10), n, r],
      });
    }
    console.log('[seed] akun default dibuat (admin/gudang/produksi/delivery)');
  }

  const prods = await db.execute('SELECT COUNT(*) AS n FROM products');
  if (Number(prods.rows[0].n) === 0) {
    const stmts = [];
    PRICE_TABLE.forEach((row, i) => {
      const no = String(i + 1).padStart(2, '0');
      const subs = `${row[3]}/${row[4]}/${row[5]}`;
      [['B', row[0]], ['C', row[1]], ['CB', row[2]]].forEach(([flute, price]) => {
        stmts.push({
          sql: 'INSERT INTO products (code, name, flute, substance, price_m2) VALUES (?,?,?,?,?)',
          args: [`${flute}-${no}`, `Karton Flute ${flute} ${subs}`, flute, subs, price],
        });
      });
    });
    await db.batch(stmts, 'write');
    console.log(`[seed] ${stmts.length} jenis barang karton dibuat`);
  }

  // Secret JWT: pakai env bila ada, kalau tidak buat acak sekali & simpan di DB
  await db.execute({ sql: 'INSERT OR IGNORE INTO app_secrets (key, value) VALUES (?, ?)', args: ['jwt_secret', require('crypto').randomBytes(48).toString('hex')] });
  const sec = await db.execute("SELECT value FROM app_secrets WHERE key='jwt_secret'");
  require('./auth').setSecret(String(sec.rows[0][0]));

  const v = await db.execute("SELECT value FROM settings WHERE key='schema_version'");
  const version = v.rows.length ? Number(v.rows[0][0]) : 1;
  if (version < 2) await migrateV2();
}

const COMPANY = {
  company_name: 'PT Jitu Persada Sinergi',
  company_tagline: 'Sinergi Profesional Terpercaya',
  company_address: 'Greenville Residence Solo',
  company_phone: '081325240263',
  company_email: '',
  company_city: 'Surakarta',
  bank_accounts: JSON.stringify([{ bank: 'Bank Mandiri', account: '135.002.133946.8', holder: 'AGUNG SUBAGIO' }]),
  invoice_signer: 'AGUNG SUBAGIO',
  invoice_note: 'Kirimkan Bukti Transfer apabila sudah melakukan pembayaran. Terima Kasih',
  sj_gudang_name: '',
  sj_admin_name: '',
  tax_rate: '0',
  invoice_due_days: '30',
};

/** v2: kategori Sheet/Box, BAST Gudang→Delivery, dokumen DO/Invoice manual, profil PT Jitu Persada Sinergi */
async function migrateV2() {
  const cols = async (t) => (await db.execute(`PRAGMA table_info(${t})`)).rows.map((r) => r[1]);
  if (!(await cols('products')).includes('category')) await db.execute("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'sheet'");
  if (!(await cols('delivery_orders')).includes('doc_data')) await db.execute('ALTER TABLE delivery_orders ADD COLUMN doc_data TEXT');
  if (!(await cols('invoices')).includes('doc_data')) await db.execute('ALTER TABLE invoices ADD COLUMN doc_data TEXT');

  // BAST lama hanya mengizinkan WH_PROD / PROD_DEL → bangun ulang tabel dengan WH_DEL
  const bsql = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='bast'");
  if (bsql.rows.length && !String(bsql.rows[0][0]).includes('WH_DEL')) {
    await db.batch([
      `CREATE TABLE bast_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('WH_PROD','PROD_DEL','WH_DEL')),
        po_id INTEGER NOT NULL,
        bast_date TEXT NOT NULL,
        giver_name TEXT NOT NULL,
        receiver_name TEXT NOT NULL,
        notes TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      'INSERT INTO bast_v2 (id, number, type, po_id, bast_date, giver_name, receiver_name, notes, created_by, created_at) SELECT id, number, type, po_id, bast_date, giver_name, receiver_name, notes, created_by, created_at FROM bast',
      'DROP TABLE bast',
      'ALTER TABLE bast_v2 RENAME TO bast',
    ], 'write');
  }

  // Master barang BOX: isi sama dengan Sheet
  const box = await db.execute("SELECT COUNT(*) FROM products WHERE category='box'");
  if (Number(box.rows[0][0]) === 0) {
    const stmts = [];
    PRICE_TABLE.forEach((row, i) => {
      const no = String(i + 1).padStart(2, '0');
      const subs = `${row[3]}/${row[4]}/${row[5]}`;
      [['B', row[0]], ['C', row[1]], ['CB', row[2]]].forEach(([flute, price]) => {
        stmts.push({
          sql: "INSERT OR IGNORE INTO products (code, name, flute, substance, price_m2, unit, category) VALUES (?,?,?,?,?,'pcs','box')",
          args: [`BOX-${flute}-${no}`, `Box Flute ${flute} ${subs}`, flute, subs, price],
        });
      });
    });
    await db.batch(stmts, 'write');
  }

  // Profil perusahaan: ganti nilai contoh lama, isi yang belum ada
  const cur = Object.fromEntries((await db.execute('SELECT key, value FROM settings')).rows.map((r) => [r[0], r[1]]));
  const stmts = [];
  const isOldDefault = !cur.company_name || cur.company_name === 'PT Percetakan Karton Nusantara';
  for (const [k, val] of Object.entries(COMPANY)) {
    if (cur[k] === undefined || (isOldDefault && k.startsWith('company_')) || (isOldDefault && k === 'tax_rate')) {
      stmts.push({ sql: 'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', args: [k, val] });
    }
  }
  stmts.push({ sql: "INSERT INTO settings (key, value) VALUES ('schema_version','2') ON CONFLICT(key) DO UPDATE SET value='2'", args: [] });
  await db.batch(stmts, 'write');
  console.log('[migrate] skema v2 diterapkan');
}

module.exports = { db, migrate };
