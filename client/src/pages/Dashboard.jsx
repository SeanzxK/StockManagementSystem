import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Truck, ReceiptText, Factory, Warehouse, PackageCheck, AlertTriangle } from 'lucide-react';
import { useApi, useAuth, fmtNum, fmtRp, fmtDate, timeAgo, PO_STATUS, LOC_LABEL } from '../lib';
import { Badge, Loading, PageHead, StatCard, Empty } from '../components/ui';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function PillChart({ data, metric }) {
  const max = Math.max(1, ...data.map((d) => d[metric]));
  const top = data.reduce((a, d, i) => (d[metric] > data[a][metric] ? i : a), 0);
  const [hover, setHover] = useState(null);
  return (
    <div className="pill-chart">
      {data.map((d, i) => {
        const v = d[metric];
        const h = v === 0 ? 45 : 30 + (v / max) * 70;
        const cls = v === 0 ? 'hatch' : i === top ? 'c3' : i % 2 ? 'c2' : 'c1';
        return (
          <div className="pill-col" key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className={`pill ${cls}`} style={{ height: `${h}%` }}>
              {(hover === i || (hover === null && i === top && v > 0)) && <span className="pill-tip">{fmtNum(v)}</span>}
            </div>
            <span className="lbl">{DAYS[new Date(d.date + 'T00:00:00').getDay()]}</span>
          </div>
        );
      })}
    </div>
  );
}

function Gauge({ done, progress, waiting }) {
  const total = done + progress + waiting;
  const L = Math.PI * 100;
  const a = total ? (done / total) * L : 0;
  const b = total ? (progress / total) * L : 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 240 140" style={{ width: '100%', maxWidth: 300 }}>
        <defs>
          <pattern id="hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="3" height="8" fill="#8fa398" />
          </pattern>
        </defs>
        <path d="M 20 125 A 100 100 0 0 1 220 125" fill="none" stroke="url(#hatch)" strokeWidth="34" />
        {b > 0 && <path d="M 20 125 A 100 100 0 0 1 220 125" fill="none" stroke="#0f3d26" strokeWidth="34" strokeDasharray={`${a + b} ${L}`} strokeLinecap={a + b >= L - 1 ? 'butt' : 'round'} />}
        {a > 0 && <path d="M 20 125 A 100 100 0 0 1 220 125" fill="none" stroke="#237a4b" strokeWidth="34" strokeDasharray={`${a} ${L}`} />}
        <text x="120" y="112" textAnchor="middle" fontSize="40" fontWeight="800" fill="#111814" fontFamily="inherit">{pct}%</text>
        <text x="120" y="134" textAnchor="middle" fontSize="12" fill="#1b5e3b" fontFamily="inherit">PO terkirim</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', fontSize: 13, marginTop: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 14, height: 14, borderRadius: 7, background: '#237a4b' }} />Terkirim ({done})</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 14, height: 14, borderRadius: 7, background: '#0f3d26' }} />Proses ({progress})</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 14, height: 14, borderRadius: 7, background: 'var(--hatch)' }} />Baru ({waiting})</span>
      </div>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="card dark-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <h3 style={{ fontSize: 19, fontWeight: 600, position: 'relative', zIndex: 1 }}>Shift Hari Ini</h3>
      <div className="big mono">{now.toLocaleTimeString('id-ID', { hour12: false })}</div>
      <div className="sub">{now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  );
}

const ICON = { warehouse: Warehouse, production: Factory, delivery: Truck, delivered: PackageCheck };

export default function Dashboard() {
  const { user } = useAuth();
  const { data: d, loading } = useApi('/dashboard');
  const [metric, setMetric] = useState(user.role === 'warehouse' ? 'masuk' : user.role === 'delivery' ? 'terkirim' : 'produksi');
  const nav = useNavigate();
  if (loading || !d) return <Loading />;
  const ps = d.poStatus;
  const n = (k) => ps[k] || 0;
  const role = user.role;

  const headActions = {
    admin: [<Link key="a" to="/po/baru" className="btn btn-primary"><Plus size={18} /> Buat PO</Link>, <Link key="b" to="/invoice" className="btn btn-outline">Invoice</Link>],
    warehouse: [<Link key="a" to="/stok/gudang?aksi=in" className="btn btn-primary"><ArrowDownToLine size={18} /> Barang Masuk</Link>, <Link key="b" to="/stok/gudang?aksi=out" className="btn btn-outline"><ArrowUpFromLine size={18} /> Barang Keluar</Link>],
    production: [<Link key="a" to="/bast/baru?type=WH_PROD" className="btn btn-primary"><Plus size={18} /> BAST dari Gudang</Link>, <Link key="b" to="/po" className="btn btn-outline">Lihat PO</Link>],
    delivery: [<Link key="a" to="/bast/baru?type=PROD_DEL" className="btn btn-primary"><Plus size={18} /> BAST dari Produksi</Link>, <Link key="c" to="/bast/baru?type=WH_DEL" className="btn btn-outline"><Plus size={18} /> Box dari Gudang</Link>, <Link key="b" to="/do/baru" className="btn btn-outline">Buat DO</Link>],
  }[role];

  const stats = {
    admin: [
      ['Stok Gudang', d.totals.warehouse, 'lembar', 'bahan karton siap pakai', '/stok/gudang'],
      ['Stok Produksi', d.totals.production, 'pcs', 'barang jadi per PO', '/stok/produksi'],
      ['Stok Delivery', d.totals.delivery, 'pcs', 'siap / sedang dikirim', '/stok/delivery'],
      ['Terkirim', d.totals.delivered_month, 'pcs', 'bulan ini ke customer', '/riwayat'],
    ],
    warehouse: [
      ['Stok Gudang', d.totals.warehouse, 'lembar', `${d.productCount} jenis barang`, '/stok/gudang'],
      ['Barang Masuk', d.inMonth, 'lembar', 'bulan ini dari supplier', '/riwayat'],
      ['Barang Keluar', d.outMonth, 'lembar', 'bulan ini (BAST & manual)', '/riwayat'],
      ['Stok Menipis', d.lowStock.length, 'jenis', 'di bawah stok minimum', '/stok/gudang'],
    ],
    production: [
      ['Barang Jadi', d.totals.production, 'pcs', 'di area produksi', '/stok/produksi'],
      ['PO Menunggu', n('baru'), 'PO', 'belum diproduksi', '/po'],
      ['Sedang Produksi', n('produksi'), 'PO', 'sebagian sudah di-BAST', '/po'],
      ['BAST Bulan Ini', d.bastMonth, '', 'semua serah terima', '/bast'],
    ],
    delivery: [
      ['Stok Delivery', d.totals.delivery, 'pcs', 'di tangan delivery', '/stok/delivery'],
      ['Siap Kirim', n('siap_kirim') + n('produksi'), 'PO', 'barang jadi di produksi', '/stok/produksi'],
      ['DO Aktif', d.doOpen, 'DO', 'belum diterima customer', '/do'],
      ['Terkirim', d.totals.delivered_month, 'pcs', 'bulan ini', '/do'],
    ],
  }[role];

  // Perlu tindakan
  let action;
  if (role === 'admin') {
    action = d.signedDo.length
      ? { title: `${d.signedDo.length} DO bertanda tangan menunggu invoice`, sub: `Terbaru: ${d.signedDo[0].number} — ${d.signedDo[0].customer_name}`, cta: 'Buat Invoice', to: `/invoice/baru?do=${d.signedDo[0].id}`, icon: ReceiptText }
      : { title: 'Semua DO sudah ditagihkan', sub: 'Buat PO baru saat ada pesanan masuk dari customer.', cta: 'Buat PO', to: '/po/baru', icon: FileText };
  } else if (role === 'warehouse') {
    action = d.lowStock.length
      ? { title: `${d.lowStock.length} jenis stok menipis`, sub: `${d.lowStock[0].code}: sisa ${fmtNum(d.lowStock[0].stock)} ${d.lowStock[0].unit}`, cta: 'Catat Barang Masuk', to: '/stok/gudang?aksi=in', icon: AlertTriangle }
      : { title: n('baru') ? `${n('baru')} PO baru perlu disiapkan` : 'Stok gudang aman', sub: 'Catat setiap pembelian dari supplier agar stok selalu akurat.', cta: 'Catat Barang Masuk', to: '/stok/gudang?aksi=in', icon: ArrowDownToLine };
  } else if (role === 'production') {
    action = { title: n('baru') ? `${n('baru')} PO baru menunggu produksi` : 'Tidak ada PO baru', sub: 'Ambil bahan dari gudang dengan membuat BAST Gudang → Produksi.', cta: 'Buat BAST', to: '/bast/baru?type=WH_PROD', icon: ClipboardCheck };
  } else {
    action = d.totals.production > 0
      ? { title: `${fmtNum(d.totals.production)} pcs barang jadi siap diambil`, sub: 'Buat BAST serah terima dengan produksi, lalu terbitkan DO.', cta: 'BAST dari Produksi', to: '/bast/baru?type=PROD_DEL', icon: ClipboardCheck }
      : { title: d.doOpen ? `${d.doOpen} DO dalam proses` : 'Belum ada barang siap kirim', sub: 'Upload DO yang sudah ditandatangani customer setelah barang diterima.', cta: 'Lihat DO', to: '/do', icon: Truck };
  }
  const ActIcon = action.icon;

  const done = n('terkirim') + n('selesai');
  const prog = n('produksi') + n('siap_kirim') + n('pengiriman');

  return (
    <div>
      <PageHead title="Dashboard" sub={`Selamat datang, ${user.name}. Pantau stok dan dokumen dengan mudah.`}>{headActions}</PageHead>

      <div className="grid stats">
        {stats.map(([t, v, u, f, to], i) => <StatCard key={t} feature={i === 0} title={t} value={fmtNum(v)} unit={u} foot={f} to={to} />)}
      </div>

      <div className="grid dash-row2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <h3>Pergerakan 7 Hari</h3>
            <div className="seg">
              {[['masuk', 'Masuk'], ['produksi', 'Produksi'], ['terkirim', 'Terkirim']].map(([k, l]) => <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}>{l}</button>)}
            </div>
          </div>
          <PillChart data={d.movement} metric={metric} />
        </div>

        <div className="card reminder" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head"><h3>Perlu Tindakan</h3></div>
          <h2>{action.title}</h2>
          <p>{action.sub}</p>
          <button className="btn btn-primary" style={{ marginTop: 'auto', padding: 15 }} onClick={() => nav(action.to)}><ActIcon size={19} /> {action.cta}</button>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>PO Terbaru</h3>
            {role === 'admin' ? <Link to="/po/baru" className="btn btn-outline btn-sm"><Plus size={15} /> Baru</Link> : <Link to="/po" className="btn btn-outline btn-sm">Semua</Link>}
          </div>
          {d.recentPo.length === 0 ? <Empty text="Belum ada PO" /> : (
            <div className="list">
              {d.recentPo.slice(0, 5).map((p, i) => (
                <Link to={`/po/${p.id}`} className="list-item" key={p.id}>
                  <div className="ic" style={{ background: ['#eaf6ef', '#e8f0fd', '#fff6e0', '#fdecec', '#f1ecfd'][i % 5], color: ['#1b5e3b', '#2563c9', '#c98a0b', '#c73636', '#6b46c1'][i % 5] }}><FileText size={18} /></div>
                  <div className="grow">
                    <div className="t">{p.customer_name}</div>
                    <div className="s">{p.po_number} · {fmtDate(p.po_date, true)}</div>
                  </div>
                  <Badge map={PO_STATUS} value={p.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid dash-row3" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head"><h3>Aktivitas Stok Terbaru</h3><Link to="/riwayat" className="btn btn-outline btn-sm">Riwayat</Link></div>
          {d.activity.length === 0 ? <Empty text="Belum ada pergerakan stok" /> : (
            <div className="list">
              {d.activity.slice(0, 6).map((a) => {
                const Ic = ICON[a.location];
                return (
                  <div className="list-item" key={a.id}>
                    <div className="avatar" style={{ width: 40, height: 40 }}><Ic size={18} /></div>
                    <div className="grow">
                      <div className="t">{a.product_code} <span className={a.qty > 0 ? 'pos' : 'neg'}>{a.qty > 0 ? '+' : ''}{fmtNum(a.qty)}</span> <span className="muted small">di {LOC_LABEL[a.location]}</span></div>
                      <div className="s">{a.note || a.party || '-'} · {a.user_name}</div>
                    </div>
                    <span className="badge b-gray">{timeAgo(a.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Progress PO</h3></div>
          <Gauge done={done} progress={prog} waiting={n('baru')} />
        </div>

        {role === 'admin' ? (
          <Link to="/invoice" className="card dark-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h3 style={{ fontSize: 19, fontWeight: 600, position: 'relative', zIndex: 1 }}>Invoice Belum Lunas</h3>
            <div className="big" style={{ fontSize: 30 }}>{fmtRp(d.invoice.unpaid_total)}</div>
            <div className="sub">{d.invoice.unpaid_count} invoice · tagihan bulan ini {fmtRp(d.invoice.month_total)}</div>
          </Link>
        ) : <Clock />}
      </div>
    </div>
  );
}
