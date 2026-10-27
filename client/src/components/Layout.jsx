import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Warehouse, Factory, Truck, ClipboardCheck, ReceiptText, History, Package,
  Users, Settings, LogOut, Search, Bell, Menu, KeyRound, Boxes,
} from 'lucide-react';
import { api, useAuth, useToast, ROLE_LABEL, timeAgo } from '../lib';
import { Modal, Field } from './ui';

const MENUS = {
  admin: [
    ['/', 'Dashboard', LayoutDashboard],
    ['/po', 'Purchase Order', FileText],
    ['/stok/gudang', 'Stok Gudang', Warehouse],
    ['/stok/produksi', 'Stok Produksi', Factory],
    ['/stok/delivery', 'Stok Delivery', Truck],
    ['/bast', 'BAST', ClipboardCheck],
    ['/do', 'Delivery Order', Truck],
    ['/invoice', 'Invoice', ReceiptText, 'invoiceable'],
    ['/riwayat', 'Riwayat Stok', History],
  ],
  warehouse: [
    ['/', 'Dashboard', LayoutDashboard],
    ['/stok/gudang', 'Stok Gudang', Warehouse],
    ['/riwayat', 'Riwayat Stok', History],
    ['/po', 'Purchase Order', FileText, 'newpo'],
    ['/bast', 'BAST', ClipboardCheck],
  ],
  production: [
    ['/', 'Dashboard', LayoutDashboard],
    ['/po', 'Purchase Order', FileText, 'newpo'],
    ['/bast', 'BAST', ClipboardCheck],
    ['/stok/produksi', 'Stok Produksi', Factory],
    ['/stok/gudang', 'Stok Gudang', Warehouse],
  ],
  delivery: [
    ['/', 'Dashboard', LayoutDashboard],
    ['/po', 'Purchase Order', FileText],
    ['/bast', 'BAST', ClipboardCheck],
    ['/stok/delivery', 'Stok Delivery', Boxes],
    ['/do', 'Delivery Order', Truck],
  ],
};
const GENERAL = {
  admin: [['/barang', 'Master Barang', Package], ['/pengguna', 'Pengguna', Users], ['/pengaturan', 'Pengaturan', Settings]],
  warehouse: [['/barang', 'Master Barang', Package]],
  production: [],
  delivery: [],
};
const FLOW = [
  ['PO dari Customer', 'admin'],
  ['BAST Gudang → Produksi', 'production'],
  ['BAST Produksi → Delivery', 'delivery'],
  ['Delivery Order & TTD', 'delivery'],
  ['Invoice', 'admin'],
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (user.role === 'admin') api('/do?invoiceable=1').then((d) => setCounts({ invoiceable: d.length })).catch(() => {});
    if (user.role === 'warehouse' || user.role === 'production') api('/po?status=baru').then((d) => setCounts({ newpo: d.length })).catch(() => {});
  }, [loc.pathname, user.role]);

  const doLogout = async () => { await logout(); nav('/login'); };

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo"><Boxes size={20} strokeWidth={2.4} /></div>
          <div><div className="brand-name">StockKarton</div><div className="brand-sub">Inventory Stock Management System</div></div>
        </div>
        <div className="nav-label">Menu</div>
        <nav className="nav">
          {MENUS[user.role].map(([to, label, Icon, countKey]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={20} /> {label}
              {countKey && counts[countKey] > 0 && <span className="count">{counts[countKey]}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="nav-label" style={{ marginTop: 14 }}>General</div>
        <nav className="nav">
          {GENERAL[user.role].map(([to, label, Icon]) => <NavLink key={to} to={to}><Icon size={20} /> {label}</NavLink>)}
          <button className="navbtn" onClick={() => setPwOpen(true)}><KeyRound size={20} /> Ganti Password</button>
          <button className="navbtn" onClick={doLogout}><LogOut size={20} /> Logout</button>
        </nav>
        <div className="side-card" style={{ marginTop: 24 }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h4>Alur Dokumen</h4>
            <p>Bagian yang ditebalkan adalah tugas {ROLE_LABEL[user.role]}.</p>
            <div className="flow-steps">
              {FLOW.map(([t, r], i) => (
                <span key={t} className={r === user.role || user.role === 'admin' && r === 'admin' ? 'me' : ''}><i>{i + 1}</i>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setOpen(true)} aria-label="Menu"><Menu size={20} /></button>
          <GlobalSearch />
          <div className="spacer" />
          <Notifications />
          <div className="user-chip">
            <div className="avatar">{user.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div className="txt"><div className="n">{user.name}</div><div className="r">{ROLE_LABEL[user.role]} · @{user.username}</div></div>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [show, setShow] = useState(false);
  const nav = useNavigate();
  const ref = useRef();
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(() => api('/search?q=' + encodeURIComponent(q)).then(setRes).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setShow(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="search" ref={ref}>
      <Search size={19} />
      <input placeholder="Cari PO, customer, BAST, DO, barang…" value={q} onChange={(e) => { setQ(e.target.value); setShow(true); }} onFocus={() => setShow(true)} />
      {show && q.trim().length >= 2 && (
        <div className="search-results">
          {res.length === 0 && <div className="muted small" style={{ padding: 12 }}>Tidak ada hasil untuk "{q}"</div>}
          {res.map((r, i) => (
            <a key={i} href={r.link} onClick={(e) => { e.preventDefault(); setShow(false); setQ(''); nav(r.link); }}>
              <span className="badge b-green" style={{ minWidth: 56, justifyContent: 'center' }}>{r.type}</span>
              <span><b>{r.label}</b> <span className="muted small">{r.sub}</span></span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef();
  const load = () => api('/notifications').then(setList).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => { clearInterval(t); document.removeEventListener('mousedown', h); };
  }, []);
  const unread = list.filter((n) => !n.is_read).length;
  const readAll = async () => { await api('/notifications/read', { method: 'POST', body: {} }); load(); };
  const openOne = async (n) => {
    setOpen(false);
    if (!n.is_read) api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }).then(load);
    if (n.link) nav(n.link);
  };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => { setOpen(!open); if (!open) load(); }} aria-label="Notifikasi">
        <Bell size={20} />
        {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dh">Notifikasi {unread > 0 && <button className="btn btn-xs btn-ghost" style={{ background: '#f2f4f3' }} onClick={readAll}>Tandai semua dibaca</button>}</div>
          <div className="dl">
            {list.length === 0 && <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Belum ada notifikasi</div>}
            {list.map((n) => (
              <div key={n.id} className={`notif ${n.is_read ? '' : 'unread'}`} onClick={() => openOne(n)}>
                <div className="nt">{n.title}</div>
                {n.message && <div className="nm">{n.message}</div>}
                <div className="nd">{timeAgo(n.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordModal({ onClose }) {
  const [f, setF] = useState({ old_password: '', new_password: '', confirm: '' });
  const [err, setErr] = useState('');
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault();
    if (f.new_password !== f.confirm) return setErr('Konfirmasi password tidak sama');
    try {
      await api('/auth/password', { method: 'POST', body: f });
      toast('Password berhasil diganti');
      onClose();
    } catch (e2) { setErr(e2.message); }
  };
  return (
    <Modal title="Ganti Password" onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <Field label="Password lama"><input className="input" type="password" value={f.old_password} onChange={(e) => setF({ ...f, old_password: e.target.value })} required /></Field>
          <Field label="Password baru" hint="Minimal 6 karakter"><input className="input" type="password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} required /></Field>
          <Field label="Ulangi password baru"><input className="input" type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></Field>
        </div>
        <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button><button className="btn btn-primary">Simpan</button></div>
      </form>
    </Modal>
  );
}
