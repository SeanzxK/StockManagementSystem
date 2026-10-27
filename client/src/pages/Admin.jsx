import { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { api, useApi, useAuth, useToast, fmtNum, fmtRp, ROLE_LABEL } from '../lib';
import { Field, Loading, Modal, PageHead } from '../components/ui';

export function Products() {
  const { data, loading, reload } = useApi('/products');
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const rows = (data || []).filter((p) => !q || `${p.code} ${p.name} ${p.substance}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHead title="Master Barang" sub="Jenis karton berdasarkan flute (B, C, CB) dan substance, beserta harga per m².">
        <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={18} /> Tambah Barang</button>
      </PageHead>
      <div className="card">
        <div className="toolbar"><input className="input search-input" placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {loading ? <Loading /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Kode</th><th>Nama</th><th>Flute</th><th>Substance</th><th className="num">Harga/m²</th><th className="num">Stok Min.</th><th className="num">Stok</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="strong">{p.code}</td><td>{p.name}</td><td><span className="badge b-green">{p.flute}</span></td><td className="mono">{p.substance}</td>
                    <td className="num">{fmtRp(p.price_m2)}</td><td className="num">{fmtNum(p.min_stock)}</td><td className="num strong">{fmtNum(p.stock)}</td>
                    <td>{p.active ? <span className="badge b-green">Aktif</span> : <span className="badge b-gray">Nonaktif</span>}</td>
                    <td><button className="btn btn-ghost btn-xs" style={{ background: '#f2f4f3' }} onClick={() => setEdit(p)}><Pencil size={13} /> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <ProductModal p={edit} onClose={(ok) => { setEdit(null); if (ok) reload(); }} />}
    </div>
  );
}

function ProductModal({ p, onClose }) {
  const toast = useToast();
  const isNew = !p.id;
  const [f, setF] = useState({ code: p.code || '', name: p.name || '', flute: p.flute || 'B', substance: p.substance || '', price_m2: p.price_m2 ?? '', unit: p.unit || 'lembar', min_stock: p.min_stock ?? 0, active: p.active ?? 1 });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      if (isNew) await api('/products', { method: 'POST', body: f });
      else await api(`/products/${p.id}`, { method: 'PUT', body: f });
      toast('Barang disimpan'); onClose(true);
    } catch (e2) { setErr(e2.message); }
  };
  return (
    <Modal title={isNew ? 'Tambah Barang' : `Edit ${p.code}`} onClose={() => onClose(false)}>
      <form onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <div className="form-grid">
          <Field label="Kode *"><input className="input" value={f.code} disabled={!isNew} onChange={(e) => setF({ ...f, code: e.target.value })} required placeholder="B-29" /></Field>
          <Field label="Flute *"><select className="input" value={f.flute} onChange={(e) => setF({ ...f, flute: e.target.value })}><option>B</option><option>C</option><option>CB</option><option>E</option><option>BC</option></select></Field>
          <Field label="Nama *" full><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Substance *" hint="Format: liner atas/medium/liner bawah"><input className="input" value={f.substance} onChange={(e) => setF({ ...f, substance: e.target.value })} required placeholder="K150/M125/K125" /></Field>
          <Field label="Harga per m² (Rp)"><input className="input" type="number" value={f.price_m2} onChange={(e) => setF({ ...f, price_m2: e.target.value })} /></Field>
          <Field label="Satuan"><input className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
          <Field label="Stok minimum" hint="Peringatan stok menipis"><input className="input" type="number" value={f.min_stock} onChange={(e) => setF({ ...f, min_stock: e.target.value })} /></Field>
          {!isNew && <Field label="Status"><select className="input" value={f.active ? 1 : 0} onChange={(e) => setF({ ...f, active: Number(e.target.value) })}><option value={1}>Aktif</option><option value={0}>Nonaktif</option></select></Field>}
        </div>
        <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Batal</button><button className="btn btn-primary">Simpan</button></div>
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const { user } = useAuth();
  const { data, loading, reload } = useApi('/users');
  const [edit, setEdit] = useState(null);
  return (
    <div>
      <PageHead title="Pengguna" sub="Akun untuk setiap bagian: Admin, Gudang, Produksi, Delivery.">
        <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={18} /> Tambah Pengguna</button>
      </PageHead>
      <div className="card">
        {loading ? <Loading /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td className="strong">{u.name} {u.id === user.id && <span className="badge b-gray">Anda</span>}</td>
                    <td className="mono">@{u.username}</td>
                    <td><span className="badge b-green">{ROLE_LABEL[u.role]}</span></td>
                    <td>{u.active ? <span className="badge b-green">Aktif</span> : <span className="badge b-red">Nonaktif</span>}</td>
                    <td><button className="btn btn-ghost btn-xs" style={{ background: '#f2f4f3' }} onClick={() => setEdit(u)}><Pencil size={13} /> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <UserModal u={edit} onClose={(ok) => { setEdit(null); if (ok) reload(); }} />}
    </div>
  );
}

function UserModal({ u, onClose }) {
  const toast = useToast();
  const isNew = !u.id;
  const [f, setF] = useState({ username: u.username || '', name: u.name || '', role: u.role || 'warehouse', active: u.active ?? 1, password: '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      if (isNew) await api('/users', { method: 'POST', body: f });
      else await api(`/users/${u.id}`, { method: 'PUT', body: { ...f, active: Boolean(Number(f.active)), password: f.password || undefined } });
      toast('Pengguna disimpan'); onClose(true);
    } catch (e2) { setErr(e2.message); }
  };
  return (
    <Modal title={isNew ? 'Tambah Pengguna' : `Edit ${u.name}`} onClose={() => onClose(false)}>
      <form onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <div className="form-grid">
          <Field label="Nama lengkap *" full><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Username *"><input className="input" value={f.username} disabled={!isNew} onChange={(e) => setF({ ...f, username: e.target.value })} required /></Field>
          <Field label="Role *"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label={isNew ? 'Password *' : 'Reset password'} hint={isNew ? 'Minimal 6 karakter' : 'Kosongkan jika tidak diubah'}><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required={isNew} /></Field>
          {!isNew && <Field label="Status"><select className="input" value={f.active ? 1 : 0} onChange={(e) => setF({ ...f, active: Number(e.target.value) })}><option value={1}>Aktif</option><option value={0}>Nonaktif</option></select></Field>}
        </div>
        <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Batal</button><button className="btn btn-primary">Simpan</button></div>
      </form>
    </Modal>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const { data } = useApi('/settings');
  const [f, setF] = useState(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <Loading />;
  const save = async (e) => {
    e.preventDefault();
    try { await api('/settings', { method: 'PUT', body: f }); toast('Pengaturan disimpan'); } catch (e2) { toast(e2.message, 'error'); }
  };
  const inp = (k) => ({ className: 'input', value: f[k] || '', onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  return (
    <form onSubmit={save}>
      <PageHead title="Pengaturan" sub="Data perusahaan yang tampil di kop surat BAST, DO, dan Invoice." />
      <div className="card" style={{ maxWidth: 820 }}>
        <div className="form-grid">
          <Field label="Nama perusahaan" full><input {...inp('company_name')} /></Field>
          <Field label="Alamat" full><textarea {...inp('company_address')} rows={2} /></Field>
          <Field label="Telepon"><input {...inp('company_phone')} /></Field>
          <Field label="Email"><input {...inp('company_email')} /></Field>
          <Field label="Info rekening bank (untuk invoice)" full><textarea {...inp('bank_info')} rows={2} /></Field>
          <Field label="PPN default (%)"><input {...inp('tax_rate')} type="number" step="0.01" /></Field>
          <Field label="Jatuh tempo invoice (hari)"><input {...inp('invoice_due_days')} type="number" /></Field>
        </div>
        <div className="form-actions"><button className="btn btn-primary">Simpan Pengaturan</button></div>
      </div>
    </form>
  );
}
