import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function useAsync(fn, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    set((s) => ({ ...s, loading: true, error: null }));
    return fn().then((data) => set({ data, error: null, loading: false }), (e) => set({ data: null, error: e.message, loading: false }));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export const label = (s) => String(s || '').replace(/_/g, ' ');
export const fdate = (s) => (s ? String(s).slice(0, 10) : '');
const STATUS = {
  PENDING_ANALYSIS: ['pending', 'Awaiting analysis'], AI_ANALYZED: ['analyzed', 'Ready for review'],
  IN_REVIEW: ['review', 'Draft in progress'], FINALIZED: ['final', 'Signed off'],
};
export function Status({ value }) { const [c, t] = STATUS[value] || ['pending', value]; return <span className={`pill ${c}`}>{t}</span>; }

export function Loading({ what = 'Loading' }) { return <p className="muted" role="status" style={{ padding: 16 }}>{what}…</p>; }
export function ErrorBox({ error }) { return error ? <p className="err" role="alert">{error}</p> : null; }
export function Empty({ title, children }) { return <div className="empty"><b>{title}</b>{children}</div>; }

export function SecureImage({ path, alt, ...rest }) {
  const [src, setSrc] = useState(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url, dead = false;
    setSrc(null); setFailed(false);
    api.blobUrl(path).then((u) => { url = u; if (!dead) setSrc(u); }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [path]);
  if (failed) return <div className="small" style={{ padding: 24, color: '#aab5c3', textAlign: 'center', maxWidth: 360 }}>This radiograph file is not on the server. Re-upload the image, or copy it into outputs/uploads.</div>;
  return src ? <img src={src} alt={alt} {...rest} /> : <div className="faint small" style={{ padding: 20 }}>Loading image…</div>;
}

/** Findings ladder. Bar = model score. Amber tick = that finding's reporting threshold. */
export function Ladder({ scores, selected, onSelect }) {
  return (
    <div>
      <div className="ladder" role="list">
        {scores.map((f) => (
          <button key={f.disease} role="listitem" className={`rung ${f.exceeds_threshold ? 'hit' : ''}`}
            aria-pressed={selected === f.disease} onClick={() => onSelect?.(f.disease)} disabled={!onSelect} style={!onSelect ? { cursor: 'default' } : null}
            title={`${label(f.disease)}: ${f.score_pct}% (threshold ${f.threshold_pct}%)`}>
            <span className="nm">{label(f.disease)}</span>
            <span className="track"><span className="fill" style={{ width: `${Math.min(f.score_pct, 100)}%` }} /><span className="tick" style={{ left: `${f.threshold_pct}%` }} /></span>
            <span className="pc">{f.score_pct.toFixed(1)}%</span>
          </button>
        ))}
      </div>
      <div className="legend">
        <span><i style={{ width: 14, height: 8, background: 'var(--ink)' }} />Above threshold</span>
        <span><i style={{ width: 14, height: 8, background: '#aab4c3' }} />Below threshold</span>
        <span><i style={{ width: 2, height: 12, background: 'var(--amber)' }} />Reporting threshold</span>
      </div>
    </div>
  );
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  const t = useRef();
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(() => setV(value), ms); return () => clearTimeout(t.current); }, [value, ms]);
  return v;
}

/** Tiny safe markdown: **bold**, _italic_, `code`, "- " bullets. No HTML is ever injected. */
export function Md({ text }) {
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') ? <b key={`${k}${i}`}>{p.slice(2, -2)}</b> : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <i key={`${k}${i}`}>{p.slice(1, -1)}</i> : p.startsWith('`') ? <code key={`${k}${i}`}>{p.slice(1, -1)}</code> : p);
  return <div>{String(text).split('\n').map((l, i) => (l.startsWith('- ') ? <div key={i} style={{ paddingLeft: 14 }}>• {inline(l.slice(2), i)}</div> : <div key={i} style={{ minHeight: l ? 0 : 8 }}>{inline(l, i)}</div>))}</div>;
}
