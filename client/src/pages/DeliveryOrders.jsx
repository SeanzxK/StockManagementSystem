import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Truck, Upload, ReceiptText, CheckCircle2, Send, Pencil } from 'lucide-react';
import { api, useApi, useAuth, useToast, fmtNum, fmtDate, fmtDateTime, todayStr, DO_STATUS, BAST_TYPE } from '../lib';
import { Badge, Empty, Field, FileDrop, Loading, Modal, PageHead, ScanPreview } from '../components/ui';
import { DocActions, Paper, usePaperRef, useSettings } from '../docs/Doc';
import { SuratJalanDoc, ItemsEditor, BankFields, itemsTotal } from '../docs/Templates';

export function DoList() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const { data, loading } = useApi(`/do?status=${status}`);
  const nav = useNavigate();
  return (
    <div>
      <PageHead title="Delivery Order" sub={user.role === 'admin' ? 'Surat Jalan yang sudah ditandatangani customer dikirim ke sini untuk dibuatkan invoice.' : 'Buat Surat Jalan dari BAST, cetak, lalu upload yang sudah ditandatangani customer.'}>
        {['delivery', 'admin'].includes(user.role) && <Link to="/do/baru" className="btn btn-primary"><Plus size={18} /> Buat DO</Link>}
      </PageHead>
      <div className="card">
        <div className="tabs">
          {[['', 'Semua'], ...Object.entries(DO_STATUS).map(([k, v]) => [k, v[0]])].map(([k, l]) => <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        {loading ? <Loading /> : !data.length ? <Empty icon={Truck} text="Belum ada Delivery Order" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>No. Surat Jalan</th><th>Customer / PO</th><th>Tanggal</th><th className="num">Qty</th><th>Pengantar</th><th>Status</th>{user.role === 'admin' && <th>Invoice</th>}</tr></thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => nav(`/do/${d.id}`)}>
                    <td className="strong">{d.number}<div className="small muted">{d.bast_number}</div></td>
                    <td>{d.customer_name}<div className="small muted">{d.po_number}</div></td>
                    <td>{fmtDate(d.do_date, true)}</td>
                    <td className="num strong">{fmtNum(d.total_qty)}</td>
                    <td className="small">{d.driver || '-'}<div className="muted">{d.vehicle_no}</div></td>
                    <td><Badge map={DO_STATUS} value={d.status} /></td>
                    {user.role === 'admin' && <td>{d.invoice_number ? <span className="badge b-dark">{d.invoice_number}</span> : d.status === 'ditandatangani' ? <span className="badge b-amber">Perlu invoice</span> : <span className="muted">-</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Form Surat Jalan: semua isian bisa diubah manual sebelum dicetak sesuai template */
export function DoForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const s = useSettings();
  const { data: basts } = useApi(editing ? null : '/bast?available_for_do=1');
  const [bastId, setBastId] = useState(params.get('bast') || '');
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      api(`/do/${id}`).then((d) => { setDoc(d.doc); setBastId(String(d.bast_id)); }).catch((e) => setErr(e.message));
      return;
    }
    setDoc(null);
    if (bastId) api(`/do/draft?bast_id=${bastId}`).then(setDoc).catch((e) => setErr(e.message));
  }, [bastId, id, editing]);

  const set = (patch) => setDoc((d) => ({ ...d, ...patch }));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (editing) { await api(`/do/${id}`, { method: 'PUT', body: { doc } }); toast('Surat Jalan diperbarui'); nav(`/do/${id}`); }
      else { const r = await api('/do', { method: 'POST', body: { bast_id: Number(bastId), doc } }); toast('Delivery Order dibuat'); nav(`/do/${r.id}`); }
    } catch (e2) { setErr(e2.message); window.scrollTo(0, 0); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      <PageHead title={editing ? 'Edit Surat Jalan' : 'Buat Delivery Order'} sub="Data terisi otomatis dari BAST — semua isian dapat diubah manual. Pratinjau di bawah mengikuti template cetak." back={{ to: editing ? `/do/${id}` : '/do', label: 'Kembali' }} />
      {err && <div className="err">{err}</div>}
      {!editing && (
        <div className="card" style={{ marginBottom: 14 }}>
          <Field label="BAST serah terima ke Delivery *">
            <select className="input" value={bastId} onChange={(e) => setBastId(e.target.value)} required>
              <option value="">— pilih BAST —</option>
              {(basts || []).map((b) => <option key={b.id} value={b.id}>{b.number} · {BAST_TYPE[b.type]?.label} — {b.customer_name} ({fmtNum(b.total_qty)} pcs)</option>)}
            </select>
          </Field>
          {basts && !basts.length && <p className="small muted" style={{ marginBottom: 0 }}>Tidak ada BAST yang belum dibuatkan DO. Buat BAST Produksi → Delivery (sheet) atau Gudang → Delivery (box) terlebih dahulu.</p>}
        </div>
      )}

      {doc && (
        <>
          <div className="grid two" style={{ alignItems: 'start' }}>
            <div className="card">
              <div className="card-head"><h3>Data Surat Jalan</h3></div>
              <div className="form-grid">
                <Field label="No. Order / Surat Jalan"><input className="input" value={doc.number} onChange={(e) => set({ number: e.target.value })} /></Field>
                <Field label="Tanggal"><input className="input" type="date" value={doc.date} onChange={(e) => set({ date: e.target.value })} /></Field>
                <Field label="Kota"><input className="input" value={doc.city} onChange={(e) => set({ city: e.target.value })} /></Field>
                <Field label="Pengantar / Sopir"><input className="input" value={doc.driver} onChange={(e) => set({ driver: e.target.value })} /></Field>
                <Field label="No. Kendaraan"><input className="input" value={doc.vehicle_no} onChange={(e) => set({ vehicle_no: e.target.value })} placeholder="opsional" /></Field>
                <Field label="Tampilkan harga"><select className="input" value={doc.show_price === false ? '0' : '1'} onChange={(e) => set({ show_price: e.target.value === '1' })}><option value="1">Ya (seperti template)</option><option value="0">Tidak</option></select></Field>
                <Field label="TTD Gudang (nama)"><input className="input" value={doc.sign_gudang} onChange={(e) => set({ sign_gudang: e.target.value })} /></Field>
                <Field label="TTD Admin (nama)"><input className="input" value={doc.sign_admin} onChange={(e) => set({ sign_admin: e.target.value })} /></Field>
                <Field label="Catatan" full><input className="input" value={doc.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="opsional" /></Field>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Kepada</h3></div>
              <div className="form-grid">
                <Field label="Nama Customer *" full><input className="input" value={doc.customer_name} onChange={(e) => set({ customer_name: e.target.value })} required /></Field>
                <Field label="Up. (nama penerima)" full><input className="input" value={doc.attn} onChange={(e) => set({ attn: e.target.value })} placeholder="mis. Ibu Yulian Wahyu, SH" /></Field>
                <Field label="Alamat" full><textarea className="input" rows={2} value={doc.address} onChange={(e) => set({ address: e.target.value })} /></Field>
              </div>
              <div className="card-head" style={{ marginTop: 16 }}><h3>Pembayaran (Transfer)</h3></div>
              <BankFields bank={doc.bank} accounts={s.bank_accounts || []} onChange={(bank) => set({ bank })} />
            </div>
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head"><h3>Barang</h3><span className="muted">Total: <b style={{ color: 'var(--ink)' }}>{fmtNum(itemsTotal(doc.items))}</b></span></div>
            <ItemsEditor items={doc.items} onChange={(items) => set({ items })} />
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head"><h3>Pratinjau Template</h3></div>
            <div className="preview-box"><Paper><SuratJalanDoc doc={doc} s={s} /></Paper></div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => nav(-1)}>Batal</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Buat Surat Jalan'}</button>
          </div>
        </>
      )}
    </form>
  );
}

export function DoDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data: d, loading, reload } = useApi(`/do/${id}`);
  const [tab, setTab] = useState('doc');
  const [uploadOpen, setUploadOpen] = useState(false);
  const s = useSettings();
  const paperRef = usePaperRef();
  if (loading || !d) return <Loading />;
  const canDelivery = ['delivery', 'admin'].includes(user.role);
  const act = async (path, msg) => { try { await api(path, { method: 'POST' }); toast(msg); reload(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div>
      <PageHead title={d.number} sub={`Surat Jalan · ${d.customer_name} · PO ${d.po_number}`} back={{ to: canDelivery ? '/do' : '/', label: 'Delivery Order' }}>
        <Badge map={DO_STATUS} value={d.status} />
        {canDelivery && !d.invoice && <Link className="btn btn-ghost" to={`/do/${d.id}/edit`}><Pencil size={16} /> Edit Isi</Link>}
        {canDelivery && d.status === 'dibuat' && <button className="btn btn-outline" onClick={() => act(`/do/${d.id}/ship`, 'DO ditandai dalam pengiriman')}><Send size={16} /> Tandai Dikirim</button>}
        {canDelivery && d.status !== 'ditandatangani' && <button className="btn btn-primary" onClick={() => setUploadOpen(true)}><Upload size={18} /> Upload DO Bertanda Tangan</button>}
        {user.role === 'admin' && d.status === 'ditandatangani' && !d.admin_received_at && <button className="btn btn-outline" onClick={() => act(`/do/${d.id}/receive`, 'DO diterima admin')}><CheckCircle2 size={16} /> Tandai Diterima</button>}
        {user.role === 'admin' && d.status === 'ditandatangani' && !d.invoice && <Link className="btn btn-primary" to={`/invoice/baru?do=${d.id}`}><ReceiptText size={18} /> Buat Invoice</Link>}
        {user.role === 'admin' && d.invoice && <Link className="btn btn-ghost" to={`/invoice/${d.invoice.id}`}>{d.invoice.number}</Link>}
      </PageHead>

      {d.status === 'ditandatangani' && (
        <div className="info"><CheckCircle2 size={18} style={{ flexShrink: 0 }} /><span>Diterima customer {d.received_by_customer ? <b>({d.received_by_customer})</b> : ''} pada {fmtDate(d.signed_at)}. {d.admin_received_at ? `Diterima admin ${fmtDateTime(d.admin_received_at)}.` : 'Menunggu diterima admin.'}</span></div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'doc' ? 'on' : ''}`} onClick={() => setTab('doc')}>Surat Jalan</button>
        <button className={`tab ${tab === 'scan' ? 'on' : ''}`} onClick={() => setTab('scan')}>Scan Bertanda Tangan {d.signed_file_id ? '✓' : ''}</button>
      </div>

      {tab === 'doc' && (
        <>
          <DocActions paperRef={paperRef} filename={`Surat Jalan ${d.number}`} title={`Surat Jalan ${d.number} — ${d.customer_name}`} />
          <Paper paperRef={paperRef}><SuratJalanDoc doc={d.doc} s={s} /></Paper>
        </>
      )}
      {tab === 'scan' && (
        <div className="card">
          {d.signed_file_id ? (
            <>
              <ScanPreview fileId={d.signed_file_id} mime={d.signed_file_mime} name={d.signed_file_name} />
              {canDelivery && <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, background: '#f2f4f3' }} onClick={() => setUploadOpen(true)}>Ganti file scan</button>}
            </>
          ) : <Empty icon={Upload} text="Surat Jalan bertanda tangan belum diupload">{canDelivery && <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => setUploadOpen(true)}>Upload sekarang</button>}</Empty>}
        </div>
      )}
      {uploadOpen && <SignedUpload d={d} onClose={(ok) => { setUploadOpen(false); if (ok) { reload(); setTab('scan'); } }} />}
    </div>
  );
}

function SignedUpload({ d, onClose }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [f, setF] = useState({ received_by_customer: d.received_by_customer || '', signed_at: todayStr() });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setErr('Pilih file scan / foto Surat Jalan');
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('scan', file);
      fd.append('received_by_customer', f.received_by_customer);
      fd.append('signed_at', f.signed_at);
      await api(`/do/${d.id}/signed`, { method: 'POST', form: fd });
      toast('DO bertanda tangan terkirim ke Admin');
      onClose(true);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Upload Surat Jalan Bertanda Tangan" sub="Foto / scan yang sudah ditandatangani customer. Stok delivery otomatis berpindah ke 'Terkirim' dan admin mendapat notifikasi. Foto akan dilampirkan pada invoice." onClose={() => onClose(false)}>
      <form onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <FileDrop file={file} onChange={setFile} label="Upload scan / foto Surat Jalan bertanda tangan" />
        {d.status !== 'ditandatangani' && (
          <div className="form-grid" style={{ marginTop: 14 }}>
            <Field label="Nama penerima di customer"><input className="input" value={f.received_by_customer} onChange={(e) => setF({ ...f, received_by_customer: e.target.value })} /></Field>
            <Field label="Tanggal diterima"><input className="input" type="date" value={f.signed_at} onChange={(e) => setF({ ...f, signed_at: e.target.value })} /></Field>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Batal</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Mengupload…' : 'Kirim ke Admin'}</button>
        </div>
      </form>
    </Modal>
  );
}
