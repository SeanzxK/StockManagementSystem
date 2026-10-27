import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------- API ----------
export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'include', headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch('/api' + path, opts);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('isms:unauthorized'));
  if (!r.ok) throw new Error(data.error || 'Terjadi kesalahan');
  return data;
}

export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true);
    try { setData(await api(path)); setError(''); } catch (e) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}

// ---------- Auth ----------
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
    const h = () => setUser(null);
    window.addEventListener('isms:unauthorized', h);
    return () => window.removeEventListener('isms:unauthorized', h);
  }, []);
  const login = async (username, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { username, password } });
    setUser(d.user);
  };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); };
  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

// ---------- Toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const id = useRef(0);
  const push = useCallback((msg, type = 'ok') => {
    const k = ++id.current;
    setList((l) => [...l, { k, msg, type }]);
    setTimeout(() => setList((l) => l.filter((t) => t.k !== k)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{list.map((t) => <div key={t.k} className={`toast ${t.type}`}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}

// ---------- Format ----------
export const ROLE_LABEL = { admin: 'Admin', warehouse: 'Gudang (Warehouse)', production: 'Produksi', delivery: 'Delivery' };
export const fmtNum = (n) => new Intl.NumberFormat('id-ID').format(Number(n) || 0);
export const fmtRp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export function fmtDate(s, short = false) {
  if (!s) return '-';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return s;
  const m = BULAN[d.getMonth()];
  return `${d.getDate()} ${short ? m.slice(0, 3) : m} ${d.getFullYear()}`;
}
export function fmtDateTime(s) {
  if (!s) return '-';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return `${fmtDate(s, true)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function timeAgo(s) {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return 'baru saja';
  if (sec < 3600) return `${Math.floor(sec / 60)} menit lalu`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} jam lalu`;
  return fmtDate(s, true);
}
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const f = (x) => {
    if (x < 12) return s[x];
    if (x < 20) return f(x - 10) + ' belas';
    if (x < 100) return f(Math.floor(x / 10)) + ' puluh ' + f(x % 10);
    if (x < 200) return 'seratus ' + f(x - 100);
    if (x < 1000) return f(Math.floor(x / 100)) + ' ratus ' + f(x % 100);
    if (x < 2000) return 'seribu ' + f(x - 1000);
    if (x < 1e6) return f(Math.floor(x / 1000)) + ' ribu ' + f(x % 1000);
    if (x < 1e9) return f(Math.floor(x / 1e6)) + ' juta ' + f(x % 1e6);
    if (x < 1e12) return f(Math.floor(x / 1e9)) + ' miliar ' + f(x % 1e9);
    return f(Math.floor(x / 1e12)) + ' triliun ' + f(x % 1e12);
  };
  const out = (n === 0 ? 'nol' : f(n)).replace(/\s+/g, ' ').trim();
  return out.charAt(0).toUpperCase() + out.slice(1) + ' rupiah';
}

export const PO_STATUS = {
  baru: ['Baru', 'b-gray'],
  produksi: ['Produksi', 'b-amber'],
  siap_kirim: ['Siap Kirim', 'b-blue'],
  pengiriman: ['Pengiriman', 'b-orange'],
  terkirim: ['Terkirim', 'b-green'],
  selesai: ['Selesai', 'b-dark'],
  batal: ['Batal', 'b-red'],
};
export const DO_STATUS = {
  dibuat: ['Dibuat', 'b-gray'],
  dikirim: ['Dalam Pengiriman', 'b-orange'],
  ditandatangani: ['Diterima Customer', 'b-green'],
};
export const INV_STATUS = { belum_lunas: ['Belum Lunas', 'b-amber'], lunas: ['Lunas', 'b-green'] };
export const LOC_LABEL = { warehouse: 'Gudang', production: 'Produksi', delivery: 'Delivery', delivered: 'Terkirim' };
export const REF_LABEL = { SUPPLIER_IN: 'Barang Masuk', MANUAL_OUT: 'Barang Keluar', BAST: 'BAST', DO: 'Delivery Order' };
