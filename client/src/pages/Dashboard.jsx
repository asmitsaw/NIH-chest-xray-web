import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorBox, Loading, Status, fdate, label, useAsync } from '../ui';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading } = useAsync(() => api.dashboard(), []);
  const nav = useNavigate();
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (user.role === 'PATIENT') return <PatientHome data={data} nav={nav} />;
  const c = data.counts || {};
  const toAnalyze = c.PENDING_ANALYSIS || 0, toSign = (c.AI_ANALYZED || 0) + (c.IN_REVIEW || 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Worklist</h1>
          <p className="kpi-line" style={{ marginTop: 10 }}>
            <b>{toAnalyze}</b> {toAnalyze === 1 ? 'study needs' : 'studies need'} analysis. <b>{toSign}</b> {toSign === 1 ? 'is' : 'are'} waiting for sign-off.
          </p>
        </div>
        <Link className="btn primary right" to="/new">New study</Link>
      </div>
      <div className="cols">
        <section className="panel">
          <div className="hd"><h2>Open studies</h2><span className="faint small">{data.queue.length} not yet signed off</span></div>
          {data.queue.length === 0 ? <Empty title="Nothing waiting">Every study has been signed off. Upload a new radiograph to start another.</Empty> : (
            <div className="tablewrap"><table>
              <thead><tr><th>Patient</th><th>Study</th><th>Model flagged</th><th>Status</th></tr></thead>
              <tbody>{data.queue.map((s) => (
                <tr key={s.id} className="click" onClick={() => nav(`/study/${s.id}`)}>
                  <td><Link to={`/study/${s.id}`} onClick={(e) => e.stopPropagation()}><b>{s.patient_name}</b></Link><div className="faint small">{s.mrn}</div></td>
                  <td>{s.study_type.replace(/\s*\(.*\)/, '')}<div className="faint small">{fdate(s.study_date)}</div></td>
                  <td>{s.flagged === null ? <span className="faint small">Not analysed</span> : s.flagged.length ? s.flagged.map((d) => <span className="chip" key={d}>{label(d)}</span>) : <span className="muted small">Nothing above threshold</span>}</td>
                  <td><Status value={s.status} /></td>
                </tr>))}</tbody>
            </table></div>)}
        </section>
        <aside className="stack">
          <section className="panel">
            <div className="hd"><h2>Upcoming appointments</h2><Link className="right small" to="/appointments">All</Link></div>
            {data.appointments.length === 0 ? <Empty title="No appointments booked" /> : (
              <div className="divide">{data.appointments.map((a) => (
                <div key={a.id} style={{ padding: '10px 16px' }}><b>{a.patient_name}</b><div className="small muted">{a.appointment_date} at {a.appointment_time} with {a.doctor_name}</div></div>))}</div>)}
          </section>
          {user.role === 'ADMIN' && (
            <section className="panel">
              <div className="hd"><h2>Latest audit events</h2><Link className="right small" to="/admin">Open log</Link></div>
              <div className="divide">{data.recentAudit.map((l) => <div key={l.id} style={{ padding: '8px 16px' }} className="small"><b>{l.action}</b> by {l.username}<div className="faint">{String(l.timestamp).slice(0, 16)}</div></div>)}</div>
            </section>)}
        </aside>
      </div>
    </>
  );
}

function PatientHome({ data, nav }) {
  return (
    <>
      <div className="page-head"><div><h1>My results</h1><p>Reports appear here after your doctor has reviewed and signed them.</p></div></div>
      <div className="cols">
        <section className="panel">
          <div className="hd"><h2>My radiographs</h2></div>
          {data.studies.length === 0 ? <Empty title="No studies yet">Your doctor will add your chest X-ray here.</Empty> : (
            <table><thead><tr><th>Date</th><th>Study</th><th>Status</th></tr></thead>
              <tbody>{data.studies.map((s) => <tr key={s.id} className="click" onClick={() => nav(`/study/${s.id}`)}><td>{fdate(s.study_date)}</td><td><Link to={`/study/${s.id}`}>{s.study_type}</Link></td><td><Status value={s.status} /></td></tr>)}</tbody></table>)}
        </section>
        <section className="panel">
          <div className="hd"><h2>Next appointments</h2></div>
          {data.appointments.length === 0 ? <Empty title="None booked"><Link to="/appointments">Book a consultation</Link></Empty> :
            <div className="divide">{data.appointments.map((a) => <div key={a.id} style={{ padding: '10px 16px' }}><b>{a.appointment_date}, {a.appointment_time}</b><div className="small muted">{a.doctor_name}</div></div>)}</div>}
        </section>
      </div>
    </>
  );
}
