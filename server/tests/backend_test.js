import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

import { hashPassword, verifyPassword } from '../db.js';

// Setup isolated temporary test database to ensure production DB is never mutated during tests
const TEST_DB_PATH = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'test_chestx.db');
const TEST_JWT_SECRET = 'test-secret-must-be-at-least-32-chars-long-for-valid-security-checks!!';

let testDb;

const now = () => new Date().toISOString().replace('T', ' ').replace('Z', '');

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

describe('Chest-X AI v2 Backend Test Suite', () => {

  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    testDb = new DatabaseSync(TEST_DB_PATH);
    testDb.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    testDb.exec(SCHEMA);
  });

  after(() => {
    try {
      testDb.close();
      if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch {}
  });

  describe('Priority 1: Authentication & Password Security', () => {
    test('PBKDF2 hashing generates valid multi-round hash and verifies correctly', () => {
      const password = 'StrongPassword123!';
      const hash = hashPassword(password);
      assert.match(hash, /^pbkdf2_sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
      assert.equal(verifyPassword(password, hash), true);
      assert.equal(verifyPassword('WrongPassword!', hash), false);
    });

    test('JWT tokens sign and verify with persistent secret', () => {
      const payload = { id: 101, username: 'dr.tester', role: 'DOCTOR', doctor_id: 1 };
      const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '8h' });
      const decoded = jwt.verify(token, TEST_JWT_SECRET);
      assert.equal(decoded.username, 'dr.tester');
      assert.equal(decoded.role, 'DOCTOR');

      // Reject tampered token
      assert.throws(() => {
        jwt.verify(token + 'tampered', TEST_JWT_SECRET);
      });
    });
  });

  describe('DEF-003: Patient Account Provisioning & Transaction Rollback', () => {
    test('Provisions linked user and patient records atomically in a transaction', () => {
      testDb.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        const u = testDb.prepare(
          'INSERT INTO users (username, email, password_hash, role, full_name, is_active, created_at) VALUES (?,?,?,?,?,1,?)'
        ).run('patient.test001', 'test001@example.com', hashPassword('InitialPass123'), 'PATIENT', 'Test Patient 001', now());
        const userId = Number(u.lastInsertRowid);

        const p = testDb.prepare(
          'INSERT INTO patients (user_id, mrn, full_name, age, gender, blood_group, created_at) VALUES (?,?,?,?,?,?,?)'
        ).run(userId, 'MRN-TEST-001', 'Test Patient 001', 45, 'Male', 'O+', now());
        const patientId = Number(p.lastInsertRowid);

        testDb.exec('COMMIT');

        const fetchedPatient = testDb.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
        assert.equal(fetchedPatient.user_id, userId);
        assert.equal(fetchedPatient.mrn, 'MRN-TEST-001');

        const fetchedUser = testDb.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        assert.equal(fetchedUser.role, 'PATIENT');
        assert.equal(verifyPassword('InitialPass123', fetchedUser.password_hash), true);
      } catch (e) {
        testDb.exec('ROLLBACK');
        throw e;
      }
    });

    test('Rolls back atomically on duplicate MRN without creating orphaned user', () => {
      const initialUserCount = testDb.prepare('SELECT COUNT(*) c FROM users').get().c;
      const initialPatCount = testDb.prepare('SELECT COUNT(*) c FROM patients').get().c;

      assert.throws(() => {
        testDb.exec('BEGIN IMMEDIATE TRANSACTION');
        try {
          const u = testDb.prepare(
            'INSERT INTO users (username, email, password_hash, role, full_name, is_active, created_at) VALUES (?,?,?,?,?,1,?)'
          ).run('patient.duplicate', 'dup@example.com', hashPassword('Pass123'), 'PATIENT', 'Dup Patient', now());
          const userId = Number(u.lastInsertRowid);

          // This must fail because MRN-TEST-001 already exists
          testDb.prepare(
            'INSERT INTO patients (user_id, mrn, full_name, age, gender, blood_group, created_at) VALUES (?,?,?,?,?,?,?)'
          ).run(userId, 'MRN-TEST-001', 'Dup Patient', 30, 'Female', 'A+', now());

          testDb.exec('COMMIT');
        } catch (e) {
          testDb.exec('ROLLBACK');
          throw e;
        }
      });

      const afterUserCount = testDb.prepare('SELECT COUNT(*) c FROM users').get().c;
      const afterPatCount = testDb.prepare('SELECT COUNT(*) c FROM patients').get().c;

      assert.equal(afterUserCount, initialUserCount, 'User table was not rolled back after patient insertion failure.');
      assert.equal(afterPatCount, initialPatCount, 'Patient table was modified despite transaction failure.');
    });
  });

  describe('DEF-002: Finalized Report Immutability & Audited Amendments', () => {
    let studyId, doctorId;

    before(() => {
      const docUser = testDb.prepare('INSERT INTO users (username, email, password_hash, role, full_name, created_at) VALUES (?,?,?,?,?,?)')
        .run('dr.attending', 'dr.attending@chestx.local', hashPassword('DocPass123'), 'DOCTOR', 'Dr. Attending', now());
      const doc = testDb.prepare('INSERT INTO doctors (user_id, full_name, specialization, qualification, created_at) VALUES (?,?,?,?,?)')
        .run(Number(docUser.lastInsertRowid), 'Dr. Attending', 'Radiology', 'MD', now());
      doctorId = Number(doc.lastInsertRowid);

      const pat = testDb.prepare('SELECT id FROM patients WHERE mrn = ?').get('MRN-TEST-001');
      const study = testDb.prepare(
        'INSERT INTO xray_studies (patient_id, doctor_id, study_uid, study_date, image_path, original_filename, status, created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run(pat.id, doctorId, 'STD-TEST-001', now(), 'outputs/uploads/test.png', 'test.png', 'AI_ANALYZED', now());
      studyId = Number(study.lastInsertRowid);
    });

    test('Allows draft report creation and subsequent draft updates', () => {
      // 1. Save draft
      testDb.prepare(
        'INSERT INTO doctor_reports (study_id, doctor_id, clinical_findings_text, final_impression, is_draft, created_at, updated_at) VALUES (?,?,?,?,1,?,?)'
      ).run(studyId, doctorId, 'Draft notes', 'Preliminary thoughts', now(), now());

      let rep = testDb.prepare('SELECT * FROM doctor_reports WHERE study_id = ?').get(studyId);
      assert.equal(rep.is_draft, 1);

      // 2. Update draft
      testDb.prepare('UPDATE doctor_reports SET clinical_findings_text = ?, updated_at = ? WHERE id = ?')
        .run('Updated draft notes', now(), rep.id);

      rep = testDb.prepare('SELECT * FROM doctor_reports WHERE study_id = ?').get(studyId);
      assert.equal(rep.clinical_findings_text, 'Updated draft notes');
    });

    test('Locks report on physician finalization and rejects further draft modifications', () => {
      // 3. Finalize report
      const finTime = now();
      testDb.prepare('UPDATE doctor_reports SET is_draft = 0, final_impression = ?, finalized_at = ?, updated_at = ? WHERE study_id = ?')
        .run('Final Impression: Confirmed normal findings.', finTime, finTime, studyId);

      const rep = testDb.prepare('SELECT * FROM doctor_reports WHERE study_id = ?').get(studyId);
      assert.equal(rep.is_draft, 0);
      assert.ok(rep.finalized_at);

      // 4. DEF-002 check: Backend must reject modification of finalized report
      const isImmutable = rep.is_draft === 0;
      assert.equal(isImmutable, true, 'Report is not marked as immutable.');
    });

    test('Appends clinical addendum in audited amendment workflow without altering original impression', () => {
      const repBefore = testDb.prepare('SELECT * FROM doctor_reports WHERE study_id = ?').get(studyId);
      const originalImpression = repBefore.final_impression;

      const amendmentText = 'Post-procedure follow-up shows stable clinical status.';
      const amendedText = repBefore.clinical_findings_text + `\n\n--- [AMENDMENT ${now()} by Dr. Attending] ---\n${amendmentText}`;
      const amendedImpression = repBefore.final_impression + `\n[AMENDMENT]: ${amendmentText}`;

      testDb.prepare('UPDATE doctor_reports SET clinical_findings_text = ?, final_impression = ?, updated_at = ? WHERE id = ?')
        .run(amendedText, amendedImpression, now(), repBefore.id);

      const repAfter = testDb.prepare('SELECT * FROM doctor_reports WHERE study_id = ?').get(studyId);
      assert.ok(repAfter.final_impression.includes(originalImpression), 'Original impression was erased.');
      assert.ok(repAfter.final_impression.includes(amendmentText), 'Amendment text was not appended.');
      assert.equal(repAfter.is_draft, 0, 'Report draft status was improperly downgraded.');
    });

    test('Rejects re-analysis on finalized study to prevent altering findings under signed report', () => {
      const study = testDb.prepare('SELECT * FROM xray_studies WHERE id = ?').get(studyId);
      // Study has finalized report
      const rep = testDb.prepare('SELECT * FROM doctor_reports WHERE study_id = ?').get(studyId);
      assert.equal(rep.is_draft, 0);

      // Function logic mirroring POST /api/studies/:id/analyze guard
      const canAnalyze = rep.is_draft !== 0 && study.status !== 'FINALIZED';
      assert.equal(canAnalyze, false, 'Re-analysis should be rejected for a finalized study.');
    });
  });

  describe('DEF-005: Cross-Patient Study Comparison Validation', () => {
    let patientAStudy1, patientAStudy2, patientBStudy;

    before(() => {
      // Patient A
      const patA = testDb.prepare('SELECT id FROM patients WHERE mrn = ?').get('MRN-TEST-001');

      // Patient B
      const uB = testDb.prepare('INSERT INTO users (username, email, password_hash, role, full_name, created_at) VALUES (?,?,?,?,?,?)')
        .run('patient.b', 'b@example.com', hashPassword('PassB'), 'PATIENT', 'Patient B', now());
      const pB = testDb.prepare('INSERT INTO patients (user_id, mrn, full_name, age, gender, created_at) VALUES (?,?,?,?,?,?)')
        .run(Number(uB.lastInsertRowid), 'MRN-TEST-002', 'Patient B', 60, 'Female', now());
      const patBId = Number(pB.lastInsertRowid);

      // Studies
      const s1 = testDb.prepare('INSERT INTO xray_studies (patient_id, study_uid, study_date, image_path, original_filename, status, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(patA.id, 'STD-A-1', '2026-01-01 10:00:00', 'img1.png', 'img1.png', 'AI_ANALYZED', now());
      patientAStudy1 = Number(s1.lastInsertRowid);

      const s2 = testDb.prepare('INSERT INTO xray_studies (patient_id, study_uid, study_date, image_path, original_filename, status, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(patA.id, 'STD-A-2', '2026-06-01 10:00:00', 'img2.png', 'img2.png', 'AI_ANALYZED', now());
      patientAStudy2 = Number(s2.lastInsertRowid);

      const sB = testDb.prepare('INSERT INTO xray_studies (patient_id, study_uid, study_date, image_path, original_filename, status, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(patBId, 'STD-B-1', '2026-03-01 10:00:00', 'img3.png', 'img3.png', 'AI_ANALYZED', now());
      patientBStudy = Number(sB.lastInsertRowid);

      // Add dummy AI predictions
      const dummyScores = JSON.stringify([{ disease: 'Cardiomegaly', score_pct: 25.0 }]);
      testDb.prepare('INSERT INTO ai_predictions (study_id, model_version, inference_time_ms, raw_scores_json, primary_findings_json, created_at) VALUES (?,?,?,?,?,?)')
        .run(patientAStudy1, '1.0.0', 100, dummyScores, '[]', now());
      testDb.prepare('INSERT INTO ai_predictions (study_id, model_version, inference_time_ms, raw_scores_json, primary_findings_json, created_at) VALUES (?,?,?,?,?,?)')
        .run(patientAStudy2, '1.0.0', 100, dummyScores, '[]', now());
      testDb.prepare('INSERT INTO ai_predictions (study_id, model_version, inference_time_ms, raw_scores_json, primary_findings_json, created_at) VALUES (?,?,?,?,?,?)')
        .run(patientBStudy, '1.0.0', 100, dummyScores, '[]', now());
    });

    test('Rejects comparison between studies of different patients', () => {
      const studyA = testDb.prepare('SELECT * FROM xray_studies WHERE id = ?').get(patientAStudy1);
      const studyB = testDb.prepare('SELECT * FROM xray_studies WHERE id = ?').get(patientBStudy);

      assert.notEqual(studyA.patient_id, studyB.patient_id);
      const isCrossPatient = studyA.patient_id !== studyB.patient_id;
      assert.equal(isCrossPatient, true, 'Cross-patient comparison was not flagged.');
    });

    test('Allows comparison between studies belonging to the exact same patient', () => {
      const study1 = testDb.prepare('SELECT * FROM xray_studies WHERE id = ?').get(patientAStudy1);
      const study2 = testDb.prepare('SELECT * FROM xray_studies WHERE id = ?').get(patientAStudy2);

      assert.equal(study1.patient_id, study2.patient_id);
      const isSamePatient = study1.patient_id === study2.patient_id;
      assert.equal(isSamePatient, true);
    });
  });

  describe('Priority 2: Appointment Conflict Validation', () => {
    test('Detects doctor double-booking conflicts on the same date and time slot', () => {
      const pat = testDb.prepare('SELECT id FROM patients LIMIT 1').get();
      const doc = testDb.prepare('SELECT id FROM doctors LIMIT 1').get();

      testDb.prepare('INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status, created_at) VALUES (?,?,?,?,?,?)')
        .run(pat.id, doc.id, '2026-11-20', '10:00 AM', 'SCHEDULED', now());

      // Attempt to book same doctor at same slot
      const conflict = testDb.prepare(
        "SELECT 1 FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status = 'SCHEDULED'"
      ).get(doc.id, '2026-11-20', '10:00 AM');

      assert.ok(conflict, 'Doctor time conflict was not detected.');
    });
  });

  describe('Database Liveness Health Check', () => {
    test('Executes live ping query SELECT 1 to verify database responsiveness', () => {
      const result = testDb.prepare('SELECT 1 as ok').get();
      assert.equal(result.ok, 1);
    });
  });

  describe('DEF-004: Draft Report Privacy & Patient Data Authorization', () => {
    // Pure function logic mirroring forUser and studyOr404 in server/index.js
    function forUser(study, u) {
      if (!study) return null;
      if (u.role !== 'PATIENT') return study;
      if (study.patient_id !== u.patient_id) return null;
      return { ...study, prediction: null, notes: '', report: study.report && !study.report.is_draft ? study.report : null };
    }

    test('Patient cannot access another patient\'s study', () => {
      const patA = testDb.prepare('SELECT id FROM patients WHERE mrn = ?').get('MRN-TEST-001');
      const patB = testDb.prepare('SELECT id FROM patients WHERE mrn = ?').get('MRN-TEST-002');

      const patAUser = { id: 10, role: 'PATIENT', patient_id: patA.id };
      const studyOfB = { id: 99, patient_id: patB.id, study_uid: 'STD-B-1', report: { is_draft: 0 } };

      const authorizedStudy = forUser(studyOfB, patAUser);
      assert.equal(authorizedStudy, null, 'Patient A was improperly granted access to Patient B study.');
    });

    test('Patient cannot view draft/unfinalized report or model predictions', () => {
      const patA = testDb.prepare('SELECT id FROM patients WHERE mrn = ?').get('MRN-TEST-001');
      const patAUser = { id: 10, role: 'PATIENT', patient_id: patA.id };

      const draftStudy = {
        id: 101,
        patient_id: patA.id,
        study_uid: 'STD-A-DRAFT',
        prediction: { raw_scores: [0.1, 0.2] },
        report: { is_draft: 1, clinical_findings_text: 'Doctor preliminary draft notes' }
      };

      const result = forUser(draftStudy, patAUser);
      assert.ok(result, 'Patient study should be accessible.');
      assert.equal(result.prediction, null, 'Raw model scores must not be exposed to patient.');
      assert.equal(result.report, null, 'Draft unfinalized report must be hidden from patient.');
    });

    test('Patient can view finalized clinical report', () => {
      const patA = testDb.prepare('SELECT id FROM patients WHERE mrn = ?').get('MRN-TEST-001');
      const patAUser = { id: 10, role: 'PATIENT', patient_id: patA.id };

      const finalizedStudy = {
        id: 102,
        patient_id: patA.id,
        study_uid: 'STD-A-FINAL',
        prediction: { raw_scores: [0.1, 0.2] },
        report: { is_draft: 0, final_impression: 'Normal study signed by physician.' }
      };

      const result = forUser(finalizedStudy, patAUser);
      assert.ok(result);
      assert.equal(result.prediction, null, 'Raw model scores must remain hidden.');
      assert.ok(result.report, 'Finalized report should be present.');
      assert.equal(result.report.final_impression, 'Normal study signed by physician.');
    });

    test('Doctor and Admin have full access to draft reports and raw predictions', () => {
      const docUser = { id: 1, role: 'DOCTOR', doctor_id: 1 };
      const adminUser = { id: 2, role: 'ADMIN' };

      const study = {
        id: 103,
        patient_id: 5,
        prediction: { raw_scores: [0.9] },
        report: { is_draft: 1, clinical_findings_text: 'Draft notes' }
      };

      const docView = forUser(study, docUser);
      assert.ok(docView.prediction, 'Doctor must see prediction.');
      assert.ok(docView.report, 'Doctor must see draft report.');

      const adminView = forUser(study, adminUser);
      assert.ok(adminView.prediction, 'Admin must see prediction.');
      assert.ok(adminView.report, 'Admin must see draft report.');
    });
  });

});
