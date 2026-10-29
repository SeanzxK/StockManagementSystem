import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, ClipboardCheck, Truck } from 'lucide-react';
import { api, useApi, useAuth, useToast, fmtNum, fmtDate, todayStr, DO_STATUS, BAST_TYPE } from '../lib';
import { Badge, Empty, Field, Loading, PageHead } from '../components/ui';
import { DocActions, DocHeader, Paper, Signatures, usePaperRef, useSettings } from '../docs/Doc';

const TYPE = BAST_TYPE;

export function BastList() {
  const { user } = useAuth();
  const [type, setType] = useState(user.role === 'production' ? 'WH_PROD' : '');
  const { data, loading } = useApi(`/bast?type=${type}`);
  const nav = useNavigate();
  return (
    <div>
      <PageHead title="Berita Acara Serah Terima" sub="Setiap perpindahan barang antar bagian wajib dengan BAST — stok otomatis berpindah.">
        {['production', 'admin'].includes(user.role) && <Link to="/bast/baru?type=WH_PROD" className="btn btn-primary"><Plus size={18} /> BAST Gudang → Produksi</Link>}
        {['delivery', 'admin', 'production'].includes(user.role) && <Link to="/bast/baru?type=PROD_DEL" className={`btn ${user.role === 'delivery' ? 'btn-primary' : 'btn-outline'}`}><Plus size={18} /> BAST Produksi → Delivery</Link>}
        {['delivery', 'warehouse', 'admin'].includes(user.role) && <Link to="/bast/baru?type=WH_DEL" className="btn btn-outline"><Plus size={18} /> BAST Gudang → Delivery (Box)</Link>}
      </PageHead>
      <div className="card">
        <div className="tabs">
          {[['', 'Semua'], ['WH_PROD', 'Gudang → Produksi'], ['PROD_DEL', 'Produksi → Delivery'], ['WH_DEL', 'Gudang → Delivery (Box)']].map(([k, l]) => <button key={k} className={`tab ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>{l}</button>)}
        </div>
        {loading ? <Loading /> : !data.length ? <Empty icon={ClipboardCheck} text="Belum ada BAST" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>No. BAST</th><th>Jenis</th><th>Customer / PO</th><th>Tanggal</th><th className="num">Qty</th><th>Diserahkan → Diterima</th><th>DO</th></tr></thead>
              <tbody>
                {data.map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => nav(`/bast/${b.id}`)}>
                    <td className="strong">{b.number}</td>
                    <td><span className={`badge ${TYPE[b.type].badge}`}>{TYPE[b.type].label}</span></td>
                    <td>{b.customer_name}<div className="small muted">{b.po_number}</div></td>
                    <td>{fmtDate(b.bast_date, true)}</td>
                    <td className="num strong">{fmtNum(b.total_qty)}</td>
                    <td className="small">{b.giver_name} → {b.receiver_name}</td>
                    <td>{b.type !== 'WH_PROD' ? (b.do_id ? <span className="badge b-green">Sudah DO</span> : <span className="badge b-gray">Belum DO</span>) : <span className="muted">-</span>}</td>
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

export function BastForm() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const type = ['PROD_DEL', 'WH_DEL'].includes(params.get('type')) ? params.get('type') : 'WH_PROD';
  const fromWarehouse = type === 'WH_PROD' || type === 'WH_DEL';
  const nav = useNavigate();
  const toast = useToast();
  const { data: pos } = useApi('/po');
  const [poId, setPoId] = useState(params.get('po') || '');
  const [po, setPo] = useState(null);
  const [qty, setQty] = useState({});
  const [f, setF] = useState({
    bast_date: todayStr(),
    receiver_name: (type === 'WH_PROD' && user.role === 'production') || (type !== 'WH_PROD' && user.role === 'delivery') ? user.name : '',
    giver_name: type === 'WH_DEL' && user.role === 'warehouse' ? user.name : '',
    notes: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [stock, setStock] = useState({});

  useEffect(() => {
    if (fromWarehouse) api('/stock/warehouse').then((list) => setStock(Object.fromEntries(list.map((p) => [p.id, p.stock]))));
  }, [type]);
  useEffect(() => {
    setPo(null); setQty({});
    if (poId) api(`/po/${poId}`).then(setPo).catch((e) => setErr(e.message));
  }, [poId]);

  const maxFor = (it) => fromWarehouse ? Math.max(0, Math.min(it.qty - it.qty_produced, stock[it.product_id] ?? 0)) : it.stock_production;
  const eligible = (pos || []).filter((p) => p.status !== 'batal' && (fromWarehouse ? p.produced_qty < p.total_qty : ['produksi', 'siap_kirim', 'pengiriman'].includes(p.status)));

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const items = Object.entries(qty).map(([po_item_id, q]) => ({ po_item_id: Number(po_item_id), qty: Number(q) })).filter((i) => i.qty > 0);
      const r = await api('/bast', { method: 'POST', body: { type, po_id: Number(poId), ...f, items } });
      toast('BAST dibuat — stok sudah diperbarui');
      nav(`/bast/${r.id}`);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  const t = TYPE[type];
  return (
    <form onSubmit={submit}>
      <PageHead title={`BAST ${t.label}`} sub={{ WH_PROD: 'Serah terima bahan SHEET dari gudang ke produksi. Stok gudang berkurang dan barang jadi bertambah di produksi atas nama PO customer.', PROD_DEL: 'Serah terima barang jadi dari produksi ke delivery untuk dikirim ke customer.', WH_DEL: 'Serah terima BOX langsung dari gudang ke delivery. Stok gudang berkurang dan stok delivery bertambah atas nama PO customer.' }[type]} back={{ to: '/bast', label: 'BAST' }} />
      {err && <div className="err">{err}</div>}
      <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>Data Serah Terima</h3></div>
          <div className="form-grid">
            <Field label="Purchase Order *" full>
              <select className="input" value={poId} onChange={(e) => setPoId(e.target.value)} required>
                <option value="">— pilih PO —</option>
                {eligible.map((p) => <option key={p.id} value={p.id}>{p.po_number} — {p.customer_name}</option>)}
              </select>
            </Field>
            <Field label="Tanggal"><input className="input" type="date" value={f.bast_date} onChange={(e) => setF({ ...f, bast_date: e.target.value })} /></Field>
            <div />
            <Field label={`Yang Menyerahkan (${t.from}) *`}><input className="input" value={f.giver_name} onChange={(e) => setF({ ...f, giver_name: e.target.value })} required placeholder="Nama petugas" /></Field>
            <Field label={`Yang Menerima (${t.to}) *`}><input className="input" value={f.receiver_name} onChange={(e) => setF({ ...f, receiver_name: e.target.value })} required /></Field>
            <Field label="Catatan" full><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Customer Tujuan</h3></div>
          {po ? (
            <dl className="kv">
              <dt>Customer</dt><dd>{po.customer_name}</dd>
              <dt>Alamat</dt><dd>{po.customer_address || '-'}</dd>
              <dt>No. PO</dt><dd>{po.po_number}</dd>
              <dt>Target kirim</dt><dd>{fmtDate(po.due_date)}</dd>
            </dl>
          ) : <Empty text="Pilih PO terlebih dahulu" />}
        </div>
      </div>

      {po && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head"><h3>Barang yang Diserahterimakan</h3></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Barang</th><th>Deskripsi</th><th className="num">Pesanan</th>{fromWarehouse ? <><th className="num">Sudah keluar gudang</th><th className="num">Stok gudang</th></> : <th className="num">Stok di produksi</th>}<th style={{ width: 180 }}>Jumlah diserahkan</th></tr></thead>
              <tbody>
                {po.items.filter((it) => (type === 'WH_PROD' ? it.category !== 'box' : type === 'WH_DEL' ? it.category === 'box' : true)).map((it) => {
                  const max = maxFor(it);
                  return (
                    <tr key={it.id}>
                      <td className="strong">{it.product_code}<div className="small muted">{it.substance}</div></td>
                      <td>{it.description}</td>
                      <td className="num">{fmtNum(it.qty)}</td>
                      {fromWarehouse ? <><td className="num">{fmtNum(it.qty_produced)}</td><td className="num">{fmtNum(stock[it.product_id] ?? 0)}</td></> : <td className="num">{fmtNum(it.stock_production)}</td>}
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input className="input input-sm" type="number" min="0" max={max} value={qty[it.id] ?? ''} onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })} disabled={max <= 0} placeholder={max <= 0 ? 'tidak ada' : `maks ${max}`} />
                          {max > 0 && <button type="button" className="btn btn-ghost btn-xs" style={{ background: '#f2f4f3' }} onClick={() => setQty({ ...qty, [it.id]: max })}>Maks</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => nav(-1)}>Batal</button>
        <button className="btn btn-primary" disabled={busy || !po}>{busy ? 'Menyimpan…' : 'Simpan BAST'}</button>
      </div>
    </form>
  );
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function BastDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: b, loading } = useApi(`/bast/${id}`);
  const s = useSettings();
  const paperRef = usePaperRef();
  if (loading || !b) return <Loading />;
  const t = TYPE[b.type];
  const total = b.items.reduce((a, i) => a + i.qty, 0);
  const day = HARI[new Date(b.bast_date + 'T00:00:00').getDay()];
  return (
    <div>
      <PageHead title={b.number} sub={`BAST ${t.label} · PO ${b.po_number} (${b.customer_name})`} back={{ to: '/bast', label: 'BAST' }}>
        <Link to={`/po/${b.po_id}`} className="btn btn-outline">Lihat PO</Link>
        {b.type !== 'WH_PROD' && !b.do && ['delivery', 'admin'].includes(user.role) && <Link to={`/do/baru?bast=${b.id}`} className="btn btn-primary"><Truck size={18} /> Buat Delivery Order</Link>}
        {b.do && <Link to={`/do/${b.do.id}`} className="btn btn-ghost">{b.do.number} <Badge map={DO_STATUS} value={b.do.status} /></Link>}
      </PageHead>
      <DocActions paperRef={paperRef} filename={b.number} title={`BAST ${b.number} — ${b.customer_name}`} />
      <Paper paperRef={paperRef}>
        <DocHeader s={s} title="BERITA ACARA SERAH TERIMA" number={b.number} date={fmtDate(b.bast_date)} />
        <p className="note" style={{ fontSize: 12 }}>
          Pada hari ini <b>{day}</b>, tanggal <b>{fmtDate(b.bast_date)}</b>, telah dilakukan serah terima barang dari <b>Bagian {t.from}</b> kepada <b>Bagian {t.to}</b>
          {b.type === 'WH_PROD' ? ' untuk diproduksi menjadi barang jadi' : ' untuk dikirimkan kepada customer'} sesuai Purchase Order berikut:
        </p>
        <div className="meta">
          <div className="box"><div className="h">Purchase Order</div><b>{b.po_number}</b><div>Milik customer: <b>{b.customer_name}</b></div></div>
          <div className="box"><div className="h">Tujuan Pengiriman</div><div>{b.customer_address || '-'}</div><div>{b.customer_phone}</div></div>
        </div>
        <table>
          <thead><tr><th className="c" style={{ width: 30 }}>No</th><th>Kode</th><th>Jenis Barang</th><th>Deskripsi</th><th className="r">Jumlah</th></tr></thead>
          <tbody>
            {b.items.map((i, n) => <tr key={i.id}><td className="c">{n + 1}</td><td>{i.product_code}</td><td>{i.product_name}</td><td>{i.description}</td><td className="r">{fmtNum(i.qty)} {b.type === 'PROD_DEL' ? 'pcs' : i.unit}</td></tr>)}
            <tr><td colSpan={4} className="r"><b>Total</b></td><td className="r"><b>{fmtNum(total)}</b></td></tr>
          </tbody>
        </table>
        {b.notes && <p className="note"><b>Catatan:</b> {b.notes}</p>}
        <p className="note">Barang tersebut di atas telah diserahterimakan dalam keadaan baik dan jumlah sesuai. Berita acara ini dibuat untuk dipergunakan sebagaimana mestinya.</p>
        <Signatures items={[[`Yang Menyerahkan (${t.from})`, b.giver_name], [`Yang Menerima (${t.to})`, b.receiver_name], ['Mengetahui (Admin)', '']]} />
        <p className="note" style={{ marginTop: 24, fontSize: 10, color: '#888' }}>Dibuat di sistem oleh {b.created_by_name} · {b.created_at}</p>
      </Paper>
    </div>
  );
}
