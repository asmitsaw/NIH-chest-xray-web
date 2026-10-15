import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Empty, ErrorBox, Loading, Status, fdate, label, useAsync } from '../ui';

export function Patients() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.patients(), []);
  const [q, setQ] = useState(''); const [adding, setAdding] = useState(false);
  const [createdAccount, setCreatedAccount] = useState(null);
  const [f, setF] = useState({ full_name: '', mrn: '', age: '', gender: 'Female', blood_group: 'Unknown', contact_phone: '', emergency_contact: '', medical_history_notes: '', email: '', username: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const add = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.addPatient(f);
      if (r.temporary_password) {
        setCreatedAccount(r);
        reload();
      } else {
        nav(`/patients/${r.id}`);
      }
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Loading />;
  const rows = (data || []).filter((p) => (p.full_name + p.mrn).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head"><div><h1>Patients</h1></div><button className="btn primary right" onClick={() => { setAdding(!adding); setCreatedAccount(null); }}>{adding ? 'Close' : 'Register patient'}</button></div>
      <ErrorBox error={error} />
      {createdAccount && (
        <div className="panel" style={{ marginBottom: 18, borderLeft: '4px solid var(--green)' }}>
          <div className="bd stack">
            <h3 style={{ color: 'var(--green)' }}>Patient & Portal Account Provisioned</h3>
            <p>Patient <b>{createdAccount.full_name}</b> ({createdAccount.mrn}) has been registered and provisioned with a secure portal login.</p>
            <div style={{ background: 'var(--paper-2)', padding: 12, borderRadius: 4, fontFamily: 'monospace', fontSize: 13 }}>
              <div><b>Username:</b> {createdAccount.username}</div>
              <div><b>Temporary Password:</b> {createdAccount.temporary_password}</div>
              <div><b>Email:</b> {createdAccount.email}</div>
            </div>
            <p className="small muted">Please provide these credentials to the patient for their first sign-in.</p>
            <div><button className="btn primary" onClick={() => nav(`/patients/${createdAccount.id}`)}>Go to Patient Profile</button></div>
          </div>
        </div>
      )}
      {adding && !createdAccount && (
        <form className="panel" onSubmit={add} style={{ marginBottom: 18 }}>
          <div className="hd"><h2>Register patient</h2></div>
          <div className="bd stack"><ErrorBox error={err} />
            <div className="form-grid">
              <label className="field"><span>Full name</span><input type="text" value={f.full_name} onChange={set('full_name')} required /></label>
              <label className="field"><span>Medical record number</span><input type="text" value={f.mrn} onChange={set('mrn')} placeholder="MRN-10046" required /></label>
              <label className="field"><span>Age</span><input type="number" min="0" max="120" value={f.age} onChange={set('age')} required /></label>
              <label className="field"><span>Sex</span><select value={f.gender} onChange={set('gender')}><option>Female</option><option>Male</option><option>Other</option></select></label>
              <label className="field"><span>Blood group</span><select value={f.blood_group} onChange={set('blood_group')}>{['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</select></label>
              <label className="field"><span>Phone</span><input type="text" value={f.contact_phone} onChange={set('contact_phone')} /></label>
              <label className="field"><span>Email (optional)</span><input type="email" value={f.email} onChange={set('email')} placeholder="patient@example.com" /></label>
              <label className="field"><span>Portal Username (optional)</span><input type="text" value={f.username} onChange={set('username')} placeholder="Auto-generated if empty" /></label>
            </div>
            <label className="field"><span>Medical history</span><textarea value={f.medical_history_notes} onChange={set('medical_history_notes')} /></label>
            <div><button className="btn primary" disabled={busy}>{busy ? 'Provisioning account…' : 'Save patient & provision login'}</button></div>
          </div>
        </form>)}
      <section className="panel">
        <div className="hd"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or MRN" aria-label="Search patients" style={{ maxWidth: 320 }} /></div>
        {rows.length === 0 ? <Empty title="No patients match">Try a different name or MRN.</Empty> : (
          <div className="tablewrap"><table><thead><tr><th>Name</th><th>MRN</th><th>Age / sex</th><th>Studies</th></tr></thead>
            <tbody>{rows.map((p) => <tr className="click" key={p.id} onClick={() => nav(`/patients/${p.id}`)}><td><Link to={`/patients/${p.id}`} onClick={(e) => e.stopPropagation()}><b>{p.full_name}</b></Link></td><td>{p.mrn}</td><td>{p.age} · {p.gender}</td><td>{p.study_count}</td></tr>)}</tbody></table></div>)}
      </section>
    </>
  );
}

export function PatientDetail() {
  const { id } = useParams();
  const { data, error, loading } = useAsync(() => api.patient(id), [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { patient: p, studies, appointments } = data;
  return (
    <>
      <div className="page-head"><div><h1>{p.full_name}</h1><p>{p.mrn} · {p.age} years · {p.gender} · Blood group {p.blood_group}</p></div><Link className="btn primary right" to={`/new?patient=${p.id}`}>New study</Link></div>
      <div className="cols">
        <section className="panel">
          <div className="hd"><h2>Imaging timeline</h2></div>
          {studies.length === 0 ? <Empty title="No studies yet">Upload the first radiograph for this patient.</Empty> : (
            <div className="timeline">{studies.map((s) => (
              <div key={s.id}>
                <div className="muted small">{fdate(s.study_date)}</div>
                <div><Link to={`/study/${s.id}`}><b>{s.study_type}</b></Link>
                  <div style={{ marginTop: 4 }}>{s.prediction ? (s.prediction.primary.length ? s.prediction.primary.map((f) => <span className="chip" key={f.disease}>{label(f.disease)} {f.score_pct.toFixed(0)}%</span>) : <span className="small muted">Nothing above threshold</span>) : <span className="small faint">Not analysed</span>}</div>
                  {s.report && !s.report.is_draft && <div className="small muted">Impression: {s.report.final_impression}</div>}</div>
                <Status value={s.status} />
              </div>))}</div>)}
        </section>
        <aside className="stack">
          <section className="panel"><div className="hd"><h3>History</h3></div><div className="bd small">{p.medical_history_notes || 'None on file.'}</div></section>
          <section className="panel"><div className="hd"><h3>Appointments</h3></div>
            {appointments.length === 0 ? <div className="bd small muted">None booked.</div> : <div className="divide">{appointments.map((a) => <div key={a.id} className="small" style={{ padding: '10px 16px' }}><b>{a.appointment_date}, {a.appointment_time}</b> · {a.status.toLowerCase()}<div className="muted">{a.doctor_name}</div></div>)}</div>}
          </section>
        </aside>
      </div>
    </>
  );
}
