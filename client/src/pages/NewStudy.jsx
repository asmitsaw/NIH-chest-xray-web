import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorBox, Loading, useAsync } from '../ui';

const TYPES = ['Chest Radiograph (PA View)', 'Chest Radiograph (AP View)', 'Chest Radiograph (Lateral)', 'Follow-up Radiograph'];

export default function NewStudy() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: patients, loading, error } = useAsync(() => api.patients(), []);
  const [pid, setPid] = useState(params.get('patient') || '');
  const [type, setType] = useState(TYPES[0]); const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null); const [preview, setPreview] = useState(null); const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const input = useRef();
  const pick = (f) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g)$/.test(f.type)) return setErr('Use a PNG or JPEG radiograph.');
    if (f.size > 15 * 1024 * 1024) return setErr('Image is larger than 15 MB.');
    setErr(''); setFile(f); setPreview(URL.createObjectURL(f));
  };
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!pid) return setErr('Choose a patient first.');
    if (!file) return setErr('Choose a radiograph to upload.');
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('patient_id', pid); fd.append('study_type', type); fd.append('notes', notes); fd.append('image', file);
      const r = await api.upload(fd);
      nav(`/study/${r.id}`, { state: { warning: r.warning } });
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  if (loading) return <Loading />;
  return (
    <>
      <div className="page-head"><div><h1>New study</h1><p>Upload a chest radiograph. The model scores it as soon as it arrives.</p></div></div>
      <ErrorBox error={error} />
      <form className="panel" onSubmit={submit} style={{ maxWidth: 820 }}>
        <div className="bd stack">
          <ErrorBox error={err} />
          <div className="form-grid">
            <label className="field"><span>Patient</span>
              <select value={pid} onChange={(e) => setPid(e.target.value)} required>
                <option value="">Choose a patient</option>
                {patients?.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.mrn})</option>)}
              </select>
              <span className="small faint" style={{ fontWeight: 400 }}>Not listed? <Link to="/patients">Register the patient</Link> first.</span>
            </label>
            <label className="field"><span>Study type</span><select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          </div>
          <label className={`dz ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}>
            <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => pick(e.target.files[0])} />
            {preview ? <><img src={preview} alt="Selected radiograph preview" /><div className="small muted" style={{ marginTop: 8 }}>{file.name}. Click to choose a different file.</div></>
              : <><b>Drop a radiograph here, or click to browse</b><div className="small muted" style={{ marginTop: 4 }}>PNG or JPEG, up to 15 MB</div></>}
          </label>
          <label className="field"><span>Clinical notes (optional)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Symptoms, reason for the study" /></label>
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Uploading and analysing…' : 'Upload and analyse'}</button></div>
        </div>
      </form>
    </>
  );
}
