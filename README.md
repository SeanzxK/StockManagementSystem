# Inventory Stock Management System (StockKarton)

Aplikasi web fullstack untuk memantau stok di pabrik percetakan karton, dari **gudang → produksi → delivery → customer**, lengkap dengan dokumen PO, BAST, Delivery Order dan Invoice yang bisa dicetak, disimpan sebagai PDF dan dibagikan.

- **Frontend:** React + Vite (desain mengikuti referensi dashboard, responsif untuk HP)
- **Backend:** Node.js + Express, login JWT (cookie httpOnly), password di-hash bcrypt
- **Database:** SQLite/libSQL. Saat development memakai file lokal, saat production memakai **Turso (gratis)**. File scan (PO & DO bertanda tangan) disimpan langsung di database, jadi tidak perlu storage berbayar.

---

## 1. Akun default

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Gudang (Warehouse) | `gudang` | `gudang123` |
| Produksi | `produksi` | `produksi123` |
| Delivery | `delivery` | `delivery123` |

> **Segera ganti semua password** setelah login pertama (menu *Ganti Password*). Admin bisa menambah atau menonaktifkan akun di menu *Pengguna*.

---

## 2. Alur kerja & aturan stok

```
Admin: PO customer (+ upload scan) ──► notifikasi ke Gudang, Produksi, Delivery
Gudang: Barang Masuk dari supplier (+stok gudang)
Produksi: BAST Gudang → Produksi   ── stok gudang −, barang jadi di produksi + (atas nama PO/customer)
Delivery: BAST Produksi → Delivery ── stok produksi −, stok delivery +
Delivery: Delivery Order dari BAST ── cetak, bawa ke customer
Delivery: Upload DO bertanda tangan ── stok delivery −, "Terkirim" +, notifikasi ke Admin
Admin: Invoice dari DO bertanda tangan ── cetak / PDF / bagikan, tandai lunas
```

- Setiap perpindahan barang antar bagian **wajib lewat BAST**, dan stok langsung bertambah/berkurang otomatis.
- Barang di produksi & delivery selalu terikat ke **PO dan customer pemiliknya**.
- Sistem menolak BAST bila stok gudang tidak cukup atau jumlah melebihi sisa pesanan PO.
- Semua pergerakan tercatat di **Riwayat Stok** (bisa difilter & diunduh CSV).

### Hak akses per role

| Fitur | Admin | Gudang | Produksi | Delivery |
|---|:-:|:-:|:-:|:-:|
| Dashboard monitoring stok | ✓ (semua lokasi) | ✓ | ✓ | ✓ |
| Buat / edit / batalkan PO + upload scan | ✓ | – | – | – |
| Lihat PO & unduh scan PO | ✓ | ✓ | ✓ | ✓ |
| Barang masuk / keluar gudang | ✓ | ✓ | – | – |
| BAST Gudang → Produksi | ✓ | lihat | ✓ | – |
| BAST Produksi → Delivery | ✓ | – | ✓ | ✓ |
| Delivery Order + upload DO bertanda tangan | ✓ | – | lihat | ✓ |
| Invoice | ✓ | – | – | – |
| Master barang | ✓ | ✓ | – | – |
| Pengguna & pengaturan perusahaan | ✓ | – | – | – |

### Dokumen: cetak, simpan, bagikan
Setiap dokumen (Ringkasan PO, BAST, DO, Invoice) punya tombol:
- **Cetak**: format A4 siap print.
- **Simpan PDF**: file PDF langsung tersimpan di perangkat (HP / laptop).
- **Bagikan**: di HP membuka menu berbagi (WhatsApp, email, Drive, dll.) dengan file PDF terlampir. Di laptop tersedia pilihan WhatsApp, email, atau salin tautan.

Scan PO dan scan DO bertanda tangan bisa dibuka, disimpan ke perangkat, dan dibagikan.

### Data barang
Sudah terisi **84 jenis karton** dari tabel harga: 28 kombinasi substance × flute **B, C, CB**, dengan harga per m². Kodenya `B-01` s/d `CB-28`. Harga per pcs di PO dan invoice dihitung otomatis = luas lembar (P×L mm) × harga/m², dan tetap bisa diubah manual. Atur **stok minimum** di Master Barang untuk peringatan stok menipis.

---

## 3. Menjalankan di komputer (development)

Butuh **Node.js 18+**.

```bash
npm run build          # install dependency server & client lalu build frontend
npm start              # buka http://localhost:3000
```

Mode development (auto-reload):
```bash
npm run dev:server     # API di :3000
npm run dev:client     # UI di :5173 (proxy ke API)
```
Database lokal otomatis dibuat di `server/data/inventory.db`.

---

## 4. Deploy gratis (Render + Turso)

### a. Buat database di Turso (gratis)
1. Daftar di https://turso.tech lalu buat database baru, misalnya `inventory-karton`.
2. Catat **Database URL** (`libsql://inventory-karton-xxx.turso.io`).
3. Buat **token**: menu *Create Token*, atau via CLI `turso db tokens create inventory-karton`.

### b. Upload kode ke GitHub
Buat repository baru, lalu push seluruh folder ini.

### c. Deploy di Render (gratis)
1. Daftar di https://render.com, pilih **New → Blueprint**, lalu pilih repository tadi. File `render.yaml` sudah disiapkan.
2. Isi environment variable:
   - `DATABASE_URL` = URL Turso
   - `DATABASE_AUTH_TOKEN` = token Turso
   - `JWT_SECRET` dibuat otomatis
3. Tunggu sampai build selesai, lalu buka URL `https://xxx.onrender.com`.

Tabel, akun default dan data barang dibuat otomatis saat aplikasi pertama kali jalan.

> **Catatan paket gratis Render:** server "tidur" setelah 15 menit tanpa akses, jadi akses pertama setelahnya butuh ±30–60 detik. Data tetap aman karena tersimpan di Turso. Supaya selalu aktif, bisa dipasang ping gratis (mis. UptimeRobot ke `/api/health` tiap 10 menit).
>
> Alternatif hosting gratis lain yang bisa menjalankan Node.js: Koyeb, Railway (kredit), atau server lokal pabrik (`npm start` di PC kantor, diakses lewat Wi-Fi).

---

## 5. Struktur proyek

```
server/
  src/index.js      # Express app + serve frontend
  src/db.js         # skema database, seed akun, 84 barang, pengaturan
  src/auth.js       # JWT & role guard
  src/routes.js     # semua API (stok, PO, BAST, DO, invoice, file, notifikasi, dashboard)
client/
  src/pages/        # Dashboard, PO, Stok, BAST, DO, Invoice, Admin
  src/docs/Doc.jsx  # kop surat, cetak, PDF, bagikan
  src/styles.css    # design system
```

### Ringkasan API
`POST /api/auth/login` · `GET /api/dashboard` · `GET /api/stock/{warehouse|production|delivery|ledger}` · `POST /api/stock/warehouse/{in|out}` · `GET|POST|PUT /api/po` · `GET|POST /api/bast` · `GET|POST /api/do`, `POST /api/do/:id/{ship|signed|receive}` · `GET|POST /api/invoices` · `GET /api/files/:id` · `GET /api/notifications` · `GET /api/search`
