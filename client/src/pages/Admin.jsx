import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Loading, useAsync } from '../ui';

export default function Admin() {
  const [tab, setTab] = useState('users');
  return (
    <>
      <div className="page-head"><div><h1>Administration</h1></div></div>
      <section className="panel">
        <div className="tabs" role="tablist">{[['users', 'Users'], ['audit', 'Audit log'], ['health', 'System health']].map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t}</button>)}</div>
        {tab === 'users' && <Users />}{tab === 'audit' && <Audit />}{tab === 'health' && <Health />}
      </section>
    </>
  );
}

function Users() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.adminUsers(), []);
  const [f, setF] = useState({ username: '', email: '', full_name: '', password: '', role: 'DOCTOR' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const add = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api.addUser(f);
      setF({ username: '', email: '', full_name: '', password: '', role: 'DOCTOR' });
      reload();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (u) => {
    const action = u.is_active ? `Deactivate account for ${u.full_name} (${u.username})?` : `Reactivate account for ${u.full_name} (${u.username})?`;
    if (!window.confirm(action)) return;
    setErr('');
    try { await api.setUserActive(u.id, !u.is_active); reload(); } catch (x) { setErr(x.message); }
  };
  if (loading) return <Loading />;
  return (
    <div>
      <ErrorBox error={error || err} />
      <form className="bd stack" onSubmit={add} style={{ borderBottom: '1px solid var(--line-2)' }}>
        <h3>Add a user</h3>
        <div className="form-grid">
          <label className="field"><span>Full name</span><input type="text" value={f.full_name} onChange={set('full_name')} required /></label>
          <label className="field"><span>Username</span><input type="text" value={f.username} onChange={set('username')} required /></label>
          <label className="field"><span>Email</span><input type="text" value={f.email} onChange={set('email')} required /></label>
          <label className="field"><span>Temporary password (8+ characters)</span><input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required /></label>
          <label className="field"><span>Role</span><select value={f.role} onChange={set('role')}><option value="DOCTOR">Doctor</option><option value="ADMIN">Administrator</option></select></label>
        </div>
        <div><button className="btn primary" disabled={busy}>{busy ? 'Adding user…' : 'Add user'}</button></div>
        <p className="small faint">Patient accounts are linked to a patient record, so they are not created here.</p>
      </form>
      <div className="tablewrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>{data.map((u) => <tr key={u.id}><td><b>{u.full_name}</b><div className="small faint">{u.email}</div></td><td>{u.username}</td><td>{u.role.charAt(0) + u.role.slice(1).toLowerCase()}</td>
          <td><span className={`pill ${u.is_active ? 'final' : 'pending'}`}>{u.is_active ? 'Active' : 'Deactivated'}</span></td>
          <td>{u.id !== user.id && <button className={`btn sm ${u.is_active ? 'danger' : ''}`} onClick={() => toggle(u)}>{u.is_active ? 'Deactivate' : 'Reactivate'}</button>}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function Audit() {
  const { data, error, loading } = useAsync(() => api.audit(), []);
  if (loading) return <Loading />;
  return <div className="tablewrap"><ErrorBox error={error} /><table><thead><tr><th>Time (UTC)</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
    <tbody>{data?.map((l) => <tr key={l.id}><td className="small">{String(l.timestamp).slice(0, 19)}</td><td>{l.username}<div className="small faint">{l.role}</div></td><td><b>{l.action}</b></td><td className="small">{l.entity} {l.entity_id}</td><td className="small muted">{l.details}</td></tr>)}</tbody></table></div>;
}

function Health() {
  const { data, error, loading, reload } = useAsync(() => api.health(), []);
  if (loading) return <Loading />;
  const rows = data ? [['API server', data.api, 'Running'], ['Database', data.database, 'Connected'], ['AI inference service', data.ml.ok, data.ml.ok ? `${data.ml.model || 'Model'} loaded` : data.ml.error]] : [];
  return <div className="bd stack"><ErrorBox error={error} />{rows.map(([n, ok, d]) => <div className="row" key={n}><span className={`pill ${ok ? 'final' : 'review'}`}>{ok ? 'OK' : 'Down'}</span><b>{n}</b><span className="muted small">{d}</span></div>)}
    {data && !data.ml.ok && <p className="small muted">Start it with <code>python ml_service/app.py</code>. Uploads still work without it, but studies stay unanalysed.</p>}
    <div><button className="btn sm" onClick={reload}>Check again</button></div></div>;
}
