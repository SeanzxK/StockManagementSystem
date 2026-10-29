import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Layers, Package } from 'lucide-react';
import { api, useApi, useAuth, useToast, fmtNum, fmtRp, ROLE_LABEL } from '../lib';
import { Field, Loading, Modal, PageHead } from '../components/ui';

export function Products() {
  const { data, loading, reload } = useApi('/products');
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('sheet');
  const count = (c) => (data || []).filter((p) => p.category === c).length;
  const rows = (data || []).filter((p) => p.category === cat && (!q || `${p.code} ${p.name} ${p.substance}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <PageHead title="Master Barang" sub="Dua grup barang: SHEET (Gudang → Produksi → Delivery) dan BOX (Gudang → langsung Delivery).">
        <button className="btn btn-primary" onClick={() => setEdit({ category: cat })}><Plus size={18} /> Tambah {cat === 'box' ? 'Box' : 'Sheet'}</button>
      </PageHead>
      <div className="card">
        <div className="toolbar">
          <div className="cat-switch">
            <button className={cat === 'sheet' ? 'on' : ''} onClick={() => setCat('sheet')}><Layers size={16} /> Sheet <span className="n">{count('sheet')}</span></button>
            <button className={cat === 'box' ? 'on' : ''} onClick={() => setCat('box')}><Package size={16} /> Box <span className="n">{count('box')}</span></button>
          </div>
          <input className="input search-input" placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
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
  const [f, setF] = useState({ code: p.code || '', name: p.name || '', flute: p.flute || 'B', substance: p.substance || '', price_m2: p.price_m2 ?? '', unit: p.unit || (p.category === 'box' ? 'pcs' : 'lembar'), min_stock: p.min_stock ?? 0, active: p.active ?? 1, category: p.category || 'sheet' });
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
          <Field label="Grup *" full><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="sheet">Sheet (lewat Produksi)</option><option value="box">Box (Gudang → langsung Delivery)</option></select></Field>
          <Field label="Kode *"><input className="input" value={f.code} disabled={!isNew} onChange={(e) => setF({ ...f, code: e.target.value })} required placeholder={f.category === 'box' ? 'BOX-B-29' : 'B-29'} /></Field>
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
  useEffect(() => { if (data) setF({ ...data, bank_accounts: Array.isArray(data.bank_accounts) ? data.bank_accounts : [] }); }, [data]);
  if (!f) return <Loading />;
  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { ...f, bank_accounts: f.bank_accounts.filter((b) => b.bank || b.account || b.holder) };
      await api('/settings', { method: 'PUT', body });
      toast('Pengaturan disimpan');
    } catch (e2) { toast(e2.message, 'error'); }
  };
  const inp = (k) => ({ className: 'input', value: f[k] || '', onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const setBank = (i, patch) => setF({ ...f, bank_accounts: f.bank_accounts.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <form onSubmit={save}>
      <PageHead title="Pengaturan" sub="Data perusahaan, rekening bank & penanda tangan yang tampil di BAST, Surat Jalan dan Invoice." />
      <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>Perusahaan</h3><img src="/logo-jps.png" alt="Logo" style={{ height: 34 }} /></div>
          <div className="form-grid">
            <Field label="Nama perusahaan" full><input {...inp('company_name')} /></Field>
            <Field label="Alamat (kop surat)" full><input {...inp('company_address')} /></Field>
            <Field label="Telepon"><input {...inp('company_phone')} /></Field>
            <Field label="Kota (tempat tanggal dokumen)"><input {...inp('company_city')} /></Field>
            <Field label="Email" full><input {...inp('company_email')} /></Field>
            <Field label="PPN default invoice (%)" hint="0 = tanpa PPN"><input {...inp('tax_rate')} type="number" step="0.01" /></Field>
            <Field label="Jatuh tempo invoice (hari)"><input {...inp('invoice_due_days')} type="number" /></Field>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Rekening Bank (Invoice)</h3><button type="button" className="btn btn-outline btn-sm" onClick={() => setF({ ...f, bank_accounts: [...f.bank_accounts, { bank: '', account: '', holder: '' }] })}><Plus size={15} /> Rekening</button></div>
          <p className="small muted" style={{ marginTop: -6 }}>Rekening pertama dipakai otomatis di invoice & Surat Jalan baru, dan bisa dipilih / diubah saat membuat dokumen.</p>
          {f.bank_accounts.length === 0 && <div className="info">Belum ada rekening. Tambahkan minimal satu.</div>}
          {f.bank_accounts.map((b, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <Field label={i === 0 ? 'Nama Bank' : ''}><input className="input" value={b.bank} onChange={(e) => setBank(i, { bank: e.target.value })} placeholder="Bank Mandiri" /></Field>
              <Field label={i === 0 ? 'No. Rekening' : ''}><input className="input" value={b.account} onChange={(e) => setBank(i, { account: e.target.value })} /></Field>
              <Field label={i === 0 ? 'Atas Nama' : ''}><input className="input" value={b.holder} onChange={(e) => setBank(i, { holder: e.target.value })} /></Field>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setF({ ...f, bank_accounts: f.bank_accounts.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="card-head" style={{ marginTop: 18 }}><h3>Penanda Tangan & Catatan</h3></div>
          <div className="form-grid">
            <Field label="Penanda tangan invoice"><input {...inp('invoice_signer')} /></Field>
            <Field label="TTD Gudang di Surat Jalan"><input {...inp('sj_gudang_name')} /></Field>
            <Field label="TTD Admin di Surat Jalan"><input {...inp('sj_admin_name')} /></Field>
            <Field label="Note invoice" full><textarea className="input" rows={2} value={f.invoice_note || ''} onChange={(e) => setF({ ...f, invoice_note: e.target.value })} /></Field>
          </div>
        </div>
      </div>
      <div className="form-actions"><button className="btn btn-primary">Simpan Pengaturan</button></div>
    </form>
  );
}
