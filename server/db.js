// SQLite access via Node's built-in node:sqlite (no native build step).
// Reads/writes the SAME chest_x_ai.db file the old Streamlit app used.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envFile); } catch {}
}
export const DB_PATH = process.env.DATABASE_PATH ? path.resolve(ROOT, process.env.DATABASE_PATH) : path.join(ROOT, 'chest_x_ai.db');
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

export const now = () => new Date().toISOString().replace('T', ' ').replace('Z', '');

// ---- PBKDF2 (format identical to the Python app: pbkdf2_sha256$iter$salt$hex)
export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const iter = 100000;
  const hex = crypto.pbkdf2Sync(pw, salt, iter, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iter}$${salt}$${hex}`;
}
export function verifyPassword(pw, stored) {
  const p = String(stored).split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2_sha256') return false;
  const hex = crypto.pbkdf2Sync(pw, p[2], Number(p[1]), 32, 'sha256').toString('hex');
  const a = Buffer.from(hex), b = Buffer.from(p[3]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username VARCHAR(64) NOT NULL UNIQUE, email VARCHAR(128) NOT NULL UNIQUE, password_hash VARCHAR(256) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'PATIENT', full_name VARCHAR(128) NOT NULL, is_active BOOLEAN DEFAULT 1, created_at DATETIME);
CREATE TABLE IF NOT EXISTS patients (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), mrn VARCHAR(32) NOT NULL UNIQUE, full_name VARCHAR(128) NOT NULL, age INTEGER NOT NULL, gender VARCHAR(16) NOT NULL, blood_group VARCHAR(8) DEFAULT 'Unknown', contact_phone VARCHAR(32) DEFAULT '', emergency_contact VARCHAR(64) DEFAULT '', medical_history_notes TEXT DEFAULT '', created_at DATETIME);
CREATE TABLE IF NOT EXISTS doctors (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), full_name VARCHAR(128) NOT NULL, specialization VARCHAR(128) NOT NULL, qualification VARCHAR(128) NOT NULL, experience_years INTEGER DEFAULT 5, hospital_clinic VARCHAR(128) DEFAULT 'General Medical Center', availability_schedule VARCHAR(256) DEFAULT 'Mon-Fri 09:00 - 17:00', profile_image VARCHAR(256) DEFAULT '', is_demo BOOLEAN DEFAULT 1, created_at DATETIME);
CREATE TABLE IF NOT EXISTS xray_studies (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL REFERENCES patients(id), doctor_id INTEGER REFERENCES doctors(id), study_uid VARCHAR(64) NOT NULL UNIQUE, study_date DATETIME, study_type VARCHAR(64) DEFAULT 'Chest Radiograph (PA/AP)', image_path VARCHAR(512) NOT NULL, original_filename VARCHAR(256) NOT NULL, status VARCHAR(32) DEFAULT 'PENDING_ANALYSIS', notes TEXT DEFAULT '', created_at DATETIME);
CREATE TABLE IF NOT EXISTS ai_predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, study_id INTEGER NOT NULL REFERENCES xray_studies(id), model_version VARCHAR(64) NOT NULL, inference_time_ms FLOAT NOT NULL, raw_scores_json TEXT NOT NULL, primary_findings_json TEXT NOT NULL, threshold_used FLOAT DEFAULT 0.5, warning_notes TEXT DEFAULT '', created_at DATETIME);
CREATE TABLE IF NOT EXISTS explanations (id INTEGER PRIMARY KEY AUTOINCREMENT, prediction_id INTEGER NOT NULL REFERENCES ai_predictions(id), finding_name VARCHAR(64) NOT NULL, heatmap_path VARCHAR(512) NOT NULL, overlay_path VARCHAR(512) NOT NULL, activation_layer VARCHAR(64) DEFAULT 'conv2d_5', created_at DATETIME);
CREATE TABLE IF NOT EXISTS doctor_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, study_id INTEGER NOT NULL UNIQUE REFERENCES xray_studies(id), doctor_id INTEGER NOT NULL REFERENCES doctors(id), clinical_findings_text TEXT DEFAULT '', confirmed_findings_json TEXT DEFAULT '[]', rejected_findings_json TEXT DEFAULT '[]', added_findings_json TEXT DEFAULT '[]', final_impression TEXT NOT NULL, doctor_notes TEXT DEFAULT '', recommendation TEXT DEFAULT '', is_draft BOOLEAN DEFAULT 0, finalized_at DATETIME, created_at DATETIME, updated_at DATETIME);
CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL REFERENCES patients(id), doctor_id INTEGER NOT NULL REFERENCES doctors(id), appointment_date VARCHAR(32) NOT NULL, appointment_time VARCHAR(32) NOT NULL, reason VARCHAR(256) DEFAULT 'Chest Radiograph Clinical Follow-Up', status VARCHAR(32) DEFAULT 'SCHEDULED', notes TEXT DEFAULT '', created_at DATETIME);
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), username VARCHAR(64) NOT NULL, role VARCHAR(20) NOT NULL, action VARCHAR(64) NOT NULL, entity VARCHAR(64) NOT NULL, entity_id VARCHAR(64), details TEXT DEFAULT '', ip_address VARCHAR(64) DEFAULT '127.0.0.1', timestamp DATETIME);
`;

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function audit(user, action, entity, entityId, details = '', ip = '127.0.0.1') {
  run(`INSERT INTO audit_logs (user_id, username, role, action, entity, entity_id, details, ip_address, timestamp) VALUES (?,?,?,?,?,?,?,?,?)`,
    user?.id ?? null, user?.username ?? 'system', user?.role ?? 'SYSTEM', action, entity,
    entityId == null ? null : String(entityId), details, ip, now());
}

export function initDb(forceReset = false) {
  if (forceReset) {
    db.exec(`
      DROP TABLE IF EXISTS audit_logs;
      DROP TABLE IF EXISTS appointments;
      DROP TABLE IF EXISTS doctor_reports;
      DROP TABLE IF EXISTS explanations;
      DROP TABLE IF EXISTS ai_predictions;
      DROP TABLE IF EXISTS xray_studies;
      DROP TABLE IF EXISTS doctors;
      DROP TABLE IF EXISTS patients;
      DROP TABLE IF EXISTS users;
    `);
  }
  db.exec(SCHEMA);
  if (!forceReset && get('SELECT COUNT(*) c FROM users').c > 0) return;
  console.log('Seeding clean Indian clinical dataset…');
  const ins = (sql, ...p) => Number(run(sql, ...p).lastInsertRowid);
  const user = (u, e, pw, role, name) => ins(
    'INSERT INTO users (username,email,password_hash,role,full_name,is_active,created_at) VALUES (?,?,?,?,?,1,?)',
    u, e, hashPassword(pw), role, name, now());

  // 1. System Administrator
  user('admin', 'admin@chestx.ai', 'admin123', 'ADMIN', 'System Administrator');

  // 2. Doctors (Indian specialists)
  const docs = [
    ['dr.sharma', 'Dr. Rajesh Sharma, MD, DMRD', 'Chief Thoracic Radiologist', 'MD Radiodiagnosis (AIIMS New Delhi), DMRD', 16, 'All India Institute of Medical Sciences (AIIMS) New Delhi'],
    ['dr.patel', 'Dr. Priya Patel, MBBS, MD', 'Consultant Pulmonologist', 'MD Pulmonary Medicine (KEM Mumbai), FCCP', 11, 'Apollo Hospitals Mumbai'],
  ].map(([u, n, s, q, y, h]) => ins(
    `INSERT INTO doctors (user_id,full_name,specialization,qualification,experience_years,hospital_clinic,availability_schedule,is_demo,created_at) VALUES (?,?,?,?,?,?,?,1,?)`,
    user(u, `${u}@chestx.ai`, 'doctor123', 'DOCTOR', n), n, s, q, y, h, 'Mon-Sat 09:00 - 17:00', now()));

  // 3. Indian Patients (Exactly 3 clean patients)
  const pats = [
    ['patient.aarav', 'Aarav Sharma', 'MRN-IN-1001', 54, 'Male', 'B+', '54-year-old male with chronic smoking history. Presented with persistent productive cough, exertional breathlessness, and low-grade evening fever. Evaluated for lower respiratory tract infection.'],
    ['patient.ananya', 'Ananya Iyer', 'MRN-IN-1002', 62, 'Female', 'O+', '62-year-old female with essential hypertension. Complaining of exertional fatigue, orthopnea, and mild bilateral pedal edema. Referred for cardiothoracic silhouette baseline assessment.'],
    ['patient.rohan', 'Rohan Verma', 'MRN-IN-1003', 38, 'Male', 'A+', '38-year-old male presenting for annual occupational health fitness screening in Bengaluru. Non-smoker, asymptomatic, normal physical examination.'],
  ].map(([u, n, mrn, age, g, bg, h]) => ins(
    `INSERT INTO patients (user_id,mrn,full_name,age,gender,blood_group,medical_history_notes,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    user(u, `${u}@example.com`, 'patient123', 'PATIENT', n), mrn, n, age, g, bg, h, now()));

  // 4. Clinical Studies
  const s1 = ins(
    `INSERT INTO xray_studies (patient_id,doctor_id,study_uid,study_date,study_type,image_path,original_filename,status,notes,created_at) VALUES (?,?,?,?,?,?,?,'FINALIZED',?,?)`,
    pats[0], docs[0], 'STD-2026-001', new Date(Date.now() - 864e5).toISOString().replace('T', ' ').replace('Z', ''), 'Diagnostic Radiograph (PA View)',
    'data/sample_images/sample_04_pneumonia_infiltration.png', 'sample_04_pneumonia_infiltration.png',
    'Cough with purulent sputum for 10 days. Auscultation reveals localized crackles over right lower lobe.', now()
  );

  ins(
    `INSERT INTO xray_studies (patient_id,doctor_id,study_uid,study_date,study_type,image_path,original_filename,status,notes,created_at) VALUES (?,?,?,?,?,?,?,'PENDING_ANALYSIS',?,?)`,
    pats[1], docs[0], 'STD-2026-002', new Date(Date.now() - 2 * 864e5).toISOString().replace('T', ' ').replace('Z', ''), 'Cardiac Silhouette Evaluation (PA View)',
    'data/sample_images/sample_02_cardiomegaly.png', 'sample_02_cardiomegaly.png',
    'Exertional dyspnea and hypertension. Evaluate cardiothoracic ratio.', now()
  );

  ins(
    `INSERT INTO xray_studies (patient_id,doctor_id,study_uid,study_date,study_type,image_path,original_filename,status,notes,created_at) VALUES (?,?,?,?,?,?,?,'PENDING_ANALYSIS',?,?)`,
    pats[2], docs[1], 'STD-2026-003', new Date(Date.now() - 3 * 864e5).toISOString().replace('T', ' ').replace('Z', ''), 'Routine Health Screening (PA View)',
    'data/sample_images/sample_01_normal.png', 'sample_01_normal.png',
    'Annual corporate health fitness checkup. No acute respiratory complaints.', now()
  );

  // 5. Pre-calculated Multi-Label Predictions & Signed Finalized Report for Study 1
  const scores1 = [
    { disease: 'Infiltration', class_idx: 2, probability: 0.122, score_pct: 12.2, threshold: 0.0981, threshold_pct: 9.8, exceeds_threshold: true, status: 'Moderate model score' },
    { disease: 'Pneumonia', class_idx: 8, probability: 0.0426, score_pct: 4.3, threshold: 0.0568, threshold_pct: 5.7, exceeds_threshold: false, status: 'Borderline score' },
    { disease: 'Effusion', class_idx: 7, probability: 0.0061, score_pct: 0.6, threshold: 0.1032, threshold_pct: 10.3, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Consolidation', class_idx: 1, probability: 0.0052, score_pct: 0.5, threshold: 0.0383, threshold_pct: 3.8, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Emphysema', class_idx: 5, probability: 0.0039, score_pct: 0.4, threshold: 0.0022, threshold_pct: 0.2, exceeds_threshold: true, status: 'Moderate model score' },
    { disease: 'Atelectasis', class_idx: 0, probability: 0.0034, score_pct: 0.3, threshold: 0.0742, threshold_pct: 7.4, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Cardiomegaly', class_idx: 10, probability: 0.0030, score_pct: 0.3, threshold: 0.0503, threshold_pct: 5.0, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Mass', class_idx: 12, probability: 0.0018, score_pct: 0.2, threshold: 0.0194, threshold_pct: 1.9, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Edema', class_idx: 4, probability: 0.0011, score_pct: 0.1, threshold: 0.0236, threshold_pct: 2.4, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Nodule', class_idx: 11, probability: 0.0011, score_pct: 0.1, threshold: 0.0240, threshold_pct: 2.4, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Fibrosis', class_idx: 6, probability: 0.0004, score_pct: 0.0, threshold: 0.0101, threshold_pct: 1.0, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Pneumothorax', class_idx: 3, probability: 0.0003, score_pct: 0.0, threshold: 0.0098, threshold_pct: 1.0, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Pleural_Thickening', class_idx: 9, probability: 0.0001, score_pct: 0.0, threshold: 0.0268, threshold_pct: 2.7, exceeds_threshold: false, status: 'Low model score' },
    { disease: 'Hernia', class_idx: 13, probability: 0.0000, score_pct: 0.0, threshold: 0.0429, threshold_pct: 4.3, exceeds_threshold: false, status: 'Low model score' }
  ];
  const primary1 = scores1.filter(s => s.exceeds_threshold);

  ins(
    `INSERT INTO ai_predictions (study_id, model_version, inference_time_ms, raw_scores_json, primary_findings_json, threshold_used, warning_notes, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    s1, '2.0.0-torchxrayvision-densenet121', 68.4, JSON.stringify(scores1), JSON.stringify(primary1), 0.5, '', now()
  );

  ins(
    `INSERT INTO doctor_reports (study_id, doctor_id, clinical_findings_text, confirmed_findings_json, rejected_findings_json, added_findings_json, final_impression, doctor_notes, recommendation, is_draft, finalized_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)`,
    s1, docs[0],
    'Bilateral lung fields demonstrate patchy ill-defined radio-opacities in the right mid-to-lower pulmonary zone consistent with bronchopneumonic infiltration. No overt pneumothorax. Costophrenic sulci appear preserved.',
    JSON.stringify(['Infiltration']), JSON.stringify([]), JSON.stringify(['Right lower lobe consolidation']),
    'Right lower lobe bronchopneumonia with patchy alveolar infiltration. Cardiothoracic silhouette within normal physiological limits.',
    'Initiate oral broad-spectrum antibiotic therapy (Amoxicillin-Clavulanate 625mg PO TID) and supportive mucolytics.',
    'Repeat frontal chest radiograph in 14 days following course of antibiotic therapy or immediately if acute dyspnea worsens.',
    now(), now(), now()
  );

  ins(`INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, reason, status, notes, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    pats[0], docs[0], '2026-10-25', '10:30 AM', 'Post-Pneumonia Clinical Radiograph Review', 'SCHEDULED', 'Review 14-day follow-up film and clinical response.', now());

  audit(null, 'SYSTEM_INIT', 'SYSTEM', 0, 'Clean Indian clinical dataset seeded successfully.');
}

// Old DB stores absolute Windows paths. Resolve by basename inside known folders.
export function resolveImage(stored) {
  const base = String(stored).split(/[\\/]/).pop();
  for (const dir of ['outputs/uploads', 'data/sample_images']) {
    const p = path.join(ROOT, dir, base);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
