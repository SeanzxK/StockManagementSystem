import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, Download, Warehouse, History, Factory, Truck, Layers, Package } from 'lucide-react';
import { api, useApi, useAuth, useToast, fmtNum, fmtRp, fmtDate, fmtDateTime, todayStr, LOC_LABEL, REF_LABEL } from '../lib';
import { Empty, Field, Loading, Modal, PageHead } from '../components/ui';

export function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
}

export function StockWarehouse() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, loading, reload } = useApi('/stock/warehouse');
  const [flute, setFlute] = useState('');
  const [cat, setCat] = useState(params.get('cat') || 'sheet');
  const [q, setQ] = useState(params.get('q') || '');
  const [onlyStock, setOnlyStock] = useState(false);
  const [modal, setModal] = useState(params.get('aksi') ? { dir: params.get('aksi') } : null);
  const canEdit = ['warehouse', 'admin'].includes(user.role);

  const rows = useMemo(() => (data || []).filter((p) => p.category === cat &&
    (!flute || p.flute === flute) && (!onlyStock || p.stock > 0) &&
    (!q || `${p.code} ${p.name} ${p.substance}`.toLowerCase().includes(q.toLowerCase()))), [data, flute, q, onlyStock, cat]);
  const total = rows.reduce((a, p) => a + p.stock, 0);

  const closeModal = (changed) => { setModal(null); setParams({}); if (changed) reload(); };

  return (
    <div>
      <PageHead title="Stok Gudang" sub="Stok bahan karton per jenis flute & substance di gudang.">
        {canEdit && <>
          <button className="btn btn-primary" onClick={() => setModal({ dir: 'in' })}><ArrowDownToLine size={18} /> Barang Masuk</button>
          <button className="btn btn-outline" onClick={() => setModal({ dir: 'out' })}><ArrowUpFromLine size={18} /> Barang Keluar</button>
        </>}
      </PageHead>
      <div className="card">
        <div className="toolbar">
          <div className="cat-switch">
            <button className={cat === 'sheet' ? 'on' : ''} onClick={() => setCat('sheet')}><Layers size={16} /> Sheet</button>
            <button className={cat === 'box' ? 'on' : ''} onClick={() => setCat('box')}><Package size={16} /> Box</button>
          </div>
          <span className="small muted">{cat === 'box' ? 'Box: dari Gudang langsung ke Delivery' : 'Sheet: dari Gudang ke Produksi'}</span>
        </div>
        <div className="tabs">
          {[['', 'Semua'], ['B', 'Flute B'], ['C', 'Flute C'], ['CB', 'Flute CB (Double Wall)']].map(([k, l]) => <button key={k} className={`tab ${flute === k ? 'on' : ''}`} onClick={() => setFlute(k)}>{l}</button>)}
        </div>
        <div className="toolbar">
          <input className="input search-input" placeholder="Cari kode / substance (mis. K150)…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} /> Hanya yang ada stok</label>
          <div className="spacer" />
          <span className="muted small">Total: <b className="mono" style={{ color: 'var(--ink)' }}>{fmtNum(total)}</b> {cat === 'box' ? 'pcs' : 'lembar'}</span>
          <button className="btn btn-ghost btn-sm" style={{ background: '#f2f4f3' }} onClick={() => downloadCsv(`stok-gudang-${cat}-${todayStr()}.csv`, [['Kode', 'Nama', 'Flute', 'Substance', 'Harga/m2', 'Stok', 'Satuan'], ...rows.map((p) => [p.code, p.name, p.flute, p.substance, p.price_m2, p.stock, p.unit])])}><Download size={15} /> CSV</button>
        </div>
        {loading ? <Loading /> : !rows.length ? <Empty icon={Warehouse} text="Tidak ada barang" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Kode</th><th>Flute</th><th>Substance</th><th className="num">Harga / m²</th><th className="num">Stok</th><th>Status</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {rows.map((p) => {
                  const low = p.min_stock > 0 && p.stock <= p.min_stock;
                  return (
                    <tr key={p.id}>
                      <td className="strong">{p.code}</td>
                      <td><span className="badge b-green">{p.flute}</span></td>
                      <td className="mono">{p.substance}</td>
                      <td className="num">{fmtRp(p.price_m2)}</td>
                      <td className="num strong" style={{ fontSize: 15 }}>{fmtNum(p.stock)} <span className="muted small">{p.unit}</span></td>
                      <td>{p.stock <= 0 ? <span className="badge b-gray">Kosong</span> : low ? <span className="badge b-red">Menipis</span> : <span className="badge b-green">Tersedia</span>}</td>
                      {canEdit && <td className="num">
                        <button className="btn btn-ghost btn-xs" style={{ background: '#eaf6ef', color: 'var(--green-800)' }} onClick={() => setModal({ dir: 'in', product_id: p.id })}>+ Masuk</button>{' '}
                        <button className="btn btn-ghost btn-xs" style={{ background: '#f6f1f1', color: 'var(--red)' }} onClick={() => setModal({ dir: 'out', product_id: p.id })} disabled={p.stock <= 0}>− Keluar</button>
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modal && <MoveModal dir={modal.dir} productId={modal.product_id} products={data || []} onClose={closeModal} />}
    </div>
  );
}

function MoveModal({ dir, productId, products, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ product_id: productId || '', qty: '', trx_date: todayStr(), party: '', reference: '', note: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const p = products.find((x) => x.id === Number(f.product_id));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api(`/stock/warehouse/${dir}`, { method: 'POST', body: f });
      toast(dir === 'in' ? 'Barang masuk tercatat' : 'Barang keluar tercatat');
      onClose(true);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={dir === 'in' ? 'Catat Barang Masuk' : 'Catat Barang Keluar'} sub={dir === 'in' ? 'Pembelian / penerimaan barang dari supplier.' : 'Barang keluar di luar BAST produksi (rusak, retur, dll). Barang ke produksi wajib lewat BAST.'} onClose={() => onClose(false)}>
      <form onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <div className="form-grid">
          <Field label="Jenis barang *" full>
            <select className="input" value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })} required>
              <option value="">— pilih barang —</option>
              {['sheet', 'box'].map((c) => (
                <optgroup key={c} label={c === 'box' ? 'BOX' : 'SHEET'}>
                  {products.filter((x) => x.active && x.category === c).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.substance} — stok {fmtNum(x.stock)}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Jumlah *" hint={p ? `Stok saat ini ${fmtNum(p.stock)} ${p.unit}` : ''}><input className="input" type="number" min="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} required /></Field>
          <Field label="Tanggal"><input className="input" type="date" value={f.trx_date} onChange={(e) => setF({ ...f, trx_date: e.target.value })} /></Field>
          <Field label={dir === 'in' ? 'Supplier' : 'Tujuan / Penerima'}><input className="input" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} /></Field>
          <Field label={dir === 'in' ? 'No. Surat Jalan / Nota' : 'No. Referensi'}><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
          <Field label="Keterangan" full><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Batal</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function StockByPo({ location }) {
  const { user } = useAuth();
  const { data, loading } = useApi(`/stock/${location}`);
  const [q, setQ] = useState('');
  useEffect(() => setQ(''), [location]);
  const rows = (data || []).filter((r) => !q || `${r.customer_name} ${r.po_number} ${r.description} ${r.product_code}`.toLowerCase().includes(q.toLowerCase()));
  const total = rows.reduce((a, r) => a + r.stock, 0);
  const isProd = location === 'production';
  return (
    <div>
      <PageHead title={isProd ? 'Stok Produksi' : 'Stok Delivery'} sub={isProd ? 'Barang jadi hasil BAST dari gudang, dikelompokkan per PO & customer tujuan.' : 'Barang yang sudah diserahkan produksi ke delivery dan belum diterima customer.'}>
        {isProd && ['delivery', 'admin', 'production'].includes(user.role) && <Link className="btn btn-primary" to="/bast/baru?type=PROD_DEL">BAST Produksi → Delivery</Link>}
        {!isProd && ['delivery', 'admin'].includes(user.role) && <Link className="btn btn-primary" to="/do/baru">Buat Delivery Order</Link>}
      </PageHead>
      <div className="card">
        <div className="toolbar">
          <input className="input search-input" placeholder="Cari customer / PO / barang…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="spacer" />
          <span className="muted small">Total: <b className="mono" style={{ color: 'var(--ink)' }}>{fmtNum(total)}</b> pcs</span>
          <button className="btn btn-ghost btn-sm" style={{ background: '#f2f4f3' }} onClick={() => downloadCsv(`stok-${location}-${todayStr()}.csv`, [['Customer', 'No PO', 'Kode', 'Deskripsi', 'Stok'], ...rows.map((r) => [r.customer_name, r.po_number, r.product_code, r.description, r.stock])])}><Download size={15} /> CSV</button>
        </div>
        {loading ? <Loading /> : !rows.length ? <Empty icon={isProd ? Factory : Truck} text={isProd ? 'Belum ada barang jadi di produksi' : 'Tidak ada barang di delivery'} /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Milik Customer</th><th>No. PO</th><th>Barang</th><th>Deskripsi</th><th className="num">Stok</th><th>Update</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.po_item_id}>
                    <td><b>{r.customer_name}</b><div className="small muted">{r.customer_address}</div></td>
                    <td><Link to={`/po/${r.po_id}`} style={{ color: 'var(--green-700)', fontWeight: 600 }}>{r.po_number}</Link></td>
                    <td>{r.product_code}</td>
                    <td>{r.description}</td>
                    <td className="num strong" style={{ fontSize: 15 }}>{fmtNum(r.stock)} <span className="muted small">pcs</span></td>
                    <td className="small muted">{fmtDateTime(r.last_update)}</td>
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

export function Ledger() {
  const { user } = useAuth();
  const [loc, setLoc] = useState(user.role === 'warehouse' ? 'warehouse' : '');
  const [ref, setRef] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, loading } = useApi(`/stock/ledger?location=${loc}&ref_type=${ref}&from=${from}&to=${to}`);
  return (
    <div>
      <PageHead title="Riwayat Stok" sub="Semua pergerakan barang tercatat otomatis: masuk, keluar, BAST, dan DO." />
      <div className="card">
        <div className="tabs">
          {[['', 'Semua Lokasi'], ['warehouse', 'Gudang'], ['production', 'Produksi'], ['delivery', 'Delivery'], ['delivered', 'Terkirim']].map(([k, l]) => <button key={k} className={`tab ${loc === k ? 'on' : ''}`} onClick={() => setLoc(k)}>{l}</button>)}
        </div>
        <div className="toolbar">
          <select className="input input-sm" style={{ width: 180 }} value={ref} onChange={(e) => setRef(e.target.value)}>
            <option value="">Semua transaksi</option>
            {Object.entries(REF_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input className="input input-sm" type="date" style={{ width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">s/d</span>
          <input className="input input-sm" type="date" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="spacer" />
          <button className="btn btn-ghost btn-sm" style={{ background: '#f2f4f3' }} disabled={!data} onClick={() => downloadCsv(`riwayat-stok-${todayStr()}.csv`, [['Tanggal', 'Lokasi', 'Transaksi', 'Ref', 'Kode', 'Qty', 'Pihak', 'Keterangan', 'Oleh'], ...data.map((r) => [r.trx_date, LOC_LABEL[r.location], REF_LABEL[r.ref_type], r.ref_number || r.reference, r.product_code, r.qty, r.party, r.note, r.user_name])])}><Download size={15} /> CSV</button>
        </div>
        {loading ? <Loading /> : !data.length ? <Empty icon={History} text="Belum ada riwayat" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Tanggal</th><th>Lokasi</th><th>Transaksi</th><th>Barang</th><th className="num">Qty</th><th>Pihak / PO</th><th>Keterangan</th><th>Oleh</th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{fmtDate(r.trx_date, true)}</td>
                    <td><span className="badge b-gray">{LOC_LABEL[r.location]}</span></td>
                    <td>{r.ref_type === 'BAST' ? <Link to={`/bast/${r.ref_id}`} style={{ color: 'var(--green-700)', fontWeight: 600 }}>{r.ref_number}</Link> : r.ref_type === 'DO' ? <Link to={`/do/${r.ref_id}`} style={{ color: 'var(--green-700)', fontWeight: 600 }}>{r.ref_number}</Link> : <>{REF_LABEL[r.ref_type]}{r.reference && <div className="small muted">{r.reference}</div>}</>}</td>
                    <td className="strong">{r.product_code}</td>
                    <td className={`num ${r.qty > 0 ? 'pos' : 'neg'}`}>{r.qty > 0 ? '+' : ''}{fmtNum(r.qty)}</td>
                    <td>{r.po_number ? <><b>{r.customer_name}</b><div className="small muted">{r.po_number}</div></> : r.party || '-'}</td>
                    <td className="small">{r.note || '-'}</td>
                    <td className="small muted">{r.user_name}</td>
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
