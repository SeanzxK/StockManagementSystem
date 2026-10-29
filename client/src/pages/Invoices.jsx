import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, ReceiptText, CheckCircle2, FileText, Pencil } from 'lucide-react';
import { api, useApi, useToast, fmtNum, fmtRp, fmtDate, addDays, INV_STATUS } from '../lib';
import { Badge, Empty, Field, Loading, PageHead } from '../components/ui';
import { DocActions, Paper, usePaperRef, useSettings } from '../docs/Doc';
import { InvoiceDoc, LampiranSJ, ItemsEditor, BankFields, itemsTotal } from '../docs/Templates';

export function InvoiceList() {
  const { data, loading } = useApi('/invoices');
  const { data: pending } = useApi('/do?invoiceable=1');
  const [status, setStatus] = useState('');
  const nav = useNavigate();
  const rows = (data || []).filter((i) => !status || i.status === status);
  return (
    <div>
      <PageHead title="Invoice" sub="Invoice dibuat dari Surat Jalan (DO) yang sudah ditandatangani customer." />
      {pending && pending.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Surat Jalan Siap Ditagih</h3><span className="badge b-amber">{pending.length} DO</span></div>
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
              <thead><tr><th>No. Invoice</th><th>Customer</th><th>Tanggal</th><th>Jatuh Tempo</th><th>No. SJ / PO</th><th className="num">Total</th><th>Status</th></tr></thead>
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

/** Form invoice: semua isian bisa diubah manual sebelum terbentuk ke template */
export function InvoiceForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const s = useSettings();
  const { data: pending } = useApi(editing ? null : '/do?invoiceable=1');
  const [doId, setDoId] = useState(params.get('do') || '');
  const [doc, setDoc] = useState(null);
  const [doInfo, setDoInfo] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      api(`/invoices/${id}`).then((i) => { setDoc(i.doc); setDoInfo({ number: i.do_number, signed_file_id: i.signed_file_id, signed_file_mime: i.signed_file_mime }); }).catch((e) => setErr(e.message));
      return;
    }
    setDoc(null); setDoInfo(null);
    if (doId) api(`/invoices/draft?do_id=${doId}`).then((r) => { setDoc(r.doc); setDoInfo(r.do); }).catch((e) => setErr(e.message));
  }, [doId, id, editing]);

  useEffect(() => {
    if (doc && !editing && !doc.due_date && s.invoice_due_days) setDoc((d) => ({ ...d, due_date: addDays(d.date, Number(s.invoice_due_days) || 30) }));
  }, [doc, editing, s.invoice_due_days]);

  const set = (patch) => setDoc((d) => ({ ...d, ...patch }));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (editing) { await api(`/invoices/${id}`, { method: 'PUT', body: { doc } }); toast('Invoice diperbarui'); nav(`/invoice/${id}`); }
      else { const r = await api('/invoices', { method: 'POST', body: { do_id: Number(doId), doc } }); toast('Invoice dibuat'); nav(`/invoice/${r.id}`); }
    } catch (e2) { setErr(e2.message); window.scrollTo(0, 0); } finally { setBusy(false); }
  };

  const subtotal = doc ? itemsTotal(doc.items) : 0;
  const tax = doc ? Math.round(subtotal * (Number(doc.tax_rate) || 0) / 100) : 0;

  return (
    <form onSubmit={submit}>
      <PageHead title={editing ? 'Edit Invoice' : 'Buat Invoice'} sub="Data terisi dari Surat Jalan — semua isian dapat diubah manual. Pratinjau di bawah mengikuti template cetak." back={{ to: editing ? `/invoice/${id}` : '/invoice', label: 'Kembali' }} />
      {err && <div className="err">{err}</div>}
      {!editing && (
        <div className="card" style={{ marginBottom: 14 }}>
          <Field label="Surat Jalan / DO (sudah ditandatangani) *">
            <select className="input" value={doId} onChange={(e) => setDoId(e.target.value)} required>
              <option value="">— pilih DO —</option>
              {(pending || []).map((x) => <option key={x.id} value={x.id}>{x.number} — {x.customer_name}</option>)}
              {doInfo && !(pending || []).some((x) => String(x.id) === String(doId)) && <option value={doId}>{doInfo.number}</option>}
            </select>
          </Field>
        </div>
      )}
      {doc && (
        <>
          <div className="grid two" style={{ alignItems: 'start' }}>
            <div className="card">
              <div className="card-head"><h3>Data Invoice</h3></div>
              <div className="form-grid">
                <Field label="No. Invoice"><input className="input" value={doc.number} onChange={(e) => set({ number: e.target.value })} /></Field>
                <Field label="Kota"><input className="input" value={doc.city} onChange={(e) => set({ city: e.target.value })} /></Field>
                <Field label="Tanggal"><input className="input" type="date" value={doc.date} onChange={(e) => set({ date: e.target.value })} /></Field>
                <Field label="Jatuh Tempo"><input className="input" type="date" value={doc.due_date || ''} onChange={(e) => set({ due_date: e.target.value })} /></Field>
                <Field label="PPN (%)" hint="0 = tanpa PPN (seperti template)"><input className="input" type="number" min="0" step="0.01" value={doc.tax_rate} onChange={(e) => set({ tax_rate: e.target.value })} /></Field>
                <Field label="Nama penanda tangan"><input className="input" value={doc.signer} onChange={(e) => set({ signer: e.target.value })} /></Field>
                <Field label="Note" full><input className="input" value={doc.note} onChange={(e) => set({ note: e.target.value })} /></Field>
                <Field label="Lampiran Surat Jalan" full>
                  <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={doc.attach_sj !== false} onChange={(e) => set({ attach_sj: e.target.checked })} />
                    Lampirkan scan Surat Jalan bertanda tangan {doInfo?.number ? `(${doInfo.number})` : ''} di halaman 2
                  </label>
                </Field>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Kepada</h3></div>
              <div className="form-grid">
                <Field label="Nama Customer *" full><input className="input" value={doc.customer_name} onChange={(e) => set({ customer_name: e.target.value })} required /></Field>
                <Field label="Up. (nama penerima)" full><input className="input" value={doc.attn} onChange={(e) => set({ attn: e.target.value })} /></Field>
                <Field label="Alamat" full><textarea className="input" rows={2} value={doc.address} onChange={(e) => set({ address: e.target.value })} /></Field>
              </div>
              <div className="card-head" style={{ marginTop: 16 }}><h3>Rekening Tujuan Transfer</h3></div>
              <BankFields bank={doc.bank} accounts={s.bank_accounts || []} onChange={(bank) => set({ bank })} />
            </div>
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head"><h3>Rincian Barang</h3><span className="muted">Total: <b style={{ color: 'var(--ink)' }}>{fmtRp(subtotal + tax)}</b></span></div>
            <ItemsEditor items={doc.items} onChange={(items) => set({ items })} withRef defaultRef={doInfo?.number} />
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head"><h3>Pratinjau Template</h3></div>
            <div className="preview-box"><Paper extraPages={[doc.attach_sj !== false && <LampiranSJ fileId={doInfo?.signed_file_id} mime={doInfo?.signed_file_mime} number={doInfo?.number} />]}><InvoiceDoc doc={doc} s={s} /></Paper></div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => nav(-1)}>Batal</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Simpan Invoice'}</button>
          </div>
        </>
      )}
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
      <PageHead title={inv.number} sub={`${inv.customer_name} · ${fmtRp(inv.total)} · SJ ${inv.do_number}`} back={{ to: '/invoice', label: 'Invoice' }}>
        <Badge map={INV_STATUS} value={inv.status} />
        <Link to={`/invoice/${inv.id}/edit`} className="btn btn-ghost"><Pencil size={16} /> Edit Isi</Link>
        <button className={`btn ${inv.status === 'lunas' ? 'btn-ghost' : 'btn-outline'}`} onClick={toggle}><CheckCircle2 size={16} /> {inv.status === 'lunas' ? 'Tandai Belum Lunas' : 'Tandai Lunas'}</button>
        <Link to={`/do/${inv.do_id}`} className="btn btn-ghost">Lihat DO</Link>
      </PageHead>
      <DocActions paperRef={paperRef} filename={`Invoice ${inv.number}`} title={`Invoice ${inv.number} — ${inv.customer_name}`} />
      <Paper paperRef={paperRef} extraPages={[inv.doc.attach_sj !== false && <LampiranSJ fileId={inv.signed_file_id} mime={inv.signed_file_mime} number={inv.do_number} />]}>
        <InvoiceDoc doc={inv.doc} s={s} />
      </Paper>
    </div>
  );
}
