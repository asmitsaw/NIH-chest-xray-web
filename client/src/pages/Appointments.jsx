import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorBox, Loading, useAsync } from '../ui';

const SLOTS = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM'];
export default function Appointments() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.appointments(), []);
  const { data: docs } = useAsync(() => api.doctors(), []);
  const { data: pats } = useAsync(() => (user.role === 'PATIENT' ? Promise.resolve([]) : api.patients()), []);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ patient_id: '', doctor_id: '', appointment_date: '', appointment_time: SLOTS[0], reason: 'Chest Radiograph Clinical Follow-Up' });
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const book = async (e) => {
    e.preventDefault(); setErr(''); setOk(''); setBusy(true);
    try {
      await api.book(f);
      setOk('Appointment booked successfully.');
      setF({ ...f, appointment_date: '' });
      reload();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const mark = async (id, st) => {
    const actionLabel = st === 'COMPLETED' ? 'Mark this appointment completed?' : 'Cancel this consultation appointment?';
    if (!window.confirm(actionLabel)) return;
    try { await api.setAppt(id, st); reload(); } catch (x) { setErr(x.message); }
  };
  if (loading) return <Loading />;
  return (
    <>
      <div className="page-head"><div><h1>Appointments</h1></div></div>
      <ErrorBox error={error} />
      <div className="cols">
        <section className="panel">
          <div className="hd"><h2>Schedule</h2></div>
          {data.length === 0 ? <Empty title="No appointments yet">Use the form to book a consultation.</Empty> : (
            <div className="tablewrap"><table><thead><tr><th>When</th><th>{user.role === 'PATIENT' ? 'Doctor' : 'Patient'}</th><th>Reason</th><th>Status</th><th></th></tr></thead>
              <tbody>{data.map((a) => (
                <tr key={a.id}><td><b>{a.appointment_date}</b><div className="small muted">{a.appointment_time}</div></td><td>{user.role === 'PATIENT' ? a.doctor_name : a.patient_name}</td><td>{a.reason}</td>
                  <td><span className={`pill ${a.status === 'SCHEDULED' ? 'analyzed' : a.status === 'COMPLETED' ? 'final' : 'pending'}`}>{a.status.charAt(0) + a.status.slice(1).toLowerCase()}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.status === 'SCHEDULED' && <>{user.role !== 'PATIENT' && <button className="btn sm" onClick={() => mark(a.id, 'COMPLETED')}>Complete</button>} <button className="btn sm danger" onClick={() => mark(a.id, 'CANCELLED')}>Cancel</button></>}</td></tr>))}</tbody></table></div>)}
        </section>
        <form className="panel" onSubmit={book}>
          <div className="hd"><h2>Book a consultation</h2></div>
          <div className="bd stack"><ErrorBox error={err} />{ok && <p className="ok" role="status">{ok}</p>}
            {user.role !== 'PATIENT' && <label className="field"><span>Patient</span><select value={f.patient_id} onChange={set('patient_id')} required><option value="">Choose</option>{pats?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>}
            <label className="field"><span>Doctor</span><select value={f.doctor_id} onChange={set('doctor_id')} required><option value="">Choose</option>{docs?.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
            <div className="form-grid"><label className="field"><span>Date</span><input type="date" min={today} value={f.appointment_date} onChange={set('appointment_date')} required /></label>
              <label className="field"><span>Time</span><select value={f.appointment_time} onChange={set('appointment_time')}>{SLOTS.map((t) => <option key={t}>{t}</option>)}</select></label></div>
            <label className="field"><span>Reason</span><input type="text" value={f.reason} onChange={set('reason')} /></label>
            <div><button className="btn primary" disabled={busy}>{busy ? 'Booking…' : 'Book appointment'}</button></div>
          </div>
        </form>
      </div>
    </>
  );
}
