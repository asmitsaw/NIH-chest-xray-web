import { useEffect, useState } from 'react';
import { api } from '../api';
import { Empty, ErrorBox, Loading, SecureImage, fdate, label, useAsync } from '../ui';

export default function Compare() {
  const { data: patients, loading } = useAsync(() => api.patients(), []);
  const [pid, setPid] = useState(''); const [studies, setStudies] = useState([]);
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [res, setRes] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { setStudies([]); setA(''); setB(''); setRes(null); if (pid) api.studies(pid).then((r) => { const ok = r.filter((s) => s.prediction); setStudies(ok); if (ok.length >= 2) { setA(String(ok[1].id)); setB(String(ok[0].id)); } }).catch((e) => setErr(e.message)); }, [pid]);
  useEffect(() => { setRes(null); setErr(''); if (a && b && a !== b) api.compare(a, b).then(setRes).catch((e) => setErr(e.message)); }, [a, b]);
  if (loading) return <Loading />;
  const max = res ? Math.max(5, ...res.rows.map((r) => Math.abs(r.delta))) : 5;
  return (
    <>
      <div className="page-head"><div><h1>Compare studies</h1><p>See how model scores moved between two radiographs of the same patient. Score changes are not a clinical finding of progression or improvement.</p></div></div>
      <section className="panel" style={{ marginBottom: 18 }}><div className="bd form-grid">
        <label className="field"><span>Patient</span><select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Choose a patient</option>{patients?.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.mrn})</option>)}</select></label>
        <label className="field"><span>Earlier study</span><select value={a} onChange={(e) => setA(e.target.value)} disabled={!studies.length}><option value="">Choose</option>{studies.map((s) => <option key={s.id} value={s.id}>{fdate(s.study_date)} · {s.study_uid}</option>)}</select></label>
        <label className="field"><span>Later study</span><select value={b} onChange={(e) => setB(e.target.value)} disabled={!studies.length}><option value="">Choose</option>{studies.map((s) => <option key={s.id} value={s.id}>{fdate(s.study_date)} · {s.study_uid}</option>)}</select></label>
      </div></section>
      <ErrorBox error={err} />
      {pid && studies.length < 2 && <section className="panel"><Empty title="Need two analysed studies">This patient has {studies.length} analysed {studies.length === 1 ? 'study' : 'studies'}. Comparison needs at least two.</Empty></section>}
      {res && (<>
        {res.warning && <p className="warn" style={{ marginBottom: 14 }}>{res.warning}</p>}
        <div className="form-grid" style={{ marginBottom: 18 }}>
          {[['Earlier', res.previous], ['Later', res.current]].map(([t, s]) => <section className="panel" key={t}><div className="hd"><h3>{t}</h3><span className="muted small">{fdate(s.study_date)}</span></div><div style={{ background: 'var(--lightbox)', display: 'grid', placeItems: 'center', height: 320 }}><SecureImage path={`/studies/${s.id}/image`} alt={`${t} radiograph`} style={{ maxHeight: 320, maxWidth: '100%' }} /></div></section>)}
        </div>
        <section className="panel"><div className="hd"><h2>Change in model score</h2><span className="small faint right">Percentage points, later minus earlier</span></div>
          <div className="tablewrap"><table><thead><tr><th>Finding</th><th>Earlier</th><th>Later</th><th>Change</th><th></th></tr></thead>
            <tbody>{[...res.rows].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).map((r) => (
              <tr key={r.disease}><td><b>{label(r.disease)}</b></td><td>{r.previous.toFixed(1)}%</td><td>{r.current.toFixed(1)}%</td><td>{r.delta > 0 ? '+' : ''}{r.delta.toFixed(1)}</td>
                <td><div className="delta" aria-hidden="true"><div className="neg">{r.delta < 0 && <i style={{ width: `${(-r.delta / max) * 100}%` }} />}</div><div className="pos">{r.delta > 0 && <i style={{ width: `${(r.delta / max) * 100}%` }} />}</div></div></td></tr>))}</tbody></table></div>
        </section></>)}
    </>
  );
}
