import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FileUp, Inbox, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Badge({ map, value }) {
  const [label, cls] = map[value] || [value, 'b-gray'];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function PageHead({ title, sub, children, back }) {
  return (
    <div className="page-head">
      <div>
        {back && <Link to={back.to} className="back">← {back.label}</Link>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function StatCard({ title, value, unit, foot, feature, to, tag }) {
  const body = (
    <div className={`card stat ${feature ? 'feature' : ''}`}>
      <h4>{title}</h4>
      <span className="arrow"><ArrowUpRight size={18} /></span>
      <div className="val">{value}{unit && <small>{unit}</small>}</div>
      {foot && <div className="foot">{tag !== undefined && <span className="mini-tag">{tag}</span>}{foot}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function Modal({ title, sub, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div><h3>{title}</h3>{sub && <p className="sub">{sub}</p>}</div>
          <button className="icon-btn" style={{ width: 36, height: 36, background: '#f2f4f3' }} onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        </div>
        {!sub && <div style={{ height: 14 }} />}
        {children}
      </div>
    </div>
  );
}

export function Empty({ text = 'Belum ada data', icon: Icon = Inbox, children }) {
  return <div className="empty"><Icon size={40} /><div>{text}</div>{children}</div>;
}

export function Loading() { return <div className="loading">Memuat data…</div>; }

export function Field({ label, hint, children, full }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function FileDrop({ file, onChange, label = 'Upload scan dokumen' }) {
  const ref = useRef();
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onClick={() => ref.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) onChange(e.dataTransfer.files[0]); }}
    >
      <FileUp size={26} />
      <strong>{file ? file.name : label}</strong>
      <span className="small">{file ? `${(file.size / 1024).toFixed(0)} KB — klik untuk ganti` : 'Klik / seret file ke sini, atau ambil foto. JPG, PNG, PDF maks 10 MB'}</span>
      <input ref={ref} type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files[0] && onChange(e.target.files[0])} />
    </div>
  );
}

export function Progress({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="progress" style={{ flex: 1 }}><div style={{ width: pct + '%' }} /></div>
      <span className="small muted mono">{pct}%</span>
    </div>
  );
}

export function ScanPreview({ fileId, mime, name }) {
  const src = `/api/files/${fileId}`;
  return (
    <div>
      <div className="scan-preview">
        {mime === 'application/pdf' ? <iframe src={src} title={name} /> : <img src={src} alt={name} />}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <a className="btn btn-ghost btn-sm" href={src} target="_blank" rel="noreferrer">Buka</a>
        <a className="btn btn-outline btn-sm" href={`${src}?download=1`}>Simpan ke perangkat</a>
        <ShareFileButton fileId={fileId} name={name} mime={mime} />
      </div>
    </div>
  );
}

export function ShareFileButton({ fileId, name, mime }) {
  const share = async () => {
    try {
      const blob = await fetch(`/api/files/${fileId}`, { credentials: 'include' }).then((r) => r.blob());
      const file = new File([blob], name || 'dokumen', { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return;
      }
    } catch (e) { if (e.name === 'AbortError') return; }
    window.open(`mailto:?subject=${encodeURIComponent(name || 'Dokumen')}&body=${encodeURIComponent('Dokumen terlampir: ' + window.location.origin + '/api/files/' + fileId)}`);
  };
  return <button className="btn btn-ghost btn-sm" onClick={share}>Bagikan</button>;
}
