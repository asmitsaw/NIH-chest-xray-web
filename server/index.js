import express from 'express';
import cors from 'cors';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, db, all, get, run, now, audit, initDb, hashPassword, verifyPassword, resolveImage } from './db.js';
import { generateStudyReportPdf } from './report_pdf.js';

const PORT = Number(process.env.PORT || 4000);
const ML_URL = process.env.ML_URL || 'http://127.0.0.1:5001';

const isDev = process.env.NODE_ENV !== 'production';
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret || rawJwtSecret === 'change-me-to-a-long-random-string' || rawJwtSecret.length < 32) {
  if (!isDev) {
    console.error('FATAL: A secure JWT_SECRET of at least 32 characters is required in production mode.');
    process.exit(1);
  }
  console.warn('[Security Warning] JWT_SECRET is unset or using a weak default. Set JWT_SECRET in .env.');
}
const JWT_SECRET = rawJwtSecret || 'dev-fallback-insecure-jwt-secret-for-local-demo-only-32bytes!';

const UPLOAD_DIR = path.join(ROOT, 'outputs', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
initDb();

const DISCLAIMER = 'AI-generated analysis for research/educational use. This system does not provide a definitive medical diagnosis. Results must be reviewed by a qualified healthcare professional.';
const CLASSES = ['Atelectasis', 'Consolidation', 'Infiltration', 'Pneumothorax', 'Edema', 'Emphysema', 'Fibrosis', 'Effusion', 'Pneumonia', 'Pleural_Thickening', 'Cardiomegaly', 'Nodule', 'Mass', 'Hernia'];
const KB = {
  cardiomegaly: 'Cardiomegaly refers to an enlarged cardiac silhouette where the transverse cardiac diameter exceeds 50% of the transverse thoracic diameter (cardiothoracic ratio > 0.5) on a standard PA radiograph. Common etiologies include hypertensive heart disease, dilated cardiomyopathy, valvular heart disease, and pericardial effusion.',
  effusion: 'Pleural effusion is the accumulation of fluid in the pleural space. On erect PA radiographs it shows as blunting of the costophrenic angle (typically >175-200 mL) and a meniscus sign.',
  pneumothorax: 'Pneumothorax is air in the pleural cavity causing partial or complete lung collapse. Signs include a visible visceral pleural line and absent peripheral lung markings.',
  pneumonia: 'Pneumonia typically presents as airspace opacity (consolidation or patchy infiltration) with air bronchograms, segmental or lobar distribution, and the silhouette sign.',
  atelectasis: 'Atelectasis is collapse or incomplete expansion of lung parenchyma. Features include linear or plate-like opacities, volume loss, elevated hemidiaphragm, or mediastinal shift.',
  infiltration: 'Pulmonary infiltration is an ill-defined radio-opacity representing fluid, inflammatory exudate, or cellular debris within alveoli or interstitium.',
};

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_r, f, cb) => {
    const valid = /^image\/(png|jpe?g)$/.test(f.mimetype);
    cb(valid ? null : Object.assign(new Error('Upload a PNG or JPEG radiograph.'), { status: 400 }), valid);
  },
});

// ---------- helpers ----------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const J = (s, d = []) => { try { return JSON.parse(s ?? ''); } catch { return d; } };
const ip = (req) => req.ip || '127.0.0.1';

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try { req.user = jwt.verify(h.replace(/^Bearer /, ''), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired. Sign in again.' }); }
}
const roles = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : res.status(403).json({ error: 'Your role cannot do this.' });
const isStaff = (u) => u.role === 'DOCTOR' || u.role === 'ADMIN';

async function ml(pathname, { buffer, filename, fields = {} }) {
  const fd = new FormData();
  fd.append('image', new Blob([buffer]), filename || 'xray.png');
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  let r;
  try { r = await fetch(ML_URL + pathname, { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) }); }
  catch { const e = new Error('AI service is not running. Start it with: python ml_service/app.py'); e.status = 503; throw e; }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(body.error || 'AI service error'); e.status = r.status === 400 ? 400 : 502; throw e; }
  return body;
}

function loadStudy(id) {
  const s = get(`SELECT s.*, p.full_name patient_name, p.mrn, p.age, p.gender, p.blood_group, p.medical_history_notes,
                 d.full_name doctor_name FROM xray_studies s JOIN patients p ON p.id = s.patient_id
                 LEFT JOIN doctors d ON d.id = s.doctor_id WHERE s.id = ?`, id);
  if (!s) return null;
  const pr = get('SELECT * FROM ai_predictions WHERE study_id = ? ORDER BY id DESC', id);
  const rp = get('SELECT r.*, d.full_name doctor_name FROM doctor_reports r JOIN doctors d ON d.id = r.doctor_id WHERE r.study_id = ?', id);
  delete s.image_path;
  return {
    ...s,
    prediction: pr && { id: pr.id, model_version: pr.model_version, inference_time_ms: pr.inference_time_ms, threshold_used: pr.threshold_used,
      scores: J(pr.raw_scores_json), primary: J(pr.primary_findings_json), created_at: pr.created_at },
    report: rp && { ...rp, confirmed: J(rp.confirmed_findings_json), rejected: J(rp.rejected_findings_json), added: J(rp.added_findings_json), is_draft: !!rp.is_draft },
  };
}
// Patients: only their own studies, only a finalised report, never raw model scores.
function forUser(study, u) {
  if (!study) return null;
  if (u.role !== 'PATIENT') return study;
  if (study.patient_id !== u.patient_id) return null;
  return { ...study, prediction: null, notes: '', report: study.report && !study.report.is_draft ? study.report : null };
}
function studyOr404(req, res) {
  const raw = loadStudy(Number(req.params.id));
  if (!raw) {
    res.status(404).json({ error: 'Study not found.' });
    return null;
  }
  if (req.user.role === 'PATIENT' && raw.patient_id !== req.user.patient_id) {
    res.status(403).json({ error: 'Access denied. You do not have permission to access another patient\'s medical records.' });
    return null;
  }
  return forUser(raw, req.user);
}

async function analyze(studyId, user, req) {
  const row = get('SELECT * FROM xray_studies WHERE id = ?', studyId);
  const file = resolveImage(row.image_path);
  if (!file) throw Object.assign(new Error('Image file is missing on disk.'), { status: 404 });
  const out = await ml('/predict', { buffer: fs.readFileSync(file), filename: row.original_filename });
  run(`INSERT INTO ai_predictions (study_id, model_version, inference_time_ms, raw_scores_json, primary_findings_json, threshold_used, warning_notes, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    studyId, out.model_version, out.inference_time_ms, JSON.stringify(out.predictions), JSON.stringify(out.primary_findings), 0.5, '', now());
  if (row.status === 'PENDING_ANALYSIS') run("UPDATE xray_studies SET status='AI_ANALYZED' WHERE id = ?", studyId);
  audit(user, 'AI_ANALYSIS', 'XRayStudy', studyId, `${out.primary_findings.length} findings above threshold`, ip(req));
}

// ---------- auth ----------
const fails = new Map();
app.post('/api/auth/login', wrap((req, res) => {
  const { username = '', password = '' } = req.body || {};
  const key = `${ip(req)}|${username.toLowerCase()}`;
  const f = fails.get(key);
  if (f && f.n >= 5 && Date.now() - f.t < 60000) return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
  const u = get('SELECT * FROM users WHERE username = ?', username);
  if (!u || !u.is_active || !verifyPassword(password, u.password_hash)) {
    fails.set(key, { n: (f?.n || 0) + 1, t: Date.now() });
    audit(null, 'LOGIN_FAILED', 'User', username, '', ip(req));
    return res.status(401).json({ error: 'Username or password is incorrect.' });
  }
  fails.delete(key);
  const doctor = get('SELECT id FROM doctors WHERE user_id = ?', u.id);
  const patient = get('SELECT id FROM patients WHERE user_id = ?', u.id);
  const user = { id: u.id, username: u.username, role: u.role, full_name: u.full_name, doctor_id: doctor?.id ?? null, patient_id: patient?.id ?? null };
  audit(user, 'LOGIN', 'User', u.id, '', ip(req));
  res.json({ token: jwt.sign(user, JWT_SECRET, { expiresIn: '8h' }), user });
}));
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

// ---------- meta ----------
app.get('/api/meta', auth, wrap(async (_req, res) => {
  let cfg = null;
  try { cfg = await (await fetch(ML_URL + '/config', { signal: AbortSignal.timeout(2000) })).json(); } catch { /* offline */ }
  res.json({ classes: cfg?.classes || CLASSES, thresholds: cfg?.thresholds || {}, colormaps: cfg?.colormaps || ['jet', 'turbo', 'viridis', 'plasma', 'inferno', 'hot'],
    disclaimer: DISCLAIMER, xai_disclaimer: cfg?.xai_disclaimer, ml_online: !!cfg });
}));

// ---------- dashboard ----------
app.get('/api/dashboard', auth, (req, res) => {
  const u = req.user;
  if (u.role === 'PATIENT') {
    const studies = all(`SELECT s.id, s.study_uid, s.study_date, s.study_type, s.status FROM xray_studies s WHERE s.patient_id = ? ORDER BY s.study_date DESC`, u.patient_id);
    const appts = all(`SELECT a.*, d.full_name doctor_name FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE a.patient_id=? AND a.status='SCHEDULED' ORDER BY appointment_date`, u.patient_id);
    return res.json({ studies, appointments: appts });
  }
  const queue = all(`SELECT s.id, s.study_uid, s.study_date, s.study_type, s.status, p.full_name patient_name, p.mrn, d.full_name doctor_name,
      (SELECT primary_findings_json FROM ai_predictions WHERE study_id=s.id ORDER BY id DESC LIMIT 1) pf
      FROM xray_studies s JOIN patients p ON p.id=s.patient_id LEFT JOIN doctors d ON d.id=s.doctor_id
      WHERE s.status != 'FINALIZED' ORDER BY s.study_date DESC`)
    .map(({ pf, ...r }) => ({ ...r, flagged: pf ? J(pf).map((x) => x.disease) : null }));
  const counts = Object.fromEntries(all('SELECT status, COUNT(*) c FROM xray_studies GROUP BY status').map((r) => [r.status, r.c]));
  const appts = all(`SELECT a.*, p.full_name patient_name, d.full_name doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id WHERE a.status='SCHEDULED' ORDER BY appointment_date, appointment_time LIMIT 6`);
  const patients = get('SELECT COUNT(*) c FROM patients').c;
  const recentAudit = u.role === 'ADMIN' ? all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 6') : [];
  res.json({ queue, counts, appointments: appts, patients, recentAudit });
});

// ---------- patients ----------
app.get('/api/patients', auth, roles('DOCTOR', 'ADMIN'), (_req, res) => {
  res.json(all(`SELECT p.*, (SELECT COUNT(*) FROM xray_studies WHERE patient_id=p.id) study_count FROM patients p ORDER BY p.full_name`));
});
app.post('/api/patients', auth, roles('DOCTOR', 'ADMIN'), wrap((req, res) => {
  const b = req.body || {};
  const fullName = b.full_name?.trim();
  const mrn = b.mrn?.trim();
  const age = Number(b.age);
  const gender = b.gender;
  
  if (!fullName || !mrn || !Number.isFinite(age) || age < 0 || age > 150 || !gender) {
    return res.status(400).json({ error: 'Valid full name, MRN, age (0-150) and gender are required.' });
  }
  
  if (get('SELECT 1 FROM patients WHERE mrn = ?', mrn)) {
    return res.status(409).json({ error: 'A patient with this Medical Record Number (MRN) already exists.' });
  }

  // Determine username
  let username = b.username?.trim().toLowerCase();
  if (!username) {
    username = `patient.${mrn.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  }
  if (!/^[a-z0-9._-]{3,48}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-48 characters and contain only letters, numbers, dots, underscores or hyphens.' });
  }
  if (get('SELECT 1 FROM users WHERE username = ?', username)) {
    return res.status(409).json({ error: `Username '${username}' is already in use. Please specify a distinct username.` });
  }

  // Determine email
  let email = b.email?.trim().toLowerCase();
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format.' });
    }
  } else {
    email = `${username}@patient.chestx.local`;
  }
  if (get('SELECT 1 FROM users WHERE email = ?', email)) {
    return res.status(409).json({ error: `Email '${email}' is already registered.` });
  }

  // Determine initial password
  const customPassword = b.password?.trim();
  let initialPassword = customPassword;
  let isAutoPassword = false;
  if (customPassword) {
    if (customPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
  } else {
    isAutoPassword = true;
    initialPassword = crypto.randomBytes(6).toString('hex'); // 12-char secure temporary password
  }

  // Atomic transaction
  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const hashed = hashPassword(initialPassword);
    const userRes = run(
      'INSERT INTO users (username, email, password_hash, role, full_name, is_active, created_at) VALUES (?,?,?,?,?,1,?)',
      username, email, hashed, 'PATIENT', fullName, now()
    );
    const userId = Number(userRes.lastInsertRowid);

    const patRes = run(
      `INSERT INTO patients (user_id, mrn, full_name, age, gender, blood_group, contact_phone, emergency_contact, medical_history_notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      userId, mrn, fullName, age, gender, b.blood_group || 'Unknown', b.contact_phone || '', b.emergency_contact || '', b.medical_history_notes || '', now()
    );
    const patientId = Number(patRes.lastInsertRowid);

    audit(req.user, 'CREATE_PATIENT', 'Patient', patientId, `Provisioned user ID ${userId} for MRN ${mrn}`, ip(req));
    db.exec('COMMIT');

    res.status(201).json({
      id: patientId,
      user_id: userId,
      mrn,
      full_name: fullName,
      username,
      email,
      temporary_password: isAutoPassword ? initialPassword : undefined
    });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}));
app.get('/api/patients/:id', auth, roles('DOCTOR', 'ADMIN'), (req, res) => {
  const p = get('SELECT * FROM patients WHERE id = ?', Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Patient not found.' });
  const studies = all('SELECT id FROM xray_studies WHERE patient_id=? ORDER BY study_date DESC', p.id).map((r) => loadStudy(r.id));
  const appointments = all(`SELECT a.*, d.full_name doctor_name FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE patient_id=? ORDER BY appointment_date DESC`, p.id);
  res.json({ patient: p, studies, appointments });
});

// ---------- doctors ----------
app.get('/api/doctors', auth, (_req, res) => res.json(all('SELECT * FROM doctors ORDER BY full_name')));

// ---------- studies ----------
app.get('/api/studies', auth, (req, res) => {
  const u = req.user;
  const pid = u.role === 'PATIENT' ? u.patient_id : (req.query.patient_id ? Number(req.query.patient_id) : null);
  const rows = all(`SELECT s.id FROM xray_studies s ${pid ? 'WHERE s.patient_id = ?' : ''} ORDER BY s.study_date DESC`, ...(pid ? [pid] : []));
  res.json(rows.map((r) => forUser(loadStudy(r.id), u)).filter(Boolean));
});
app.get('/api/studies/:id', auth, (req, res) => { const s = studyOr404(req, res); if (s) res.json(s); });

app.get('/api/studies/:id/image', auth, (req, res) => {
  if (!studyOr404(req, res)) return;
  const file = resolveImage(get('SELECT image_path FROM xray_studies WHERE id=?', Number(req.params.id)).image_path);
  file ? res.sendFile(file) : res.status(404).json({ error: 'Image file is missing on disk.' });
});

app.post('/api/studies', auth, roles('DOCTOR', 'ADMIN'), upload.single('image'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a radiograph to upload.' });
  const pid = Number(req.body.patient_id);
  if (!get('SELECT 1 FROM patients WHERE id=?', pid)) return res.status(400).json({ error: 'Choose a patient first.' });
  const uid = `STD-${Date.now()}`;
  const safe = req.file.originalname.replace(/[^\w.\-]+/g, '_');
  const stored = `study_${pid}_${Date.now()}_${safe}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), req.file.buffer);
  const r = run(`INSERT INTO xray_studies (patient_id, doctor_id, study_uid, study_date, study_type, image_path, original_filename, status, notes, created_at) VALUES (?,?,?,?,?,?,?,'PENDING_ANALYSIS',?,?)`,
    pid, req.user.doctor_id, uid, now(), req.body.study_type || 'Chest Radiograph (PA/AP)', path.join('outputs', 'uploads', stored), safe, req.body.notes || '', now());
  const id = Number(r.lastInsertRowid);
  audit(req.user, 'UPLOAD_XRAY', 'XRayStudy', id, safe, ip(req));
  let warning = null;
  try { await analyze(id, req.user, req); } catch (e) { warning = e.message; }
  res.status(201).json({ id, warning });
}));

app.post('/api/studies/:id/analyze', auth, roles('DOCTOR', 'ADMIN'), wrap(async (req, res) => {
  const s = loadStudy(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Study not found.' });
  if (s.status === 'FINALIZED') {
    return res.status(403).json({ error: 'Cannot re-analyze a finalized study. The clinical report and associated model findings are locked.' });
  }
  await analyze(Number(req.params.id), req.user, req);
  res.json(loadStudy(Number(req.params.id)));
}));

app.post('/api/studies/:id/gradcam', auth, roles('DOCTOR', 'ADMIN'), wrap(async (req, res) => {
  const row = get('SELECT * FROM xray_studies WHERE id=?', Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Study not found.' });
  const { disease, alpha = 0.45, colormap = 'jet', invert = false } = req.body || {};
  if (!CLASSES.includes(disease)) return res.status(400).json({ error: 'Unknown finding.' });
  const file = resolveImage(row.image_path);
  if (!file) return res.status(404).json({ error: 'Image file is missing on disk.' });
  const out = await ml('/gradcam', { buffer: fs.readFileSync(file), filename: row.original_filename,
    fields: { disease, alpha: Math.min(Math.max(Number(alpha), 0), 1), colormap, invert: invert ? '1' : '0' } });
  audit(req.user, 'GRADCAM', 'XRayStudy', row.id, disease, ip(req));
  res.json(out);
}));

// ---------- report ----------
app.put('/api/studies/:id/report', auth, roles('DOCTOR'), wrap((req, res) => {
  const id = Number(req.params.id);
  const study = loadStudy(id);
  if (!study) return res.status(404).json({ error: 'Study not found.' });

  // DEF-002: Reject modification or downgrade of already finalized reports
  const existingReport = get('SELECT id, is_draft, finalized_at FROM doctor_reports WHERE study_id = ?', id);
  if (existingReport && !existingReport.is_draft) {
    return res.status(403).json({
      error: 'This clinical report is already finalized and signed by a physician. Finalized reports are immutable and cannot be modified or downgraded. File an audited amendment instead if corrections are required.',
      finalized_at: existingReport.finalized_at
    });
  }

  const b = req.body || {};
  const draft = !!b.is_draft;
  if (!draft && !b.final_impression?.trim()) {
    return res.status(400).json({ error: 'A final impression is required to sign off and finalize the report.' });
  }

  const vals = [
    req.user.doctor_id,
    b.clinical_findings_text || '',
    JSON.stringify(b.confirmed || []),
    JSON.stringify(b.rejected || []),
    JSON.stringify(b.added || []),
    b.final_impression || '',
    b.doctor_notes || '',
    b.recommendation || '',
    draft ? 1 : 0,
    draft ? null : now(),
    now()
  ];

  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const cur = get('SELECT id, is_draft, finalized_at FROM doctor_reports WHERE study_id = ?', id);
    if (cur && !cur.is_draft) {
      db.exec('ROLLBACK');
      return res.status(403).json({
        error: 'This clinical report is already finalized and signed by a physician. Finalized reports are immutable and cannot be modified or downgraded. File an audited amendment instead if corrections are required.',
        finalized_at: cur.finalized_at
      });
    }
    if (cur) {
      run(`UPDATE doctor_reports SET doctor_id=?, clinical_findings_text=?, confirmed_findings_json=?, rejected_findings_json=?, added_findings_json=?, final_impression=?, doctor_notes=?, recommendation=?, is_draft=?, finalized_at=?, updated_at=? WHERE study_id=?`, ...vals, id);
    } else {
      run(`INSERT INTO doctor_reports (doctor_id, clinical_findings_text, confirmed_findings_json, rejected_findings_json, added_findings_json, final_impression, doctor_notes, recommendation, is_draft, finalized_at, created_at, updated_at, study_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals.slice(0, 10), now(), now(), id);
    }
    run('UPDATE xray_studies SET status=?, doctor_id=? WHERE id=?', draft ? 'IN_REVIEW' : 'FINALIZED', req.user.doctor_id, id);
    audit(req.user, draft ? 'REPORT_DRAFT' : 'REPORT_FINALIZE', 'XRayStudy', id, draft ? 'Draft saved' : 'Report finalized and locked', ip(req));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.json(loadStudy(id));
}));

app.post('/api/studies/:id/report/amend', auth, roles('DOCTOR'), wrap((req, res) => {
  const id = Number(req.params.id);
  const study = loadStudy(id);
  if (!study) return res.status(404).json({ error: 'Study not found.' });

  const rep = get('SELECT * FROM doctor_reports WHERE study_id = ?', id);
  if (!rep || rep.is_draft) {
    return res.status(400).json({ error: 'Only finalized reports can receive an amendment.' });
  }
  const { amendment_text = '', reason = '' } = req.body || {};
  if (!amendment_text.trim()) {
    return res.status(400).json({ error: 'Amendment text is required.' });
  }
  const timestamp = now();
  const amendmentHeader = `\n\n--- [ADDENDUM / AMENDMENT ${timestamp} by ${req.user.full_name} (${req.user.username})] ---`;
  const amendmentReason = reason.trim() ? `\nReason: ${reason.trim()}` : '';
  const amendmentEntry = `${amendmentHeader}${amendmentReason}\n${amendment_text.trim()}`;

  const updatedClinical = (rep.clinical_findings_text || '') + amendmentEntry;
  const updatedImpression = (rep.final_impression || '') + `\n[AMENDMENT ${timestamp}]: ${amendment_text.trim()}`;

  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    run('UPDATE doctor_reports SET clinical_findings_text = ?, final_impression = ?, updated_at = ? WHERE id = ?',
      updatedClinical, updatedImpression, timestamp, rep.id);
    audit(req.user, 'REPORT_AMENDMENT', 'XRayStudy', id, `Amendment filed: ${reason.trim() || 'No reason specified'}`, ip(req));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.json(loadStudy(id));
}));

app.get('/api/studies/:id/report.md', auth, (req, res) => {
  const s = studyOr404(req, res);
  if (!s) return;

  // DEF-004: Patients must NEVER access draft, unsigned, or unreleased reports
  if (req.user.role === 'PATIENT') {
    if (!s.report || s.report.is_draft) {
      return res.status(403).json({
        error: 'Access denied. This clinical report is currently in draft / awaiting physician review and sign-off. Reports are released to patients only after physician finalization.'
      });
    }
  }

  const isFinal = s.report && !s.report.is_draft;
  const L = [
    `# CHEST-X AI REPORT`,
    '',
    isFinal ? `**STATUS:** FINAL — Signed and authorized by ${s.report.doctor_name} on ${s.report.finalized_at || s.report.updated_at}` : '**STATUS:** PRELIMINARY AI-ASSISTED DRAFT. Requires physician review and sign-off.',
    '',
    `## Patient Information`,
    `- Name: ${s.patient_name}`,
    `- Medical Record Number (MRN): ${s.mrn}`,
    `- Age / Sex: ${s.age} / ${s.gender}`,
    `- Blood Group: ${s.blood_group || 'Unknown'}`,
    '',
    `## Study Information`,
    `- Type: ${s.study_type}`,
    `- Study UID: ${s.study_uid}`,
    `- Acquisition / Upload Date: ${s.study_date}`,
    ''
  ];
  if (s.prediction) {
    L.push('## Model Findings (Relative Softmax Ranking Scores)');
    L.push(...(s.prediction.primary.length ? s.prediction.primary.map((f) => `- ${f.disease.replace('_', ' ')}: model score ${f.score_pct}% (${f.status}, reporting threshold: ${f.threshold_pct}%)`) : ['- No finding exceeded its reporting threshold.']), '');
    L.push('*Notice: The neural network uses a 14-class Softmax head. Model scores represent a relative ranking distribution rather than independent calibrated presence probabilities.*', '');
  }
  if (s.report) {
    L.push(
      '## Attending Physician Clinical Review',
      `- Attending Physician: ${s.report.doctor_name}`,
      `- Confirmed Findings: ${s.report.confirmed.join(', ') || 'None'}`,
      `- Rejected AI Findings: ${s.report.rejected.join(', ') || 'None'}`,
      `- Additional Clinical Findings: ${s.report.added.join(', ') || 'None'}`,
      '',
      `### Final Impression`,
      `${s.report.final_impression}`,
      '',
      `### Recommendation`,
      `${s.report.recommendation || 'Clinical correlation recommended.'}`,
      ''
    );
    if (s.report.clinical_findings_text) {
      L.push(`### Detailed Findings & Notes`, `${s.report.clinical_findings_text}`, '');
    }
  }
  L.push('---', `*${DISCLAIMER}*`);
  res.set({
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Disposition': `attachment; filename="${s.study_uid}-report.md"`
  }).send(L.join('\n'));
});

app.get('/api/studies/:id/report.pdf', auth, (req, res) => {
  const s = loadStudy(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Study not found.' });

  // DEF-004: Role and draft isolation check
  if (req.user.role === 'PATIENT') {
    if (s.patient_id !== req.user.patient_id) {
      return res.status(403).json({ error: 'Access denied. You cannot access reports for other patients.' });
    }
    if (!s.report || s.report.is_draft) {
      return res.status(403).json({
        error: 'Report is not finalized yet. Preliminary draft reports are not released to patients until reviewed and signed by a physician.'
      });
    }
  }

  const safeName = (s.patient_name || 'Patient').replace(/[^\w\-]+/g, '_');
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${safeName}_${s.study_uid}_Report.pdf"`
  });
  generateStudyReportPdf(s, res);
});

// ---------- compare ----------
app.get('/api/compare', auth, roles('DOCTOR', 'ADMIN'), (req, res) => {
  const idA = Number(req.query.a);
  const idB = Number(req.query.b);
  if (!idA || !idB || isNaN(idA) || isNaN(idB)) {
    return res.status(400).json({ error: 'Two study IDs (query parameters ?a=...&b=...) are required for comparison.' });
  }
  if (idA === idB) {
    return res.status(400).json({ error: 'Cannot compare a study with itself. Please select two distinct studies.' });
  }
  const studyA = loadStudy(idA);
  const studyB = loadStudy(idB);
  if (!studyA || !studyB) {
    return res.status(404).json({ error: 'One or both of the requested studies could not be found.' });
  }
  // DEF-005: Reject cross-patient comparisons
  if (studyA.patient_id !== studyB.patient_id) {
    return res.status(400).json({
      error: `Cross-patient comparison rejected. Study ${studyA.study_uid} (Patient: ${studyA.patient_name}) and Study ${studyB.study_uid} (Patient: ${studyB.patient_name}) belong to different patients.`
    });
  }
  if (!studyA.prediction || !studyB.prediction) {
    return res.status(400).json({ error: 'Both studies must have completed AI analyses before they can be compared.' });
  }

  // Sort chronologically (earlier study = previous, later study = current)
  const timeA = new Date(studyA.study_date || 0).getTime();
  const timeB = new Date(studyB.study_date || 0).getTime();
  const [earlier, later] = timeA <= timeB ? [studyA, studyB] : [studyB, studyA];

  const pEarlier = Object.fromEntries(earlier.prediction.scores.map((x) => [x.disease, x.score_pct]));
  const rows = later.prediction.scores.map((x) => ({
    disease: x.disease,
    previous: pEarlier[x.disease] ?? 0,
    current: x.score_pct,
    delta: +(x.score_pct - (pEarlier[x.disease] ?? 0)).toFixed(2)
  }));

  const versionMismatch = earlier.prediction.model_version !== later.prediction.model_version;
  const warning = versionMismatch
    ? `Studies were evaluated with different model versions (${earlier.prediction.model_version} vs ${later.prediction.model_version}). Comparative score shifts should be interpreted with caution.`
    : null;

  res.json({
    previous: earlier,
    current: later,
    rows,
    model_version_mismatch: versionMismatch,
    warning
  });
});

// ---------- appointments ----------
app.get('/api/appointments', auth, (req, res) => {
  const u = req.user;
  const where = u.role === 'PATIENT' ? 'WHERE a.patient_id = ' + Number(u.patient_id) : u.role === 'DOCTOR' && u.doctor_id ? 'WHERE a.doctor_id = ' + Number(u.doctor_id) : '';
  res.json(all(`SELECT a.*, p.full_name patient_name, p.mrn, d.full_name doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id ${where} ORDER BY appointment_date, appointment_time`));
});
app.post('/api/appointments', auth, wrap((req, res) => {
  const b = req.body || {};
  const pid = req.user.role === 'PATIENT' ? req.user.patient_id : Number(b.patient_id);
  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    if (get(`SELECT 1 FROM appointments WHERE doctor_id=? AND appointment_date=? AND appointment_time=? AND status='SCHEDULED'`, Number(b.doctor_id), b.appointment_date, b.appointment_time)) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'That doctor time slot is already booked. Pick another time.' });
    }
    if (get(`SELECT 1 FROM appointments WHERE patient_id=? AND appointment_date=? AND appointment_time=? AND status='SCHEDULED'`, pid, b.appointment_date, b.appointment_time)) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'This patient already has an active appointment scheduled at this date and time.' });
    }
    const r = run(`INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, reason, status, notes, created_at) VALUES (?,?,?,?,?,'SCHEDULED',?,?)`,
      pid, Number(b.doctor_id), b.appointment_date, b.appointment_time, b.reason || 'Chest Radiograph Clinical Follow-Up', b.notes || '', now());
    audit(req.user, 'BOOK_APPOINTMENT', 'Appointment', r.lastInsertRowid, '', ip(req));
    db.exec('COMMIT');
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}));
app.patch('/api/appointments/:id', auth, wrap((req, res) => {
  const st = req.body?.status;
  if (!['COMPLETED', 'CANCELLED'].includes(st)) return res.status(400).json({ error: 'Invalid status.' });
  const a = get('SELECT * FROM appointments WHERE id=?', Number(req.params.id));
  if (!a || (req.user.role === 'PATIENT' && a.patient_id !== req.user.patient_id)) return res.status(404).json({ error: 'Appointment not found.' });
  if (req.user.role === 'PATIENT' && st !== 'CANCELLED') return res.status(403).json({ error: 'Patients can only cancel.' });
  run('UPDATE appointments SET status=? WHERE id=?', st, a.id);
  audit(req.user, 'APPOINTMENT_' + st, 'Appointment', a.id, '', ip(req));
  res.json({ ok: true });
}));

// ---------- assistant (grounded, deterministic; same rules as the original) ----------
app.post('/api/assistant', auth, roles('DOCTOR', 'ADMIN'), (req, res) => {
  const q = String(req.body?.question || '').toLowerCase().trim();
  const p = get('SELECT * FROM patients WHERE id=?', Number(req.body?.patient_id));
  const studies = p ? all('SELECT id FROM xray_studies WHERE patient_id=? ORDER BY study_date DESC', p.id).map((r) => loadStudy(r.id)) : [];
  const day = (s) => String(s.study_date).slice(0, 10);
  let a;
  if (/summar|history|timeline|overview/.test(q)) {
    a = !p ? 'No patient selected. Choose a patient to inspect their imaging history.' : [
      `**Imaging summary for ${p.full_name} (${p.mrn})**`, `- ${p.age} years, ${p.gender}, blood group ${p.blood_group}`, `- Baseline notes: ${p.medical_history_notes || 'none on file'}`, `- Studies on record: ${studies.length}`,
      ...studies.map((s, i) => `${i + 1}. ${day(s)} · ${s.study_type} (${s.study_uid}) · ${s.status} · AI: ${s.prediction ? (s.prediction.primary.length ? s.prediction.primary.length + ' above threshold' : 'none above threshold') : 'not run'} · ${s.report && !s.report.is_draft ? 'Signed: ' + s.report.final_impression : 'not signed'}`)].join('\n');
  } else if (/recent findings|ai findings|prediction|scores|last study|latest/.test(q)) {
    const s = studies[0];
    a = !s ? 'Insufficient information in the available record: no studies for this patient.'
      : !s.prediction ? `Study ${s.study_uid} (${day(s)}) has not been analysed yet.`
      : [`**Model findings for ${s.study_uid} (${day(s)})**`, ...(s.prediction.primary.length ? s.prediction.primary.map((f) => `- ${f.disease.replace('_', ' ')}: ${f.score_pct.toFixed(1)}% (${f.status}, threshold ${f.threshold_pct}%)`) : ['- No finding exceeded its reporting threshold.']),
        `\n_${s.prediction.inference_time_ms.toFixed(0)} ms, ${s.prediction.model_version}._`].join('\n');
  } else {
    const k = Object.keys(KB).find((t) => q.includes(t));
    a = k ? `**Clinical reference: ${k}**\n\n${KB[k]}\n\n_Always correlate imaging with the clinical presentation._`
      : '**Insufficient information in the available record.**\n\nThis assistant answers only from stored patient records, saved model output and the built-in reference notes. It does not guess.';
  }
  res.json({ answer: a });
});

// ---------- performance / dataset ----------
app.get('/api/performance', auth, (_req, res) => res.json({
  images: [{ file: 'deep_trained_model.png', title: 'Deep model: ROC curves per finding' }, { file: 'quick_trained_model.png', title: 'Quick baseline: ROC curves per finding' }]
    .filter((i) => fs.existsSync(path.join(ROOT, 'results', i.file))),
  architecture: [
    ['Architecture', 'DenseNet-121 (TorchXRayVision densenet121-res224-all)'],
    ['Input Dimensions', '224 × 224 × 1 grayscale, normalized [-1024, 1024]'],
    ['Feature Backbone', 'DenseBlocks 1-4 with Transition Layers and BatchNorm'],
    ['Output Head', 'Multi-label Independent Sigmoid (14 NIH findings + 4 multi-dataset heads)'],
    ['Decision Bounds', 'Per-pathology operating thresholds (op_threshs)'],
    ['Grad-CAM Target', 'features.denseblock4 (pre-sigmoid logit attribution)']
  ],
}));
app.use('/results', express.static(path.join(ROOT, 'results')));

// ---------- admin ----------
app.get('/api/admin/users', auth, roles('ADMIN'), (_r, res) => res.json(all('SELECT id, username, email, role, full_name, is_active, created_at FROM users ORDER BY id')));
app.post('/api/admin/users', auth, roles('ADMIN'), wrap((req, res) => {
  const b = req.body || {};
  if (!b.username || !b.email || !b.full_name || !b.password || !['ADMIN', 'DOCTOR', 'PATIENT'].includes(b.role)) return res.status(400).json({ error: 'All fields are required.' });
  if (b.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (get('SELECT 1 FROM users WHERE username=? OR email=?', b.username, b.email)) return res.status(409).json({ error: 'Username or email already exists.' });
  const uid = Number(run('INSERT INTO users (username,email,password_hash,role,full_name,is_active,created_at) VALUES (?,?,?,?,?,1,?)', b.username, b.email, hashPassword(b.password), b.role, b.full_name, now()).lastInsertRowid);
  if (b.role === 'DOCTOR') run(`INSERT INTO doctors (user_id,full_name,specialization,qualification,is_demo,created_at) VALUES (?,?,?,?,0,?)`, uid, b.full_name, b.specialization || 'Radiology', b.qualification || 'MD', now());
  audit(req.user, 'CREATE_USER', 'User', uid, b.role, ip(req));
  res.status(201).json({ id: uid });
}));
app.patch('/api/admin/users/:id', auth, roles('ADMIN'), wrap((req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  run('UPDATE users SET is_active=? WHERE id=?', req.body?.is_active ? 1 : 0, id);
  audit(req.user, req.body?.is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'User', id, '', ip(req));
  res.json({ ok: true });
}));
app.get('/api/admin/audit', auth, roles('ADMIN'), (_r, res) => res.json(all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200')));
app.get('/api/admin/health', auth, roles('ADMIN'), wrap(async (_r, res) => {
  let dbOk = false;
  try { dbOk = get('SELECT 1 ok')?.ok === 1; } catch {}
  let mlh = { ok: false, error: 'AI service unreachable' };
  try { mlh = await (await fetch(ML_URL + '/health', { signal: AbortSignal.timeout(3000) })).json(); } catch { /* offline */ }
  res.json({ api: true, database: dbOk, ml: mlh });
}));

// ---------- static client (production) + errors ----------
const dist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}
app.use('/api', (_q, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : (err.name === 'MulterError' ? 400 : 500));
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image is larger than 15 MB.' : err.message || 'Something went wrong.' });
});
app.listen(PORT, () => console.log(`Chest-X AI API on http://localhost:${PORT}`));
