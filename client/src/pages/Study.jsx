import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Ladder, Loading, SecureImage, Status, fdate, label, useAsync, useDebounced } from '../ui';

export default function Study() {
  const { id } = useParams();
  const { user } = useAuth();
  const loc = useLocation();
  const { data: s, error, loading, reload } = useAsync(() => api.study(id), [id]);
  const { data: meta } = useAsync(() => api.meta(), []);
  const staff = user.role !== 'PATIENT';
  const [tab, setTab] = useState('findings');
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState('original');
  const [alpha, setAlpha] = useState(0.5); const [cmap, setCmap] = useState('jet');
  const [bright, setBright] = useState(100); const [contrast, setContrast] = useState(100); const [invert, setInvert] = useState(false);
  const [cam, setCam] = useState(null); const [camBusy, setCamBusy] = useState(false); const [camErr, setCamErr] = useState('');
  const [busy, setBusy] = useState(false); const [actErr, setActErr] = useState('');
  const dCmap = useDebounced(cmap, 250);

  useEffect(() => { setSel(null); setCam(null); setMode('original'); }, [id]);
  useEffect(() => {
    if (staff && s?.prediction && !sel) {
      const topFinding = s.prediction.primary?.[0]?.disease || s.prediction.scores?.[0]?.disease;
      if (topFinding) setSel(topFinding);
    }
  }, [id, staff, s?.prediction, sel]);

  useEffect(() => {
    if (!staff || !sel || !s?.prediction) return;
    let dead = false;
    setCamBusy(true); setCamErr('');
    api.gradcam(id, { disease: sel, colormap: dCmap, alpha: 0.5 })
      .then((r) => { if (!dead) { setCam(r); setMode((m) => (m === 'original' ? 'overlay' : m)); } })
      .catch((e) => { if (!dead) { setCam(null); setCamErr(e.message); setMode('original'); } })
      .finally(() => { if (!dead) setCamBusy(false); });
    return () => { dead = true; };
  }, [id, sel, dCmap, staff, s?.prediction?.id]);

  if (loading) return <Loading what="Opening study" />;
  if (error) return <ErrorBox error={error} />;

  const filter = `brightness(${bright}%) contrast(${contrast}%) ${invert ? 'invert(1)' : ''}`;
  const locked = s.report && !s.report.is_draft;
  const analyse = async () => { setBusy(true); setActErr(''); try { await api.analyze(id); await reload(); } catch (e) { setActErr(e.message); } setBusy(false); };

  return (
    <>
      <div className="page-head">
        <div><h1>{s.patient_name}</h1><p>{s.study_type} · {fdate(s.study_date)} · {s.study_uid}</p></div>
        <span className="right"><Status value={s.status} /></span>
      </div>
      <ErrorBox error={actErr || loc.state?.warning} />
      <div className="ws" style={{ marginTop: actErr || loc.state?.warning ? 14 : 0 }}>
        <div>
          <div className="meta">
            <div>MRN<b>{s.mrn}</b></div><div>Age / sex<b>{s.age} · {s.gender}</b></div>
            <div>Attending<b>{s.doctor_name || 'Unassigned'}</b></div>
            {s.prediction && <div>Model<b>{s.prediction.model_version} · {Math.round(s.prediction.inference_time_ms)} ms</b></div>}
          </div>
          <div className="viewer">
            <div className="viewer-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="seg" role="group" aria-label="Image layer">
                  <button aria-pressed={mode === 'original'} onClick={() => setMode('original')}>Original</button>
                  <button aria-pressed={mode === 'heatmap'} disabled={!cam} onClick={() => setMode('heatmap')}>Heatmap</button>
                  <button aria-pressed={mode === 'overlay'} disabled={!cam} onClick={() => setMode('overlay')}>Overlay</button>
                </div>
                {camBusy && <span className="small" style={{ color: '#00f2fe', fontWeight: 600 }}>Computing Grad-CAM…</span>}
              </div>
              {staff && s.prediction && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="small faint">Finding:</span>
                  <select
                    value={sel || ''}
                    onChange={(e) => {
                      setSel(e.target.value);
                      if (mode === 'original') setMode('overlay');
                    }}
                    style={{ background: '#232a33', color: '#fff', border: '1px solid #3d4a5c', borderRadius: 4, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}
                  >
                    {!sel && <option value="" disabled>-- Select Finding --</option>}
                    {(s.prediction.scores || []).map((item) => (
                      <option key={item.disease} value={item.disease}>
                        {label(item.disease)} ({item.score_pct.toFixed(1)}%)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="stage">
              <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}>
                {mode !== 'heatmap' && <SecureImage path={`/studies/${id}/image`} alt={`Chest radiograph of ${s.patient_name}`} style={{ gridArea: '1/1', filter, maxHeight: '100%' }} />}
                {cam && mode === 'heatmap' && <img src={cam.heatmap} alt={`Grad-CAM heatmap for ${label(sel)}`} style={{ maxHeight: '100%' }} />}
                {cam && mode === 'overlay' && <img src={cam.overlay || cam.heatmap} alt={`Grad-CAM overlay for ${label(sel)}`} style={{ gridArea: '1/1', opacity: cam.overlay ? 1 : alpha, maxHeight: '100%', mixBlendMode: 'normal' }} />}
              </div>
              {sel && mode !== 'original' && <span className="tag">Grad-CAM for {label(sel)}</span>}
              {camBusy && <div className="busy" role="status">Computing Grad-CAM…</div>}
            </div>
            <div className="viewer-ctl">
              <label>Brightness {bright}%<input type="range" min="50" max="170" value={bright} onChange={(e) => setBright(+e.target.value)} /></label>
              <label>Contrast {contrast}%<input type="range" min="50" max="200" value={contrast} onChange={(e) => setContrast(+e.target.value)} /></label>
              <label style={{ gridAutoFlow: 'column', alignItems: 'center', justifyContent: 'start', gap: 8 }}><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />Invert</label>
              {staff && <>
                <label>Heatmap opacity {Math.round(alpha * 100)}%<input type="range" min="0.1" max="1" step="0.05" value={alpha} onChange={(e) => setAlpha(+e.target.value)} /></label>
                <label>Colour map<select value={cmap} onChange={(e) => setCmap(e.target.value)}>{(meta?.colormaps || ['jet']).map((c) => <option key={c}>{c}</option>)}</select></label>
              </>}
            </div>
          </div>
          {camErr && <p className="warn" style={{ marginTop: 12 }}>{camErr}</p>}
          {cam && <p className="small faint" style={{ marginTop: 10, maxWidth: '70ch' }}>{cam.disclaimer}</p>}
          {s.notes && staff && <section className="panel" style={{ marginTop: 16 }}><div className="hd"><h3>Clinical notes</h3></div><div className="bd">{s.notes}</div></section>}
        </div>

        <section className="panel">
          <div className="tabs" role="tablist">
            {staff && <button role="tab" aria-selected={tab === 'findings'} onClick={() => setTab('findings')}>Model findings</button>}
            <button role="tab" aria-selected={tab === 'review' || !staff} onClick={() => setTab('review')}>{staff ? 'Review and sign-off' : 'Report'}</button>
          </div>
          {staff && tab === 'findings' && (
            s.prediction ? (<>
              <Ladder scores={s.prediction.scores} selected={sel} onSelect={setSel} />
              <p className="small faint" style={{ padding: '0 14px 14px' }}>
                TorchXRayVision DenseNet-121 outputs independent multi-label probabilities calibrated against dataset operating thresholds (op_threshs). Amber markers indicate sensitivity operating points; scores are decision-support estimates and require clinical physician correlation.
              </p>
            </>) : (
              <div className="bd stack"><p className="muted">This study has not been analysed yet.</p><div><button className="btn primary" disabled={busy} onClick={analyse}>{busy ? 'Analysing…' : 'Analyse now'}</button></div></div>)
          )}
          {(tab === 'review' || !staff) && <Review s={s} staff={staff} locked={locked} user={user} onSaved={reload} />}
        </section>
      </div>
    </>
  );
}

function Review({ s, staff, locked, user, onSaved }) {
  const primary = s.prediction?.primary || [];
  const r = s.report;
  const init = useMemo(() => {
    const v = {}; primary.forEach((f) => { v[f.disease] = r?.confirmed.includes(f.disease) ? 'confirm' : r?.rejected.includes(f.disease) ? 'reject' : 'none'; });
    return v;
  }, [s.id, r?.updated_at, primary.length]); // eslint-disable-line
  const [verdict, setVerdict] = useState(init);
  const [added, setAdded] = useState(r?.added || []); const [newF, setNewF] = useState('');
  const [impression, setImpression] = useState(r?.final_impression || ''); const [findings, setFindings] = useState(r?.clinical_findings_text || '');
  const [rec, setRec] = useState(r?.recommendation || ''); const [notes, setNotes] = useState(r?.doctor_notes || '');
  const [amendText, setAmendText] = useState(''); const [amendReason, setAmendReason] = useState('');
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setVerdict(init); }, [init]);

  if (!staff) {
    return r && !r.is_draft ? (
      <div className="bd stack">
        <div><h3>Impression</h3><p style={{ marginTop: 4 }}>{r.final_impression}</p></div>
        {r.recommendation && <div><h3>Recommendation</h3><p style={{ marginTop: 4 }}>{r.recommendation}</p></div>}
        {r.clinical_findings_text && <div style={{ whiteSpace: 'pre-wrap' }}><h3>Findings & Addenda</h3><p className="small muted" style={{ marginTop: 4 }}>{r.clinical_findings_text}</p></div>}
        <p className="small muted">Signed by {r.doctor_name} on {fdate(r.finalized_at)}.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={() => api.download(`/studies/${s.id}/report.pdf`, `${(s.patient_name || 'Patient').replace(/\s+/g, '_')}_${s.study_uid}_Report.pdf`)}>
            📄 Download Official PDF Report
          </button>
          <button className="btn sm" onClick={() => api.download(`/studies/${s.id}/report.md`, `${s.study_uid}-report.md`)}>
            Markdown
          </button>
        </div>
      </div>
    ) : <div className="bd"><p className="muted">Your doctor has not signed this report yet. It will appear here once it is ready.</p></div>;
  }
  if (user.role === 'ADMIN') return <div className="bd muted">Only doctors can review and sign reports.</div>;
  if (!s.prediction) return <div className="bd muted">Analyse the study first, then review the model findings here.</div>;

  const save = async (draft) => {
    setErr(''); setOk('');
    if (!draft && !impression.trim()) return setErr('Write a final impression before signing off.');
    if (!draft && !window.confirm('Sign off this report? It will be locked and visible to the patient.')) return;
    setBusy(true);
    try {
      await api.saveReport(s.id, { is_draft: draft, final_impression: impression, clinical_findings_text: findings, recommendation: rec, doctor_notes: notes,
        confirmed: primary.filter((f) => verdict[f.disease] === 'confirm').map((f) => f.disease), rejected: primary.filter((f) => verdict[f.disease] === 'reject').map((f) => f.disease), added });
      setOk(draft ? 'Draft saved.' : 'Report signed off.'); await onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const submitAmendment = async () => {
    if (!amendText.trim()) return setErr('Amendment text is required.');
    if (!window.confirm('File this audited clinical amendment? It will be permanently recorded in the report.')) return;
    setBusy(true); setErr(''); setOk('');
    try {
      await api.amendReport(s.id, { amendment_text: amendText, reason: amendReason });
      setOk('Audited amendment recorded successfully.');
      setAmendText(''); setAmendReason('');
      await onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="bd stack">
      {locked && <p className="ok">Signed off by {r.doctor_name} on {fdate(r.finalized_at)}. This report is locked.</p>}
      <ErrorBox error={err} />{ok && <p className="ok" role="status">{ok}</p>}
      <div>
        <h3>Model findings above operating threshold</h3>
        {primary.length === 0 ? <p className="muted small" style={{ marginTop: 6 }}>No findings exceed their operating threshold. Add any findings observed during review below.</p> :
          primary.map((f) => (
            <div className="verdict" key={f.disease}>
              <div>
                <b>{label(f.disease)}</b> <span className="muted small">{f.score_pct.toFixed(1)}% (op threshold {f.threshold_pct}%)</span>
                {f.status && <div className="faint small" style={{ fontSize: 11, color: 'var(--amber)' }}>{f.status}</div>}
              </div>
              <div className="seg" role="group" aria-label={`Verdict for ${label(f.disease)}`}>
                {[['confirm', 'Confirm'], ['reject', 'Reject'], ['none', 'Unsure']].map(([v, t]) => <button key={v} data-v={v} disabled={locked} aria-pressed={verdict[f.disease] === v} onClick={() => setVerdict({ ...verdict, [f.disease]: v })}>{t}</button>)}
              </div>
            </div>))}
      </div>
      <div>
        <h3>Findings you add</h3>
        <div style={{ margin: '6px 0' }}>{added.map((a) => <span className="chip" key={a}>{a}{!locked && <button aria-label={`Remove ${a}`} onClick={() => setAdded(added.filter((x) => x !== a))} style={{ border: 0, background: 'none', cursor: 'pointer', marginLeft: 4 }}>×</button>}</span>)}</div>
        {!locked && <form className="row" onSubmit={(e) => { e.preventDefault(); const v = newF.trim(); if (v && !added.includes(v)) setAdded([...added, v]); setNewF(''); }}>
          <input type="text" value={newF} onChange={(e) => setNewF(e.target.value)} placeholder="e.g. Rib fracture" aria-label="Finding to add" /><button className="btn sm">Add</button></form>}
      </div>
      <label className="field"><span>Clinical findings</span><textarea disabled={locked} value={findings} onChange={(e) => setFindings(e.target.value)} /></label>
      <label className="field"><span>Final impression (required to sign)</span><textarea disabled={locked} value={impression} onChange={(e) => setImpression(e.target.value)} /></label>
      <label className="field"><span>Recommendation</span><textarea disabled={locked} value={rec} onChange={(e) => setRec(e.target.value)} /></label>
      <label className="field"><span>Private notes (not shown to patient)</span><textarea disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="row wrap">
        {!locked && <><button className="btn" disabled={busy} onClick={() => save(true)}>Save draft</button><button className="btn primary" disabled={busy} onClick={() => save(false)}>Sign off report</button></>}
        <div className="right row">
          <button className="btn primary" onClick={() => api.download(`/studies/${s.id}/report.pdf`, `${(s.patient_name || 'Patient').replace(/\s+/g, '_')}_${s.study_uid}_Report.pdf`)}>
            📄 Download Clinical PDF Report
          </button>
          <button className="btn sm" onClick={() => api.download(`/studies/${s.id}/report.md`, `${s.study_uid}-report.md`)}>
            Markdown
          </button>
        </div>
      </div>
      {locked && (
        <div className="panel" style={{ marginTop: 12, borderLeft: '4px solid var(--amber)' }}>
          <div className="bd stack">
            <h3 style={{ color: 'var(--amber)' }}>File Audited Clinical Addendum / Amendment</h3>
            <p className="small muted">Finalized reports cannot be overwritten. Enter an addendum with its clinical justification; it will be appended to the official permanent record.</p>
            <label className="field"><span>Reason for amendment</span><input type="text" placeholder="e.g. Microbiology confirmation, laboratory correlation" value={amendReason} onChange={(e) => setAmendReason(e.target.value)} /></label>
            <label className="field"><span>Addendum text</span><textarea placeholder="Clinical findings, updated impression or recommendations..." value={amendText} onChange={(e) => setAmendText(e.target.value)} /></label>
            <div><button className="btn primary sm" disabled={busy || !amendText.trim()} onClick={submitAmendment}>{busy ? 'Recording addendum…' : 'Submit audited addendum'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
