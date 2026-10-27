import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, ReceiptText, Trash2, CheckCircle2, FileText } from 'lucide-react';
import { api, useApi, useToast, fmtNum, fmtRp, fmtDate, todayStr, addDays, terbilang, INV_STATUS } from '../lib';
import { Badge, Empty, Field, Loading, PageHead } from '../components/ui';
import { DocActions, DocHeader, Paper, Signatures, usePaperRef, useSettings } from '../docs/Doc';

export function InvoiceList() {
  const { data, loading } = useApi('/invoices');
  const { data: pending } = useApi('/do?invoiceable=1');
  const [status, setStatus] = useState('');
  const nav = useNavigate();
  const rows = (data || []).filter((i) => !status || i.status === status);
  return (
    <div>
      <PageHead title="Invoice" sub="Invoice dibuat dari DO yang sudah ditandatangani customer." />
      {pending && pending.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>DO Siap Ditagih</h3><span className="badge b-amber">{pending.length} DO</span></div>
          <div className="list">
            {pending.map((d) => (
              <div className="list-item" key={d.id}>
                <div className="ic" style={{ background: '#fff6e0', color: '#c98a0b' }}><FileText size={18} /></div>
                <div className="grow"><div className="t">{d.customer_name}</div><div className="s">{d.number} · PO {d.po_number} · {fmtNum(d.total_qty)} pcs · diterima {fmtDate(d.signed_at, true)}</div></div>
                <Link to={`/do/${d.id}`} className="btn btn-ghost btn-sm" style={{ background: '#f2f4f3' }}>Lihat DO</Link>
                <Link to={`/invoice/baru?do=${d.id}`} className="btn btn-primary btn-sm"><Plus size={15} /> Invoice</Link>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <div className="tabs">
          {[['', 'Semua'], ['belum_lunas', 'Belum Lunas'], ['lunas', 'Lunas']].map(([k, l]) => <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        {loading ? <Loading /> : !rows.length ? <Empty icon={ReceiptText} text="Belum ada invoice" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>No. Invoice</th><th>Customer</th><th>Tanggal</th><th>Jatuh Tempo</th><th>Ref DO / PO</th><th className="num">Total</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="clickable" onClick={() => nav(`/invoice/${i.id}`)}>
                    <td className="strong">{i.number}</td>
                    <td>{i.customer_name}</td>
                    <td>{fmtDate(i.invoice_date, true)}</td>
                    <td>{fmtDate(i.due_date, true)}</td>
                    <td className="small">{i.do_number}<div className="muted">{i.po_number}</div></td>
                    <td className="num strong">{fmtRp(i.total)}</td>
                    <td><Badge map={INV_STATUS} value={i.status} /></td>
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

export function InvoiceForm() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const s = useSettings();
  const { data: pending } = useApi('/do?invoiceable=1');
  const [doId, setDoId] = useState(params.get('do') || '');
  const [d, setD] = useState(null);
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ invoice_date: todayStr(), due_date: '', tax_rate: '', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (s.tax_rate !== undefined) setF((x) => ({ ...x, tax_rate: x.tax_rate === '' ? s.tax_rate : x.tax_rate, due_date: x.due_date || addDays(x.invoice_date, Number(s.invoice_due_days) || 30) }));
  }, [s.tax_rate, s.invoice_due_days]);
  useEffect(() => {
    setD(null); setItems([]);
    if (doId) api(`/do/${doId}`).then((x) => {
      setD(x);
      setItems(x.items.map((i) => ({ description: `${i.description} (${i.product_code})`, qty: i.qty, unit: 'pcs', unit_price: i.suggested_price || '' })));
    }).catch((e) => setErr(e.message));
  }, [doId]);

  const setItem = (i, k, v) => setItems((a) => a.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const subtotal = items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const tax = Math.round(subtotal * (Number(f.tax_rate) || 0) / 100);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api('/invoices', { method: 'POST', body: { do_id: Number(doId), ...f, items } });
      toast('Invoice dibuat');
      nav(`/invoice/${r.id}`);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      <PageHead title="Buat Invoice" sub="Pilih DO bertanda tangan. Harga otomatis dari harga PO / daftar harga per m²." back={{ to: '/invoice', label: 'Invoice' }} />
      {err && <div className="err">{err}</div>}
      <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>Data Invoice</h3></div>
          <div className="form-grid">
            <Field label="Delivery Order (sudah TTD) *" full>
              <select className="input" value={doId} onChange={(e) => setDoId(e.target.value)} required>
                <option value="">— pilih DO —</option>
                {(pending || []).map((x) => <option key={x.id} value={x.id}>{x.number} — {x.customer_name}</option>)}
                {d && !(pending || []).some((x) => x.id === d.id) && <option value={d.id}>{d.number}</option>}
              </select>
            </Field>
            <Field label="Tanggal Invoice"><input className="input" type="date" value={f.invoice_date} onChange={(e) => setF({ ...f, invoice_date: e.target.value })} /></Field>
            <Field label="Jatuh Tempo"><input className="input" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
            <Field label="PPN (%)"><input className="input" type="number" min="0" step="0.01" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} /></Field>
            <div />
            <Field label="Catatan" full><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Customer</h3></div>
          {d ? (
            <>
              <dl className="kv">
                <dt>Customer</dt><dd>{d.customer_name}</dd>
                <dt>Alamat</dt><dd>{d.customer_address || '-'}</dd>
                <dt>No. PO</dt><dd>{d.po_number}</dd>
                <dt>No. DO</dt><dd>{d.number}</dd>
                <dt>Diterima</dt><dd>{fmtDate(d.signed_at)} {d.received_by_customer && `oleh ${d.received_by_customer}`}</dd>
              </dl>
              {d.signed_file_id && <a href={`/api/files/${d.signed_file_id}`} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ marginTop: 14 }}><CheckCircle2 size={15} /> Lihat scan DO bertanda tangan</a>}
            </>
          ) : <Empty text="Pilih DO terlebih dahulu" />}
        </div>
      </div>
      {d && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head"><h3>Rincian Tagihan</h3><button type="button" className="btn btn-outline btn-sm" onClick={() => setItems([...items, { description: '', qty: 1, unit: 'pcs', unit_price: '' }])}><Plus size={15} /> Baris</button></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th style={{ minWidth: 260 }}>Deskripsi</th><th style={{ width: 110 }}>Qty</th><th style={{ width: 90 }}>Satuan</th><th style={{ width: 160 }}>Harga Satuan</th><th className="num">Jumlah</th><th></th></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td><input className="input input-sm" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} required /></td>
                    <td><input className="input input-sm" type="number" min="0" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} /></td>
                    <td><input className="input input-sm" value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} /></td>
                    <td><input className="input input-sm" type="number" min="0" value={it.unit_price} onChange={(e) => setItem(i, 'unit_price', e.target.value)} required /></td>
                    <td className="num strong">{fmtRp((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</td>
                    <td>{items.length > 1 && <button type="button" className="btn btn-danger btn-xs" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <dl className="kv" style={{ gridTemplateColumns: '120px 160px', textAlign: 'right' }}>
              <dt>Subtotal</dt><dd className="mono">{fmtRp(subtotal)}</dd>
              <dt>PPN {f.tax_rate || 0}%</dt><dd className="mono">{fmtRp(tax)}</dd>
              <dt style={{ color: 'var(--ink)', fontWeight: 700 }}>Total</dt><dd className="mono" style={{ fontSize: 18 }}>{fmtRp(subtotal + tax)}</dd>
            </dl>
          </div>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => nav(-1)}>Batal</button>
        <button className="btn btn-primary" disabled={busy || !d}>{busy ? 'Menyimpan…' : 'Simpan Invoice'}</button>
      </div>
    </form>
  );
}

export function InvoiceDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data: inv, loading, reload } = useApi(`/invoices/${id}`);
  const s = useSettings();
  const paperRef = usePaperRef();
  if (loading || !inv) return <Loading />;
  const toggle = async () => {
    try { await api(`/invoices/${id}/status`, { method: 'PUT', body: { status: inv.status === 'lunas' ? 'belum_lunas' : 'lunas' } }); toast('Status invoice diperbarui'); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div>
      <PageHead title={inv.number} sub={`${inv.customer_name} · ${fmtRp(inv.total)}`} back={{ to: '/invoice', label: 'Invoice' }}>
        <Badge map={INV_STATUS} value={inv.status} />
        <button className={`btn ${inv.status === 'lunas' ? 'btn-ghost' : 'btn-outline'}`} onClick={toggle}><CheckCircle2 size={16} /> {inv.status === 'lunas' ? 'Tandai Belum Lunas' : 'Tandai Lunas'}</button>
        <Link to={`/do/${inv.do_id}`} className="btn btn-ghost">Lihat DO</Link>
      </PageHead>
      <DocActions paperRef={paperRef} filename={inv.number} title={`Invoice ${inv.number} — ${inv.customer_name}`} />
      <Paper paperRef={paperRef}>
        <DocHeader s={s} title="INVOICE" number={inv.number} date={fmtDate(inv.invoice_date)} />
        <div className="meta">
          <div className="box"><div className="h">Ditagihkan Kepada</div><b>{inv.customer_name}</b><div>{inv.customer_address}</div><div>{inv.customer_phone}</div></div>
          <div className="box">
            <div className="h">Detail</div>
            <div>No. PO: <b>{inv.po_number}</b></div>
            <div>No. DO: {inv.do_number} ({fmtDate(inv.do_date, true)})</div>
            <div>Jatuh tempo: <b>{fmtDate(inv.due_date)}</b></div>
            {inv.status === 'lunas' && <div style={{ marginTop: 6 }}><span className="stamp">LUNAS</span></div>}
          </div>
        </div>
        <table>
          <thead><tr><th className="c" style={{ width: 30 }}>No</th><th>Deskripsi</th><th className="r">Qty</th><th className="r">Harga Satuan</th><th className="r">Jumlah</th></tr></thead>
          <tbody>
            {inv.items.map((i, n) => <tr key={i.id}><td className="c">{n + 1}</td><td>{i.description}</td><td className="r">{fmtNum(i.qty)} {i.unit}</td><td className="r">{fmtRp(i.unit_price)}</td><td className="r">{fmtRp(i.amount)}</td></tr>)}
          </tbody>
        </table>
        <table className="tot" style={{ width: '50%', marginLeft: 'auto' }}>
          <tbody>
            <tr><td>Subtotal</td><td className="r">{fmtRp(inv.subtotal)}</td></tr>
            <tr><td>PPN {inv.tax_rate}%</td><td className="r">{fmtRp(inv.tax)}</td></tr>
            <tr className="gt"><td>TOTAL</td><td className="r">{fmtRp(inv.total)}</td></tr>
          </tbody>
        </table>
        <div className="terbilang">Terbilang: {terbilang(inv.total)}</div>
        {inv.notes && <p className="note"><b>Catatan:</b> {inv.notes}</p>}
        <p className="note"><b>Pembayaran ditransfer ke:</b><br />{s.bank_info}</p>
        <div className="sigs" style={{ '--n': 2 }}>
          <div />
          <div><div>Hormat kami,</div><div className="line">{s.company_name}</div></div>
        </div>
      </Paper>
    </div>
  );
}
