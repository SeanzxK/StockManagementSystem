import { useState } from 'react';
import { Boxes, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await login(f.username.trim(), f.password); nav('/', { replace: true }); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="login-wrap">
      <section className="login-art">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-logo" style={{ borderColor: '#fff', color: '#fff' }}><Boxes size={20} /></div>
          <div><div className="brand-name">StockKarton</div><div className="brand-sub" style={{ color: 'rgba(255,255,255,.7)' }}>Inventory Stock Management System</div></div>
        </div>
        <h1>Pantau stok karton dari gudang sampai ke customer.</h1>
        <p>PO, BAST, Delivery Order dan Invoice dalam satu alur — setiap perpindahan barang tercatat otomatis.</p>
        <div className="login-roles">
          <div><b>Admin</b>Monitoring stok, PO & invoice</div>
          <div><b>Gudang</b>Barang masuk & keluar</div>
          <div><b>Produksi</b>BAST & barang jadi per PO</div>
          <div><b>Delivery</b>BAST, DO & bukti terima</div>
        </div>
      </section>
      <section className="login-form">
        <form className="login-box" onSubmit={submit}>
          <div className="brand-logo"><Boxes size={20} /></div>
          <h2>Masuk ke akun</h2>
          <p>Gunakan akun sesuai bagian Anda di pabrik.</p>
          {err && <div className="err">{err}</div>}
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Username</label>
            <input className="input" autoFocus autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
          </div>
          <div className="field" style={{ marginBottom: 22 }}>
            <label>Password</label>
            <input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: 14 }} disabled={busy}><LogIn size={18} /> {busy ? 'Memproses…' : 'Masuk'}</button>
        </form>
      </section>
    </div>
  );
}
