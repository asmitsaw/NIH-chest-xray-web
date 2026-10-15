import { useState } from 'react';
import { useAuth } from '../auth';
import { ErrorBox } from '../ui';

export default function Login() {
  const { login } = useAuth();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (user, pass) => { setBusy(true); setErr(''); try { await login(user, pass); } catch (e) { setErr(e.message); setBusy(false); } };
  return (
    <div className="login">
      <section className="login-art" aria-hidden="false">
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em' }}>Chest-X</div>
        <div><h1>Read the film. See why the model flagged it.</h1><p>Fourteen NIH findings scored on every chest radiograph, with Grad-CAM showing where the model looked. A physician reviews and signs every report.</p></div>
        <div className="small" style={{ color: '#8d99aa' }}>For research and education. Not a diagnostic device.</div>
        <img src="/login-xray.png" alt="" />
      </section>
      <section className="login-form">
        <div><h1 style={{ fontSize: 26 }}>Sign in</h1><p className="muted" style={{ marginTop: 6 }}>Use your clinic account.</p></div>
        <ErrorBox error={err} />
        <form className="stack" onSubmit={(e) => { e.preventDefault(); go(u, p); }}>
          <label className="field"><span>Username</span><input type="text" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required /></label>
          <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></label>
          <button className="btn primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div>
          <p className="small muted" style={{ marginBottom: 8 }}>Demo accounts (local install only)</p>
          <div className="demo">
            <button className="btn sm" disabled={busy} onClick={() => go('dr.sharma', 'doctor123')} title="Dr. Rajesh Sharma (AIIMS)">Dr. Sharma</button>
            <button className="btn sm" disabled={busy} onClick={() => go('patient.aarav', 'patient123')} title="Aarav Sharma (Patient)">Aarav (Patient)</button>
            <button className="btn sm" disabled={busy} onClick={() => go('admin', 'admin123')} title="Clinical Administrator">Admin</button>
          </div>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <a href="/" style={{ fontSize: 13, color: 'var(--cobalt)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              ← Return to 3D Thorax Hero Page
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
