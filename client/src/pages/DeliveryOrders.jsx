import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Truck, Upload, ReceiptText, CheckCircle2, Send } from 'lucide-react';
import { api, useApi, useAuth, useToast, fmtNum, fmtDate, fmtDateTime, todayStr, DO_STATUS } from '../lib';
import { Badge, Empty, Field, FileDrop, Loading, Modal, PageHead, ScanPreview } from '../components/ui';
import { DocActions, DocHeader, Paper, Signatures, usePaperRef, useSettings } from '../docs/Doc';

export function DoList() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const { data, loading } = useApi(`/do?status=${status}`);
  const nav = useNavigate();
  return (
    <div>
      <PageHead title="Delivery Order" sub={user.role === 'admin' ? 'DO yang sudah ditandatangani customer dikirim ke sini untuk dibuatkan invoice.' : 'Buat DO dari BAST produksi, cetak, lalu upload DO yang sudah ditandatangani customer.'}>
        {user.role === 'delivery' && <Link to="/do/baru" className="btn btn-primary"><Plus size={18} /> Buat DO</Link>}
      </PageHead>
      <div className="card">
        <div className="tabs">
          {[['', 'Semua'], ...Object.entries(DO_STATUS).map(([k, v]) => [k, v[0]])].map(([k, l]) => <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        {loading ? <Loading /> : !data.length ? <Empty icon={Truck} text="Belum ada Delivery Order" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>No. DO</th><th>Customer / PO</th><th>Tanggal</th><th className="num">Qty</th><th>Sopir / Kendaraan</th><th>Status</th>{user.role === 'admin' && <th>Invoice</th>}</tr></thead>
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

export function DoForm() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: basts } = useApi('/bast?available_for_do=1');
  const [bastId, setBastId] = useState(params.get('bast') || '');
  const [bast, setBast] = useState(null);
  const [f, setF] = useState({ do_date: todayStr(), driver: '', vehicle_no: '', ship_to: '', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBast(null);
    if (bastId) api(`/bast/${bastId}`).then((b) => { setBast(b); setF((x) => ({ ...x, ship_to: b.customer_address || '' })); });
  }, [bastId]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api('/do', { method: 'POST', body: { bast_id: Number(bastId), ...f } });
      toast('Delivery Order dibuat');
      nav(`/do/${r.id}`);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <PageHead title="Buat Delivery Order" sub="DO dibuat dari BAST serah terima Produksi → Delivery." back={{ to: '/do', label: 'Delivery Order' }} />
      {err && <div className="err">{err}</div>}
      <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>Data Pengiriman</h3></div>
          <div className="form-grid">
            <Field label="BAST Produksi → Delivery *" full>
              <select className="input" value={bastId} onChange={(e) => setBastId(e.target.value)} required>
                <option value="">— pilih BAST —</option>
                {(basts || []).map((b) => <option key={b.id} value={b.id}>{b.number} — {b.customer_name} ({fmtNum(b.total_qty)} pcs)</option>)}
                {bast && !(basts || []).some((b) => b.id === bast.id) && <option value={bast.id}>{bast.number}</option>}
              </select>
            </Field>
            <Field label="Tanggal DO"><input className="input" type="date" value={f.do_date} onChange={(e) => setF({ ...f, do_date: e.target.value })} /></Field>
            <Field label="Nama Sopir"><input className="input" value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })} /></Field>
            <Field label="No. Kendaraan"><input className="input" value={f.vehicle_no} onChange={(e) => setF({ ...f, vehicle_no: e.target.value })} placeholder="B 1234 XYZ" /></Field>
            <div />
            <Field label="Alamat Kirim" full><textarea className="input" rows={2} value={f.ship_to} onChange={(e) => setF({ ...f, ship_to: e.target.value })} /></Field>
            <Field label="Catatan" full><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Barang Dikirim</h3></div>
          {!bast ? <Empty text={basts && !basts.length ? 'Tidak ada BAST yang belum dibuatkan DO' : 'Pilih BAST terlebih dahulu'} /> : (
            <>
              <dl className="kv" style={{ marginBottom: 14 }}><dt>Customer</dt><dd>{bast.customer_name}</dd><dt>No. PO</dt><dd>{bast.po_number}</dd></dl>
              <table className="tbl">
                <thead><tr><th>Barang</th><th className="num">Qty</th></tr></thead>
                <tbody>{bast.items.map((i) => <tr key={i.id}><td>{i.description}<div className="small muted">{i.product_code}</div></td><td className="num strong">{fmtNum(i.qty)}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => nav(-1)}>Batal</button>
        <button className="btn btn-primary" disabled={busy || !bast}>{busy ? 'Menyimpan…' : 'Buat DO'}</button>
      </div>
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
  const total = d.items.reduce((a, i) => a + i.qty, 0);
  const canDelivery = ['delivery', 'admin'].includes(user.role);
  const act = async (path, msg) => { try { await api(path, { method: 'POST' }); toast(msg); reload(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div>
      <PageHead title={d.number} sub={`${d.customer_name} · PO ${d.po_number}`} back={{ to: user.role === 'admin' || user.role === 'delivery' ? '/do' : '/', label: 'Delivery Order' }}>
        <Badge map={DO_STATUS} value={d.status} />
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
        <button className={`tab ${tab === 'doc' ? 'on' : ''}`} onClick={() => setTab('doc')}>Dokumen DO</button>
        <button className={`tab ${tab === 'scan' ? 'on' : ''}`} onClick={() => setTab('scan')}>Scan DO Bertanda Tangan {d.signed_file_id ? '✓' : ''}</button>
      </div>

      {tab === 'doc' && (
        <>
          <DocActions paperRef={paperRef} filename={d.number} title={`Delivery Order ${d.number} — ${d.customer_name}`} />
          <Paper paperRef={paperRef}>
            <DocHeader s={s} title="DELIVERY ORDER" number={d.number} date={fmtDate(d.do_date)} />
            <div className="meta">
              <div className="box"><div className="h">Kirim Kepada</div><b>{d.customer_name}</b><div>{d.ship_to || d.customer_address}</div><div>{d.customer_phone}</div></div>
              <div className="box"><div className="h">Referensi</div><div>No. PO: <b>{d.po_number}</b></div><div>No. BAST: {d.bast_number}</div><div>Sopir: {d.driver || '-'} · Kendaraan: {d.vehicle_no || '-'}</div></div>
            </div>
            <table>
              <thead><tr><th className="c" style={{ width: 30 }}>No</th><th>Nama Barang</th><th>Jenis</th><th className="r">Jumlah</th><th>Keterangan</th></tr></thead>
              <tbody>
                {d.items.map((i, n) => <tr key={i.id}><td className="c">{n + 1}</td><td>{i.description}</td><td>{i.product_code}</td><td className="r">{fmtNum(i.qty)} pcs</td><td></td></tr>)}
                <tr><td colSpan={3} className="r"><b>Total</b></td><td className="r"><b>{fmtNum(total)} pcs</b></td><td></td></tr>
              </tbody>
            </table>
            {d.notes && <p className="note"><b>Catatan:</b> {d.notes}</p>}
            <p className="note">Barang telah diterima dalam keadaan baik dan jumlah sesuai. Mohon DO ini ditandatangani dan distempel oleh penerima.</p>
            <Signatures items={[['Hormat kami (Admin)', ''], ['Pengirim / Sopir', d.driver], ['Diterima oleh (Customer)', d.received_by_customer]]} />
          </Paper>
        </>
      )}
      {tab === 'scan' && (
        <div className="card">
          {d.signed_file_id ? (
            <>
              <ScanPreview fileId={d.signed_file_id} mime={d.signed_file_mime} name={d.signed_file_name} />
              {canDelivery && <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, background: '#f2f4f3' }} onClick={() => setUploadOpen(true)}>Ganti file scan</button>}
            </>
          ) : <Empty icon={Upload} text="DO bertanda tangan belum diupload">{canDelivery && <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => setUploadOpen(true)}>Upload sekarang</button>}</Empty>}
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
    if (!file) return setErr('Pilih file scan / foto DO');
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
    <Modal title="Upload DO Bertanda Tangan" sub="Foto / scan DO yang sudah ditandatangani customer. Stok delivery otomatis berpindah ke 'Terkirim' dan admin mendapat notifikasi." onClose={() => onClose(false)}>
      <form onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <FileDrop file={file} onChange={setFile} label="Upload scan / foto DO bertanda tangan" />
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
