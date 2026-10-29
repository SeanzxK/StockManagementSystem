import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, FileText, Pencil, XCircle, ClipboardCheck, Check, Truck, ReceiptText, Factory } from 'lucide-react';
import { api, useApi, useAuth, useToast, fmtNum, fmtRp, fmtDate, todayStr, PO_STATUS, DO_STATUS, INV_STATUS } from '../lib';
import { Badge, Empty, Field, FileDrop, Loading, PageHead, Progress, ScanPreview } from '../components/ui';
import { DocActions, DocHeader, Paper, Signatures, usePaperRef, useSettings } from '../docs/Doc';

export function PoList() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { data, loading } = useApi(`/po?status=${status}&q=${encodeURIComponent(q)}`);
  const nav = useNavigate();
  return (
    <div>
      <PageHead title="Purchase Order" sub={user.role === 'admin' ? 'PO masuk dari customer, dikirim ke gudang, produksi & delivery.' : 'Daftar PO dari admin sebagai acuan pekerjaan.'}>
        {user.role === 'admin' && <Link to="/po/baru" className="btn btn-primary"><Plus size={18} /> Buat PO</Link>}
      </PageHead>
      <div className="card">
        <div className="tabs">
          {[['', 'Semua'], ...Object.entries(PO_STATUS).map(([k, v]) => [k, v[0]])].map(([k, l]) => (
            <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        <div className="toolbar"><input className="input search-input" placeholder="Cari nomor PO / customer…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {loading ? <Loading /> : !data.length ? <Empty text="Belum ada PO" icon={FileText} /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>No. PO</th><th>Customer</th><th>Tgl PO</th><th>Target Kirim</th><th className="num">Qty</th><th style={{ minWidth: 140 }}>Terkirim</th><th>Status</th></tr></thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => nav(`/po/${p.id}`)}>
                    <td className="strong">{p.po_number}</td>
                    <td>{p.customer_name}<div className="small muted">{p.item_count} item</div></td>
                    <td>{fmtDate(p.po_date, true)}</td>
                    <td>{fmtDate(p.due_date, true)}</td>
                    <td className="num">{fmtNum(p.total_qty)}</td>
                    <td><Progress value={p.delivered_qty} max={p.total_qty} /></td>
                    <td><Badge map={PO_STATUS} value={p.status} /></td>
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

const emptyItem = () => ({ product_id: '', description: '', qty: '', sheet_length: '', sheet_width: '', unit_price: '' });

export function PoForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const toast = useToast();
  const { data: products } = useApi('/products');
  const [f, setF] = useState({ po_number: '', customer_name: '', customer_address: '', customer_phone: '', po_date: todayStr(), due_date: '', notes: '' });
  const [items, setItems] = useState([emptyItem()]);
  const [file, setFile] = useState(null);
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [existingFile, setExistingFile] = useState(null);

  useEffect(() => {
    if (!editing) return;
    api(`/po/${id}`).then((po) => {
      setF({ po_number: po.po_number, customer_name: po.customer_name, customer_address: po.customer_address || '', customer_phone: po.customer_phone || '', po_date: po.po_date, due_date: po.due_date || '', notes: po.notes || '' });
      setItems(po.items.map((i) => ({ id: i.id, product_id: i.product_id, description: i.description, qty: i.qty, sheet_length: i.sheet_length || '', sheet_width: i.sheet_width || '', unit_price: i.unit_price || '' })));
      setLocked(po.basts.length > 0);
      setExistingFile(po.file_name);
    });
  }, [id, editing]);

  const prodMap = useMemo(() => Object.fromEntries((products || []).map((p) => [p.id, p])), [products]);
  const setItem = (i, k, v) => setItems((arr) => arr.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const suggest = (it) => {
    const p = prodMap[it.product_id];
    if (!p || !it.sheet_length || !it.sheet_width) return null;
    return Math.round((it.sheet_length * it.sheet_width / 1e6) * p.price_m2);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      fd.append('items', JSON.stringify(items.map((it) => ({ ...it, unit_price: it.unit_price || suggest(it) || '' }))));
      if (file) fd.append('scan', file);
      const r = editing ? await api(`/po/${id}`, { method: 'PUT', form: fd }) : await api('/po', { method: 'POST', form: fd });
      toast(editing ? 'PO diperbarui' : 'PO dibuat & dikirim ke Gudang, Produksi, Delivery');
      nav(`/po/${editing ? id : r.id}`);
    } catch (e2) { setErr(e2.message); window.scrollTo(0, 0); } finally { setBusy(false); }
  };

  const groups = useMemo(() => {
    const g = {};
    (products || []).filter((p) => p.active).forEach((p) => { const k = `${p.category === 'box' ? 'BOX' : 'SHEET'} · Flute ${p.flute}`; (g[k] = g[k] || []).push(p); });
    return g;
  }, [products]);

  return (
    <form onSubmit={submit}>
      <PageHead title={editing ? 'Edit Purchase Order' : 'Buat Purchase Order'} sub="Lampirkan scan PO dari customer. PO otomatis terkirim ke Gudang, Produksi dan Delivery." back={{ to: editing ? `/po/${id}` : '/po', label: 'Kembali' }} />
      {err && <div className="err">{err}</div>}
      <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>Data PO & Customer</h3></div>
          <div className="form-grid">
            <Field label="Nomor PO Customer *"><input className="input" value={f.po_number} onChange={(e) => setF({ ...f, po_number: e.target.value })} required placeholder="mis. PO/ABC/2026/112" /></Field>
            <Field label="Tanggal PO *"><input className="input" type="date" value={f.po_date} onChange={(e) => setF({ ...f, po_date: e.target.value })} required /></Field>
            <Field label="Nama Customer *" full><input className="input" value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} required placeholder="mis. PT Abadi Jaya" /></Field>
            <Field label="Alamat Pengiriman" full><textarea className="input" rows={2} value={f.customer_address} onChange={(e) => setF({ ...f, customer_address: e.target.value })} /></Field>
            <Field label="Telepon Customer"><input className="input" value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} /></Field>
            <Field label="Target Kirim"><input className="input" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
            <Field label="Catatan" full><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="mis. warna cap, instruksi khusus" /></Field>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Scan PO</h3></div>
          <FileDrop file={file} onChange={setFile} label={existingFile ? `File saat ini: ${existingFile}` : 'Upload scan / foto PO'} />
          <div className="info" style={{ marginTop: 14 }}>
            <FileText size={18} style={{ flexShrink: 0 }} />
            <span>Scan PO akan bisa dilihat, diunduh, dan dicetak oleh semua bagian sebagai pegangan.</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h3>Item Pesanan</h3>
          {!locked && <button type="button" className="btn btn-outline btn-sm" onClick={() => setItems([...items, emptyItem()])}><Plus size={15} /> Tambah Item</button>}
        </div>
        {locked && <div className="info">PO sudah diproses (ada BAST). Hanya harga satuan yang dapat diubah.</div>}
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th style={{ minWidth: 220 }}>Jenis Barang (Flute & Substance)</th><th style={{ minWidth: 220 }}>Deskripsi / Ukuran Box & Cap</th><th style={{ width: 110 }}>Qty (pcs)</th><th style={{ width: 170 }}>Ukuran Lembar P×L (mm)</th><th style={{ width: 150 }}>Harga/pcs</th><th></th></tr></thead>
            <tbody>
              {items.map((it, i) => {
                const p = prodMap[it.product_id];
                const sug = suggest(it);
                return (
                  <tr key={i}>
                    <td>
                      <select className="input input-sm" value={it.product_id} onChange={(e) => setItem(i, 'product_id', e.target.value)} required disabled={locked}>
                        <option value="">— pilih —</option>
                        {Object.entries(groups).map(([fl, list]) => (
                          <optgroup key={fl} label={fl}>
                            {list.map((pp) => <option key={pp.id} value={pp.id}>{pp.code} · {pp.substance} (stok {fmtNum(pp.stock)})</option>)}
                          </optgroup>
                        ))}
                      </select>
                      {p && <div className="small muted" style={{ marginTop: 4 }}><span className={`badge ${p.category === 'box' ? 'b-green' : 'b-amber'}`}>{p.category === 'box' ? 'Box → Delivery' : 'Sheet → Produksi'}</span> {fmtRp(p.price_m2)}/m² · stok {fmtNum(p.stock)} {p.unit}</div>}
                    </td>
                    <td><input className="input input-sm" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} required disabled={locked} placeholder="Box 40×30×20 cm, cap logo customer" /></td>
                    <td><input className="input input-sm" type="number" min="1" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} required disabled={locked} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input className="input input-sm" type="number" min="0" placeholder="P" value={it.sheet_length} onChange={(e) => setItem(i, 'sheet_length', e.target.value)} disabled={locked} />
                        <span className="muted">×</span>
                        <input className="input input-sm" type="number" min="0" placeholder="L" value={it.sheet_width} onChange={(e) => setItem(i, 'sheet_width', e.target.value)} disabled={locked} />
                      </div>
                    </td>
                    <td>
                      <input className="input input-sm" type="number" min="0" value={it.unit_price} placeholder={sug ? String(sug) : 'opsional'} onChange={(e) => setItem(i, 'unit_price', e.target.value)} />
                      {sug && !it.unit_price && <div className="small muted" style={{ marginTop: 4 }}>otomatis {fmtRp(sug)}</div>}
                    </td>
                    <td>{!locked && items.length > 1 && <button type="button" className="btn btn-danger btn-xs" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Harga otomatis = luas lembar (P×L) × harga/m² dari daftar harga. Bisa diubah manual dan dipakai sebagai default invoice.</p>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => nav(-1)}>Batal</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Buat & Kirim PO'}</button>
      </div>
    </form>
  );
}

const STEPS = [['baru', 'PO Diterima', FileText], ['produksi', 'Produksi', Factory], ['siap_kirim', 'Siap Kirim', ClipboardCheck], ['pengiriman', 'Pengiriman', Truck], ['terkirim', 'Terkirim', Check], ['selesai', 'Invoice', ReceiptText]];

export function PoDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data: po, loading, reload } = useApi(`/po/${id}`);
  const [tab, setTab] = useState('detail');
  const s = useSettings();
  const paperRef = usePaperRef();
  if (loading || !po) return <Loading />;
  const idx = STEPS.findIndex((x) => x[0] === po.status);
  const cancel = async () => {
    if (!window.confirm('Batalkan PO ini?')) return;
    try { await api(`/po/${id}/cancel`, { method: 'POST' }); toast('PO dibatalkan'); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const canWHPROD = ['production', 'admin'].includes(user.role) && po.items.some((i) => i.category !== 'box' && i.qty > i.qty_produced) && po.status !== 'batal';
  const canWHDEL = ['delivery', 'warehouse', 'admin'].includes(user.role) && po.items.some((i) => i.category === 'box' && i.qty > i.qty_produced) && po.status !== 'batal';
  const canPRODDEL = ['delivery', 'production', 'admin'].includes(user.role) && po.items.some((i) => i.stock_production > 0);

  return (
    <div>
      <PageHead title={po.po_number} sub={`${po.customer_name} · PO tanggal ${fmtDate(po.po_date)}`} back={{ to: '/po', label: 'Purchase Order' }}>
        {canWHPROD && <Link className="btn btn-primary" to={`/bast/baru?type=WH_PROD&po=${po.id}`}><ClipboardCheck size={18} /> BAST Gudang → Produksi</Link>}
        {canWHDEL && <Link className="btn btn-primary" to={`/bast/baru?type=WH_DEL&po=${po.id}`}><ClipboardCheck size={18} /> BAST Gudang → Delivery (Box)</Link>}
        {canPRODDEL && <Link className="btn btn-primary" to={`/bast/baru?type=PROD_DEL&po=${po.id}`}><ClipboardCheck size={18} /> BAST Produksi → Delivery</Link>}
        {user.role === 'admin' && po.status !== 'batal' && <Link className="btn btn-outline" to={`/po/${po.id}/edit`}><Pencil size={16} /> Edit</Link>}
        {user.role === 'admin' && po.status === 'baru' && <button className="btn btn-danger" onClick={cancel}><XCircle size={16} /> Batalkan</button>}
      </PageHead>

      <div className="card" style={{ marginBottom: 14 }}>
        {po.status === 'batal' ? <div className="err" style={{ margin: 0 }}>PO ini telah dibatalkan.</div> : (
          <div className="timeline">
            {STEPS.map(([k, l, Ic], i) => (
              <div key={k} className={`tl-step ${i <= idx ? 'done' : ''}`}><div className="c"><Ic size={15} /></div>{l}</div>
            ))}
          </div>
        )}
      </div>

      <div className="tabs">
        {[['detail', 'Detail & Progress'], ['scan', 'Scan PO'], ['cetak', 'Cetak Ringkasan']].map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'detail' && (
        <>
          <div className="grid two" style={{ alignItems: 'start' }}>
            <div className="card">
              <div className="card-head"><h3>Informasi</h3><Badge map={PO_STATUS} value={po.status} /></div>
              <dl className="kv">
                <dt>Customer</dt><dd>{po.customer_name}</dd>
                <dt>Alamat kirim</dt><dd>{po.customer_address || '-'}</dd>
                <dt>Telepon</dt><dd>{po.customer_phone || '-'}</dd>
                <dt>Target kirim</dt><dd>{fmtDate(po.due_date)}</dd>
                <dt>Catatan</dt><dd>{po.notes || '-'}</dd>
                <dt>Dibuat oleh</dt><dd>{po.created_by_name}</dd>
              </dl>
            </div>
            <div className="card">
              <div className="card-head"><h3>Dokumen Terkait</h3></div>
              <div className="list">
                {po.basts.map((b) => (
                  <Link to={`/bast/${b.id}`} className="list-item" key={'b' + b.id}>
                    <div className="ic" style={{ background: '#eaf6ef', color: '#1b5e3b' }}><ClipboardCheck size={18} /></div>
                    <div className="grow"><div className="t">{b.number}</div><div className="s">{b.type === 'WH_PROD' ? 'Gudang → Produksi' : 'Produksi → Delivery'} · {fmtNum(b.total_qty)} pcs · {fmtDate(b.bast_date, true)}</div></div>
                  </Link>
                ))}
                {po.delivery_orders.map((d) => (
                  <Link to={`/do/${d.id}`} className="list-item" key={'d' + d.id}>
                    <div className="ic" style={{ background: '#fff0e3', color: '#d66a12' }}><Truck size={18} /></div>
                    <div className="grow"><div className="t">{d.number}</div><div className="s">Delivery Order · {fmtDate(d.do_date, true)}</div></div>
                    <Badge map={DO_STATUS} value={d.status} />
                  </Link>
                ))}
                {user.role === 'admin' && po.invoices.map((i) => (
                  <Link to={`/invoice/${i.id}`} className="list-item" key={'i' + i.id}>
                    <div className="ic" style={{ background: '#e8f0fd', color: '#2563c9' }}><ReceiptText size={18} /></div>
                    <div className="grow"><div className="t">{i.number}</div><div className="s">Invoice · {fmtRp(i.total)}</div></div>
                    <Badge map={INV_STATUS} value={i.status} />
                  </Link>
                ))}
                {!po.basts.length && !po.delivery_orders.length && <Empty text="Belum ada dokumen lanjutan" />}
              </div>
            </div>
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head"><h3>Item & Progress</h3></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Barang</th><th>Deskripsi</th><th className="num">Pesanan</th><th className="num">Keluar Gudang</th><th className="num">Di Produksi</th><th className="num">Di Delivery</th><th className="num">Terkirim</th><th style={{ minWidth: 120 }}>Progress</th></tr></thead>
                <tbody>
                  {po.items.map((i) => (
                    <tr key={i.id}>
                      <td><b>{i.product_code}</b> <span className={`badge ${i.category === 'box' ? 'b-green' : 'b-amber'}`}>{i.category === 'box' ? 'Box' : 'Sheet'}</span><div className="small muted">{i.substance}</div></td>
                      <td>{i.description}{i.sheet_length ? <div className="small muted">Lembar {i.sheet_length}×{i.sheet_width} mm</div> : null}</td>
                      <td className="num strong">{fmtNum(i.qty)}</td>
                      <td className="num">{fmtNum(i.qty_produced)}</td>
                      <td className="num">{fmtNum(i.stock_production)}</td>
                      <td className="num">{fmtNum(i.stock_delivery)}</td>
                      <td className="num">{fmtNum(i.qty_delivered)}</td>
                      <td><Progress value={i.qty_delivered} max={i.qty} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'scan' && (
        <div className="card">
          {po.file_id ? <ScanPreview fileId={po.file_id} mime={po.file_mime} name={po.file_name} /> : <Empty text="Scan PO belum diupload" icon={FileText}>{user.role === 'admin' && <Link className="btn btn-outline btn-sm" style={{ marginTop: 10 }} to={`/po/${po.id}/edit`}>Upload sekarang</Link>}</Empty>}
        </div>
      )}

      {tab === 'cetak' && (
        <>
          <DocActions paperRef={paperRef} filename={`PO ${po.po_number}`} title={`Purchase Order ${po.po_number} — ${po.customer_name}`} />
          <Paper paperRef={paperRef}>
            <DocHeader s={s} title="PURCHASE ORDER (INTERNAL)" number={po.po_number} date={fmtDate(po.po_date)} />
            <div className="meta">
              <div className="box"><div className="h">Customer</div><b>{po.customer_name}</b><div>{po.customer_address}</div><div>{po.customer_phone}</div></div>
              <div className="box"><div className="h">Keterangan</div><div>Target kirim: <b>{fmtDate(po.due_date)}</b></div><div>Status: {PO_STATUS[po.status][0]}</div><div>{po.notes}</div></div>
            </div>
            <table>
              <thead><tr><th className="c">No</th><th>Kode</th><th>Jenis Barang</th><th>Deskripsi</th><th className="r">Qty</th></tr></thead>
              <tbody>{po.items.map((i, n) => <tr key={i.id}><td className="c">{n + 1}</td><td>{i.product_code}</td><td>{i.product_name}</td><td>{i.description}{i.sheet_length ? ` (lembar ${i.sheet_length}×${i.sheet_width} mm)` : ''}</td><td className="r">{fmtNum(i.qty)} pcs</td></tr>)}</tbody>
            </table>
            <p className="note">Dokumen ini adalah ringkasan PO dari customer untuk acuan kerja Gudang, Produksi dan Delivery. Scan PO asli terlampir di sistem.</p>
            <Signatures items={[['Dibuat (Admin)', po.created_by_name], ['Gudang', ''], ['Produksi', ''], ['Delivery', '']]} />
          </Paper>
        </>
      )}
    </div>
  );
}
