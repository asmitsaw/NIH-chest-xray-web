import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Loading, Md, useAsync } from '../ui';

const QUICK = ['Summarise this patient\'s imaging history', 'What were the latest AI findings?', 'Explain cardiomegaly criteria'];
export default function Assistant() {
  const { data: pats, loading } = useAsync(() => api.patients(), []);
  const [pid, setPid] = useState(''); const [q, setQ] = useState(''); const [msgs, setMsgs] = useState([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const end = useRef();
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs]);
  const ask = async (text) => {
    if (!text.trim()) return;
    setErr(''); setBusy(true); setMsgs((m) => [...m, { r: 'q', t: text }]); setQ('');
    try { const r = await api.ask(pid || 0, text); setMsgs((m) => [...m, { r: 'a', t: r.answer }]); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  if (loading) return <Loading />;
  return (
    <>
      <div className="page-head"><div><h1>Assistant</h1><p>Answers come only from the stored record, saved model output and built-in reference notes. If the record does not contain the answer, it says so.</p></div></div>
      <div style={{ maxWidth: 820 }} className="stack">
        <label className="field" style={{ maxWidth: 360 }}><span>Patient context</span><select value={pid} onChange={(e) => { setPid(e.target.value); setMsgs([]); }}><option value="">None selected</option>{pats?.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.mrn})</option>)}</select></label>
        <div className="row wrap">{QUICK.map((t) => <button key={t} className="btn sm" disabled={busy} onClick={() => ask(t)}>{t}</button>)}</div>
        <ErrorBox error={err} />
        <div className="chat" aria-live="polite">{msgs.map((m, i) => <div key={i} className={`msg ${m.r}`}>{m.r === 'a' ? <Md text={m.t} /> : m.t}</div>)}<div ref={end} /></div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); ask(q); }}><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this patient or a finding" aria-label="Question" /><button className="btn primary" disabled={busy}>Ask</button></form>
      </div>
    </>
  );
}
