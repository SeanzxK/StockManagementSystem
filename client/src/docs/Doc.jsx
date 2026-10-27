import { useRef, useState } from 'react';
import { Printer, Download, Share2, MessageCircle, Mail } from 'lucide-react';
import { Boxes } from 'lucide-react';
import { useApi, useToast } from '../lib';

export function useSettings() {
  return useApi('/settings').data || {};
}

async function makePdf(el, filename) {
  const html2pdf = (await import('html2pdf.js')).default;
  const opt = {
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  };
  return html2pdf().set(opt).from(el).outputPdf('blob');
}

/** Toolbar cetak / simpan PDF / bagikan untuk dokumen */
export function DocActions({ paperRef, filename, title, extra }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const fname = filename.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf';

  const download = async () => {
    setBusy(true);
    try {
      const blob = await makePdf(paperRef.current, fname);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = fname; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('PDF tersimpan di perangkat');
    } catch (e) { toast('Gagal membuat PDF: ' + e.message, 'error'); } finally { setBusy(false); }
  };

  const share = async () => {
    setBusy(true);
    try {
      const blob = await makePdf(paperRef.current, fname);
      const file = new File([blob], fname, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text: title });
      } else {
        setMenu(true);
      }
    } catch (e) { if (e.name !== 'AbortError') setMenu(true); } finally { setBusy(false); }
  };

  const text = `${title}\n${window.location.href}`;
  return (
    <div className="doc-toolbar no-print" style={{ position: 'relative' }}>
      <button className="btn btn-primary" onClick={() => window.print()}><Printer size={18} /> Cetak</button>
      <button className="btn btn-outline" onClick={download} disabled={busy}><Download size={18} /> {busy ? 'Menyiapkan…' : 'Simpan PDF'}</button>
      <button className="btn btn-ghost" onClick={share} disabled={busy}><Share2 size={18} /> Bagikan</button>
      {extra}
      {menu && (
        <div className="dropdown" style={{ left: 0, right: 'auto', width: 300 }}>
          <div className="dh">Bagikan dokumen <button className="btn btn-xs btn-ghost" onClick={() => setMenu(false)}>Tutup</button></div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="small muted" style={{ margin: 0 }}>Perangkat ini tidak mendukung berbagi file langsung. Simpan PDF terlebih dulu lalu lampirkan, atau kirim tautan:</p>
            <a className="btn btn-ghost btn-sm" style={{ background: '#f2f4f3' }} target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}><MessageCircle size={16} /> WhatsApp</a>
            <a className="btn btn-ghost btn-sm" style={{ background: '#f2f4f3' }} href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`}><Mail size={16} /> Email</a>
            <button className="btn btn-ghost btn-sm" style={{ background: '#f2f4f3' }} onClick={() => { navigator.clipboard?.writeText(window.location.href); toast('Tautan disalin'); setMenu(false); }}>Salin tautan</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Paper({ paperRef, children }) {
  return <div className="paper-wrap"><div className="paper" ref={paperRef}>{children}</div></div>;
}

export function DocHeader({ s, title, number, date }) {
  return (
    <div className="dh">
      <div className="co">
        <div className="lg"><Boxes size={22} /></div>
        <div>
          <b>{s.company_name}</b>
          <span>{s.company_address}</span>
          <span>Telp {s.company_phone} · {s.company_email}</span>
        </div>
      </div>
      <div className="title">
        <h2>{title}</h2>
        <div>No: <b>{number}</b></div>
        {date && <div>Tanggal: {date}</div>}
      </div>
    </div>
  );
}

export function Signatures({ items }) {
  return (
    <div className="sigs" style={{ '--n': items.length }}>
      {items.map(([role, name], i) => (
        <div key={i}>
          <div>{role}</div>
          <div className="line">{name || '(.................................)'}</div>
        </div>
      ))}
    </div>
  );
}

export const usePaperRef = () => useRef(null);
