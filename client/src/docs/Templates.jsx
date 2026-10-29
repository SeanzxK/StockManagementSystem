import { Plus, Trash2, Link2 } from 'lucide-react';
import { fmtDate, terbilang } from '../lib';
import { Letterhead, LOGO_SRC } from './Doc';

const nf = (n) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

/** Baris yang ditandai "gabung" ikut ke nomor di atasnya (seperti Sekat Coak 4-1 & 1-4 dalam satu harga) */
export function groupItems(items = []) {
  const groups = [];
  items.forEach((it, i) => {
    if (it.merge && i > 0 && groups.length) groups[groups.length - 1].push(it);
    else groups.push([it]);
  });
  return groups;
}
export const itemsTotal = (items = []) => items.filter((it, i) => !(it.merge && i > 0)).reduce((a, it) => a + (Number(it.total) || 0), 0);

const custLine = (doc) => (doc.attn ? `${doc.customer_name} - Up. ${doc.attn}` : doc.customer_name);
const bankLine = (b = {}) => [b.bank, b.account ? `AC . ${b.account}` : ''].filter(Boolean).join(' : ');

/* ======================= SURAT JALAN / DELIVERY ORDER ======================= */
export function SuratJalanDoc({ doc, s }) {
  const groups = groupItems(doc.items);
  const showPrice = doc.show_price !== false;
  const total = itemsTotal(doc.items);
  return (
    <div className="tpl">
      <div className="tpl-top">
        <Letterhead s={s} />
        <table className="tpl-meta">
          <tbody>
            <tr><td>Pengantar</td><td>:</td><td><b>{doc.driver}</b>{doc.vehicle_no ? ` (${doc.vehicle_no})` : ''}</td></tr>
            <tr><td>No. Order</td><td>:</td><td><b>{doc.number}</b></td></tr>
            <tr><td>{doc.city}</td><td>,</td><td>{fmtDate(doc.date)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="tpl-to">
        <div>Kepada :</div>
        <b>{custLine(doc)}</b>
        <div>{doc.address}</div>
      </div>
      <h2 className="tpl-title sj">SURAT JALAN</h2>
      <table className="tpl-table">
        <thead>
          <tr><th style={{ width: 28 }}>No</th><th>Nama Box</th><th>Size</th><th>Spec</th><th>Qty</th>{showPrice && <><th>Harga/pcs</th><th>Total</th></>}</tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => g.map((it, ri) => (
            <tr key={`${gi}-${ri}`}>
              {ri === 0 && <td className="c" rowSpan={g.length}>{gi + 1}</td>}
              <td>{it.name}</td>
              <td className="c">{it.size}</td>
              <td className="c">{it.spec}</td>
              <td className="c">{nf(it.qty)}</td>
              {showPrice && ri === 0 && <td className="r" rowSpan={g.length}>{nf(it.price)}</td>}
              {showPrice && ri === 0 && <td className="r" rowSpan={g.length}>{nf(it.total)}</td>}
            </tr>
          )))}
          {showPrice && (
            <tr className="tpl-total"><td colSpan={5} className="noline" /><td className="r"><b>TOTAL</b></td><td className="r dbl"><b>{nf(total)}</b></td></tr>
          )}
        </tbody>
      </table>
      {doc.notes && <p className="tpl-note-plain">Catatan: {doc.notes}</p>}
      <div className="tpl-pay">
        <div>Pembayaran : ({doc.payment || 'Transfer'})</div>
        {doc.bank && (doc.bank.holder || doc.bank.account) && (
          <div>Transfer : &nbsp; <b>{doc.bank.holder}</b> ( {bankLine(doc.bank)} )</div>
        )}
      </div>
      <div className="tpl-sigs">
        <div className="sig">
          <div>Penerima</div>
          <div className="sig-line">( ................................ )</div>
          <i>Lembar 1 : Admin</i>
        </div>
        <div className="sig">
          <div>Pengantar</div>
          <div className="sig-line">( {doc.driver || '................................'} )</div>
          <i>Lembar 2 : Gudang</i>
        </div>
        <div className="sig">
          <table className="sig-box">
            <thead><tr><th>Gudang</th><th>Admin</th></tr></thead>
            <tbody>
              <tr className="sig-space"><td /><td /></tr>
              <tr><td>( {doc.sign_gudang || '..............'} )</td><td>( {doc.sign_admin || '..............'} )</td></tr>
            </tbody>
          </table>
          <i>Lembar 3 : Pelanggan</i>
        </div>
      </div>
    </div>
  );
}

/* ================================ INVOICE ================================ */
export function InvoiceDoc({ doc, s }) {
  const groups = groupItems(doc.items);
  const subtotal = itemsTotal(doc.items);
  const rate = Number(doc.tax_rate) || 0;
  const tax = Math.round(subtotal * rate / 100);
  const total = subtotal + tax;
  return (
    <div className="tpl">
      <div className="tpl-top">
        <Letterhead s={s} />
        <div className="tpl-place"><b>{doc.city},</b> &nbsp; <b>{fmtDate(doc.date)}</b></div>
      </div>
      <div className="tpl-to">
        <div><b>Kepada :</b></div>
        <b>{custLine(doc)}</b>
        <div><b>{doc.address}</b></div>
      </div>
      <h2 className="tpl-title inv">I N V O I C E</h2>
      <div className="tpl-number">{doc.number}</div>
      <table className="tpl-table inv">
        <thead>
          <tr><th style={{ width: 28 }}>No</th><th>No.PO / No.SJ</th><th>Nama Barang</th><th>Ukuran</th><th>Spec</th><th>Qty</th><th>Harga/Pcs</th><th>Total</th></tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => g.map((it, ri) => (
            <tr key={`${gi}-${ri}`}>
              {ri === 0 && <td className="c" rowSpan={g.length}>{gi + 1}</td>}
              {ri === 0 && <td className="c" rowSpan={g.length}>{it.ref}</td>}
              <td className="c">{it.name}</td>
              <td className="c">{it.size}</td>
              <td className="c">{it.spec}</td>
              <td className="c">{nf(it.qty)}</td>
              {ri === 0 && <td className="r" rowSpan={g.length}>{nf(it.price)}</td>}
              {ri === 0 && <td className="r" rowSpan={g.length}>{nf(it.total)}</td>}
            </tr>
          )))}
        </tbody>
      </table>
      <div className="tpl-sum">
        <div className="tpl-terb-label">Terbilang :</div>
        <table>
          <tbody>
            {rate > 0 && <tr><td>Subtotal</td><td className="r">{nf(subtotal)}</td></tr>}
            {rate > 0 && <tr><td>PPN {rate}%</td><td className="r">{nf(tax)}</td></tr>}
            <tr className="grand"><td><b>Total</b></td><td className="r hl"><b>{nf(total)}</b></td></tr>
          </tbody>
        </table>
      </div>
      <div className="tpl-terbilang">{terbilang(total).toUpperCase()}</div>
      <div className="tpl-bottom">
        <div className="tpl-bottom-left">
          <div className="tpl-pay-title">Pembayaran - Transfer</div>
          <div className="tpl-bank">{bankLine(doc.bank)}{doc.bank?.holder ? ` An. ${doc.bank.holder}` : ''}</div>
          {doc.due_date && <div className="tpl-due">Jatuh tempo: <b>{fmtDate(doc.due_date)}</b></div>}
          {doc.note && <div className="tpl-note"><b>Note :</b><i>{doc.note}</i></div>}
        </div>
        <div className="tpl-sign">
          <div>Salam,</div>
          <img src={LOGO_SRC} alt="" />
          <div className="tpl-sign-name">( {doc.signer || '....................'} )</div>
        </div>
      </div>
    </div>
  );
}

export function LampiranSJ({ fileId, mime, number }) {
  return (
    <div className="tpl">
      <div className="tpl-lampiran-title">Lampiran : Surat Jalan {number ? `(${number})` : ''}</div>
      {fileId && mime && mime.startsWith('image/')
        ? <img className="tpl-lampiran-img" src={`/api/files/${fileId}`} alt="Surat Jalan bertanda tangan" />
        : <p className="tpl-note-plain">{fileId ? 'Scan Surat Jalan berupa PDF — dilampirkan terpisah.' : 'Scan Surat Jalan bertanda tangan belum tersedia.'}</p>}
    </div>
  );
}

/* ====================== Editor baris barang (manual) ====================== */
export function ItemsEditor({ items, onChange, withRef, defaultRef }) {
  const set = (i, patch) => onChange(items.map((it, j) => {
    if (j !== i) return it;
    const n = { ...it, ...patch };
    if (('qty' in patch || 'price' in patch) && !n.total_manual) n.total = (Number(n.price) || 0) * (Number(n.qty) || 0);
    if ('total' in patch) n.total_manual = true;
    return n;
  }));
  const add = (merge) => onChange([...items, { ref: merge ? '' : defaultRef || '', name: '', size: '', spec: '', qty: '', price: '', total: '', merge }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  return (
    <div>
      <div className="table-wrap">
        <table className="tbl items-edit">
          <thead>
            <tr>
              <th title="Gabung ke nomor di atasnya">Gabung</th>
              {withRef && <th style={{ minWidth: 150 }}>No.PO / No.SJ</th>}
              <th style={{ minWidth: 190 }}>Nama Barang</th><th style={{ width: 110 }}>Ukuran</th><th style={{ width: 70 }}>Spec</th>
              <th style={{ width: 95 }}>Qty</th><th style={{ width: 120 }}>Harga/pcs</th><th style={{ width: 140 }}>Total</th><th />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const merged = it.merge && i > 0;
              return (
                <tr key={i} className={merged ? 'merged' : ''}>
                  <td className="c">{i > 0 ? <input type="checkbox" checked={Boolean(it.merge)} onChange={(e) => set(i, { merge: e.target.checked })} title="Gabung ke nomor di atasnya" /> : <span className="muted small">—</span>}</td>
                  {withRef && <td>{merged ? <span className="muted small"><Link2 size={12} /> ikut atas</span> : <input className="input input-sm" value={it.ref || ''} onChange={(e) => set(i, { ref: e.target.value })} />}</td>}
                  <td><input className="input input-sm" value={it.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="mis. Layer Single Wall" /></td>
                  <td><input className="input input-sm" value={it.size} onChange={(e) => set(i, { size: e.target.value })} placeholder="280 x 105" /></td>
                  <td><input className="input input-sm" value={it.spec} onChange={(e) => set(i, { spec: e.target.value })} placeholder="SW" /></td>
                  <td><input className="input input-sm" type="number" min="0" value={it.qty} onChange={(e) => set(i, { qty: e.target.value })} /></td>
                  <td>{merged ? <span className="muted small">ikut atas</span> : <input className="input input-sm" type="number" min="0" value={it.price} onChange={(e) => set(i, { price: e.target.value })} />}</td>
                  <td>{merged ? <span className="muted small">ikut atas</span> : <input className="input input-sm" type="number" min="0" value={it.total} onChange={(e) => set(i, { total: e.target.value })} />}</td>
                  <td>{items.length > 1 && <button type="button" className="btn btn-danger btn-xs" onClick={() => remove(i)}><Trash2 size={14} /></button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => add(false)}><Plus size={15} /> Tambah Barang</button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ background: '#f2f4f3' }} onClick={() => add(true)}><Link2 size={15} /> Tambah Baris Gabungan</button>
        <span className="small muted">Total otomatis = Harga × Qty (bisa diubah manual). Baris "Gabung" berbagi nomor, harga & total dengan baris di atasnya.</span>
      </div>
    </div>
  );
}

/** Pilihan rekening bank dari Pengaturan + isian manual */
export function BankFields({ bank, onChange, accounts = [] }) {
  const b = bank || {};
  return (
    <div className="form-grid">
      {accounts.length > 0 && (
        <div className="field full">
          <label>Pilih rekening tersimpan</label>
          <select className="input" value="" onChange={(e) => { const a = accounts[Number(e.target.value)]; if (a) onChange({ ...a }); }}>
            <option value="">— pilih untuk mengisi otomatis —</option>
            {accounts.map((a, i) => <option key={i} value={i}>{a.bank} : {a.account} a.n. {a.holder}</option>)}
          </select>
        </div>
      )}
      <div className="field"><label>Nama Bank</label><input className="input" value={b.bank || ''} onChange={(e) => onChange({ ...b, bank: e.target.value })} placeholder="Bank Mandiri" /></div>
      <div className="field"><label>No. Rekening</label><input className="input" value={b.account || ''} onChange={(e) => onChange({ ...b, account: e.target.value })} /></div>
      <div className="field full"><label>Atas Nama</label><input className="input" value={b.holder || ''} onChange={(e) => onChange({ ...b, holder: e.target.value })} /></div>
    </div>
  );
}
