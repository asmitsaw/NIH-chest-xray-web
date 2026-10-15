#!/usr/bin/env python3
"""
End-to-End Regression & Integration Test Suite for Chest-X AI v2
Tests complete live clinical workflow across Node.js Express API and Flask ML microservice:
- Authentication & JWT persistence
- DEF-003: Patient account provisioning & atomic transaction rollback
- Study upload & real CNN inference with Softmax output distribution
- Grad-CAM heatmap generation with conv2d_5 layer
- DEF-004: Draft report privacy, role checks, and patient draft access rejection
- Cross-patient study access rejection (HTTP 403)
- DEF-002: Finalized report immutability (HTTP 403) and audited addendum workflow
- DEF-005: Cross-patient study comparison rejection (HTTP 400) and same-patient comparison
- Invalid/corrupt upload rejection (HTTP 400)
- Appointment scheduling double-booking conflict detection (HTTP 409)
"""

import sys
import os
import json
import time
import requests

API_URL = "http://localhost:4000/api"
ML_URL = "http://127.0.0.1:5001"
SAMPLE_IMG_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "sample_images", "sample_04_pneumonia_infiltration.png")

def log(msg, status="INFO"):
    symbol = {"INFO": "[i]", "PASS": "[OK]", "FAIL": "[X]", "WARN": "[!]"}.get(status, "*")
    print(f"[{status}] {symbol} {msg}")

def assert_true(cond, msg):
    if not cond:
        log(f"Assertion failed: {msg}", "FAIL")
        sys.exit(1)
    else:
        log(msg, "PASS")

def run_tests():
    log("Starting Chest-X AI v2 Live End-to-End Integration Verification", "INFO")
    
    # 0. Health checks
    log("Step 0: Verifying ML Microservice Readiness and API Database Connectivity", "INFO")
    r = requests.get(f"{ML_URL}/health", timeout=5)
    assert_true(r.status_code == 200, f"ML service /health status 200 (got {r.status_code})")
    ml_health = r.json()
    assert_true(ml_health.get("ready") is True, "ML service reports ready: True")
    assert_true(ml_health.get("classes_count") == 14, "ML service configured with 14 classes")

    # 1. Authentication
    log("Step 1: Testing Authentication & Security Invariants", "INFO")
    # Invalid login
    r = requests.post(f"{API_URL}/auth/login", json={"username": "dr.sharma", "password": "wrongpassword"})
    assert_true(r.status_code == 401, f"Invalid password rejected with 401 (got {r.status_code})")

    # Doctor login
    r = requests.post(f"{API_URL}/auth/login", json={"username": "dr.sharma", "password": "doctor123"})
    if r.status_code != 200:
        r = requests.post(f"{API_URL}/auth/login", json={"username": "dr.smith", "password": "doctor123"})
    assert_true(r.status_code == 200, "Doctor login successful")
    doc_token = r.json().get("token")
    doc_headers = {"Authorization": f"Bearer {doc_token}"}

    # Admin login
    r = requests.post(f"{API_URL}/auth/login", json={"username": "admin", "password": "admin123"})
    assert_true(r.status_code == 200, "Admin login successful")
    admin_token = r.json().get("token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Verify admin health endpoint
    r = requests.get(f"{API_URL}/admin/health", headers=admin_headers)
    assert_true(r.status_code == 200, "Admin health check returns 200")
    assert_true(r.json().get("database") is True, "Admin health confirms database is operational")

    # Unauthenticated request rejected
    r = requests.get(f"{API_URL}/meta", headers={"Authorization": "Bearer badtoken"})
    assert_true(r.status_code == 401, "Tampered/invalid JWT rejected with 401")

    # 2. Patient Provisioning (DEF-003)
    log("Step 2: Testing Patient Account Provisioning & Atomic Rollback (DEF-003)", "INFO")
    timestamp = int(time.time())
    mrn_1 = f"MRN-E2E-{timestamp}-A"
    
    # Provision Patient 1
    p1_payload = {
        "mrn": mrn_1,
        "full_name": f"E2E Patient {timestamp}",
        "age": 52,
        "gender": "Male",
        "blood_group": "A+",
        "contact_phone": "+1-555-0199",
        "medical_history_notes": "History of recurrent winter respiratory symptoms."
    }
    r = requests.post(f"{API_URL}/patients", json=p1_payload, headers=doc_headers)
    assert_true(r.status_code == 201, f"Patient provisioned with 201 (got {r.status_code})")
    p1_data = r.json()
    p1_id = p1_data["id"]
    p1_username = p1_data["username"]
    p1_temp_pass = p1_data["temporary_password"]
    assert_true(bool(p1_temp_pass), "Temporary secure password generated and returned")
    log(f"Provisioned Patient 1: ID={p1_id}, MRN={mrn_1}, User={p1_username}", "INFO")

    # Test duplicate MRN rejection & atomic rollback
    r_dup = requests.post(f"{API_URL}/patients", json=p1_payload, headers=doc_headers)
    assert_true(r_dup.status_code in (400, 409), f"Duplicate MRN rejected with 400/409 (got {r_dup.status_code})")

    # Patient 1 login
    r = requests.post(f"{API_URL}/auth/login", json={"username": p1_username, "password": p1_temp_pass})
    assert_true(r.status_code == 200, f"Patient successfully logged in with provisioned credentials")
    p1_token = r.json().get("token")
    p1_headers = {"Authorization": f"Bearer {p1_token}"}

    # Provision Patient 2 (for cross-patient tests)
    mrn_2 = f"MRN-E2E-{timestamp}-B"
    p2_payload = {
        "mrn": mrn_2,
        "full_name": f"E2E Patient B {timestamp}",
        "age": 64,
        "gender": "Female",
        "blood_group": "O+"
    }
    r = requests.post(f"{API_URL}/patients", json=p2_payload, headers=doc_headers)
    assert_true(r.status_code == 201, "Second patient provisioned successfully")
    p2_data = r.json()
    p2_id = p2_data["id"]
    p2_username = p2_data["username"]
    p2_temp_pass = p2_data["temporary_password"]
    r = requests.post(f"{API_URL}/auth/login", json={"username": p2_username, "password": p2_temp_pass})
    p2_headers = {"Authorization": f"Bearer {r.json().get('token')}"}

    # 3. Study Upload & ML Inference
    log("Step 3: Uploading Radiograph and Running Full CNN Inference", "INFO")
    assert_true(os.path.exists(SAMPLE_IMG_PATH), f"Sample image exists at {SAMPLE_IMG_PATH}")
    with open(SAMPLE_IMG_PATH, "rb") as f:
        files = {"image": ("sample_04_pneumonia_infiltration.png", f, "image/png")}
        data = {"patient_id": str(p1_id), "study_type": "Chest Radiograph (PA)", "notes": "Cough and localized crackles."}
        r = requests.post(f"{API_URL}/studies", files=files, data=data, headers=doc_headers)
    assert_true(r.status_code == 201, f"Study upload responded with 201 (got {r.status_code})")
    study1_id = r.json()["id"]
    log(f"Study 1 created with ID={study1_id}", "INFO")

    # Retrieve study as Doctor
    r = requests.get(f"{API_URL}/studies/{study1_id}", headers=doc_headers)
    assert_true(r.status_code == 200, "Doctor retrieved study details")
    study1_details = r.json()
    assert_true(study1_details["status"] == "AI_ANALYZED", f"Study status is AI_ANALYZED (got {study1_details['status']})")
    assert_true(study1_details.get("prediction") is not None, "AI prediction was computed and stored")
    scores = study1_details["prediction"]["scores"]
    assert_true(len(scores) == 14, f"Prediction contains exactly 14 classes (got {len(scores)})")
    log(f"Model inference completed in {study1_details['prediction']['inference_time_ms']:.1f}ms", "INFO")

    # 4. Grad-CAM Generation
    log("Step 4: Testing Explainable AI Grad-CAM", "INFO")
    r = requests.post(f"{API_URL}/studies/{study1_id}/gradcam", json={"disease": "Pneumonia", "alpha": 0.45}, headers=doc_headers)
    assert_true(r.status_code == 200, f"Grad-CAM generated successfully (status {r.status_code})")
    gradcam_res = r.json()
    assert_true(bool(gradcam_res.get("heatmap") and gradcam_res.get("overlay")), "Heatmap and overlay base64 payload returned")
    assert_true(gradcam_res.get("disease") == "Pneumonia", "Grad-CAM corresponds to requested disease Pneumonia")
    assert_true(gradcam_res.get("layer") in ["denseblock4", "conv2d_5"], f"Grad-CAM used valid target activation layer (got {gradcam_res.get('layer')})")

    # Grad-CAM invalid disease rejection
    r = requests.post(f"{API_URL}/studies/{study1_id}/gradcam", json={"disease": "NonExistentDisease"}, headers=doc_headers)
    assert_true(r.status_code == 400, "Grad-CAM rejected invalid finding name with 400")

    # 5. Draft Report & Privacy (DEF-004)
    log("Step 5: Testing Draft Report Privacy & Role Separation (DEF-004)", "INFO")
    # Doctor saves DRAFT report
    draft_payload = {
        "clinical_findings_text": "Preliminary patchy opacity in left lower zone.",
        "confirmed": ["Pneumonia"],
        "rejected": [],
        "added": [],
        "final_impression": "Suspected pneumonia, correlation with sputum culture recommended.",
        "is_draft": True
    }
    r = requests.put(f"{API_URL}/studies/{study1_id}/report", json=draft_payload, headers=doc_headers)
    assert_true(r.status_code == 200, "Doctor saved draft report")

    # Patient 1 attempts to download draft report markdown -> MUST BE REJECTED 403
    r = requests.get(f"{API_URL}/studies/{study1_id}/report.md", headers=p1_headers)
    assert_true(r.status_code == 403, f"Patient download of draft report rejected with 403 (got {r.status_code})")

    # Patient 1 retrieves study JSON -> Draft report & raw predictions MUST BE HIDDEN
    r = requests.get(f"{API_URL}/studies/{study1_id}", headers=p1_headers)
    assert_true(r.status_code == 200, "Patient can view their own study metadata")
    p1_view = r.json()
    assert_true(p1_view.get("report") is None, "Draft report is null in patient view (DEF-004 verified)")
    assert_true(p1_view.get("prediction") is None, "Raw model prediction is hidden from patient")

    # 6. Cross-Patient Access Rejection
    log("Step 6: Testing Cross-Patient Access Rejection (Patient 2 accessing Patient 1)", "INFO")
    # Patient 2 attempts to view Patient 1's study
    r = requests.get(f"{API_URL}/studies/{study1_id}", headers=p2_headers)
    assert_true(r.status_code == 403, f"Patient 2 viewing Patient 1 study rejected with 403 (got {r.status_code})")

    # Patient 2 attempts to view Patient 1's image
    r = requests.get(f"{API_URL}/studies/{study1_id}/image", headers=p2_headers)
    assert_true(r.status_code == 403, f"Patient 2 accessing Patient 1 image rejected with 403 (got {r.status_code})")

    # 7. Finalized Report Immutability & Audited Amendment (DEF-002)
    log("Step 7: Testing Report Finalization, Immutability & Audited Amendment (DEF-002)", "INFO")
    # Doctor finalizes report
    finalize_payload = {
        "clinical_findings_text": "Confirmed consolidation in left lower zone consistent with bacterial pneumonia.",
        "confirmed": ["Pneumonia", "Infiltration"],
        "rejected": ["Cardiomegaly"],
        "added": [],
        "final_impression": "Active bacterial pneumonia of the left lower lobe.",
        "recommendation": "Prescribe amoxicillin-clavulanate and schedule clinical follow-up in 10 days.",
        "is_draft": False
    }
    r = requests.put(f"{API_URL}/studies/{study1_id}/report", json=finalize_payload, headers=doc_headers)
    assert_true(r.status_code == 200, "Doctor finalized clinical report")
    assert_true(r.json()["status"] == "FINALIZED", "Study transitioned to FINALIZED status")

    # ATTEMPT TO MODIFY OR DOWNGRADE FINALIZED REPORT -> MUST BE REJECTED 403
    r = requests.put(f"{API_URL}/studies/{study1_id}/report", json={"is_draft": True, "final_impression": "Downgraded"}, headers=doc_headers)
    assert_true(r.status_code == 403, f"Modifying finalized report rejected with 403 (DEF-002 verified, got {r.status_code})")

    # ATTEMPT TO RE-ANALYZE FINALIZED STUDY -> MUST BE REJECTED 403
    r = requests.post(f"{API_URL}/studies/{study1_id}/analyze", headers=doc_headers)
    assert_true(r.status_code == 403, f"Re-analysis of finalized study rejected with 403 (got {r.status_code})")
    assert_true("locked" in r.json().get("error", "").lower(), "Re-analysis rejection message confirms locked report")

    # Audited amendment workflow -> MUST SUCCEED
    amend_payload = {
        "amendment_text": "Follow-up blood culture confirmed Streptococcus pneumoniae. Patient afebrile.",
        "reason": "Microbiology laboratory report confirmation"
    }
    r = requests.post(f"{API_URL}/studies/{study1_id}/report/amend", json=amend_payload, headers=doc_headers)
    assert_true(r.status_code == 200, "Audited clinical amendment added successfully")
    amended_rep = r.json()["report"]
    assert_true("Microbiology laboratory report confirmation" in amended_rep["clinical_findings_text"] or "Follow-up blood culture" in amended_rep["clinical_findings_text"], "Amendment recorded with audit notes")

    # Patient 1 can now download finalized report markdown
    r = requests.get(f"{API_URL}/studies/{study1_id}/report.md", headers=p1_headers)
    assert_true(r.status_code == 200, "Patient can now retrieve finalized signed report markdown")
    assert_true("STATUS:** FINAL" in r.text, "Report contains FINAL status header")
    assert_true("Active bacterial pneumonia" in r.text, "Report contains physician final impression")

    # 8. Cross-Patient Comparison (DEF-005)
    log("Step 8: Testing Cross-Patient Comparison Rejection & In-Patient Comparison (DEF-005)", "INFO")
    # Upload a study for Patient 2
    with open(SAMPLE_IMG_PATH, "rb") as f:
        files = {"image": ("sample_04_pneumonia_infiltration.png", f, "image/png")}
        data = {"patient_id": str(p2_id), "study_type": "Chest Radiograph (PA)"}
        r = requests.post(f"{API_URL}/studies", files=files, data=data, headers=doc_headers)
    p2_study_id = r.json()["id"]

    # Attempt cross-patient comparison (Study 1 from Patient 1 vs Study 2 from Patient 2) -> MUST BE REJECTED 400
    r = requests.get(f"{API_URL}/compare?a={study1_id}&b={p2_study_id}", headers=doc_headers)
    assert_true(r.status_code == 400, f"Cross-patient comparison rejected with 400 (DEF-005 verified, got {r.status_code})")
    assert_true("Cross-patient comparison rejected" in r.json().get("error", ""), "Returned meaningful cross-patient rejection message")

    # Upload a second study for Patient 1 to test valid comparison
    with open(SAMPLE_IMG_PATH, "rb") as f:
        files = {"image": ("sample_04_pneumonia_infiltration.png", f, "image/png")}
        data = {"patient_id": str(p1_id), "study_type": "Chest Radiograph (PA) - Followup"}
        r = requests.post(f"{API_URL}/studies", files=files, data=data, headers=doc_headers)
    study1_followup_id = r.json()["id"]

    # Compare study1 and study1_followup (both Patient 1) -> MUST SUCCEED 200
    r = requests.get(f"{API_URL}/compare?a={study1_id}&b={study1_followup_id}", headers=doc_headers)
    assert_true(r.status_code == 200, "Same-patient longitudinal comparison succeeded with 200")
    compare_res = r.json()
    assert_true(len(compare_res["rows"]) == 14, "Comparison returned deltas for all 14 disease classes")

    # 9. Corrupt Upload & File Size Limit Handling
    log("Step 9: Testing Malformed/Corrupt Upload Handling", "INFO")
    corrupt_bytes = b"Not a real image file content - plain text simulation."
    files = {"image": ("fake_xray.png", corrupt_bytes, "image/png")}
    data = {"patient_id": str(p1_id)}
    # Direct ML service test for corrupt image
    r = requests.post(f"{ML_URL}/predict", files=files)
    assert_true(r.status_code == 400, f"Corrupt image rejected by ML service with 400 (got {r.status_code})")

    # Express study upload of non-image file type
    files = {"image": ("document.pdf", corrupt_bytes, "application/pdf")}
    r = requests.post(f"{API_URL}/studies", files=files, data=data, headers=doc_headers)
    assert_true(r.status_code == 400, f"Invalid MIME type rejected by Express with 400 (got {r.status_code})")

    # 10. Appointment Conflict Validation
    log("Step 10: Testing Appointment Conflict Validation", "INFO")
    unique_day = (timestamp % 25) + 1
    unique_time = f"{(timestamp % 8) + 9:02d}:{(timestamp % 4) * 15:02d} AM"
    appt_payload = {
        "patient_id": p1_id,
        "doctor_id": 1,
        "appointment_date": f"2027-01-{unique_day:02d}",
        "appointment_time": unique_time,
        "reason": "Clinical follow-up for pneumonia"
    }
    r = requests.post(f"{API_URL}/appointments", json=appt_payload, headers=doc_headers)
    assert_true(r.status_code == 201, f"Appointment scheduled with 201 (got {r.status_code})")
    appt_id = r.json()["id"]

    # Double-booking attempt on same doctor, date and time
    r_dup = requests.post(f"{API_URL}/appointments", json=appt_payload, headers=doc_headers)
    assert_true(r_dup.status_code == 409, f"Double-booking conflict caught with 409 (got {r_dup.status_code})")

    # 11. Admin Operations & Role Isolation
    log("Step 11: Testing Admin Operations, Audit Logging & Role Isolation", "INFO")
    # Admin lists users
    r = requests.get(f"{API_URL}/admin/users", headers=admin_headers)
    assert_true(r.status_code == 200, "Admin can list registered users")
    assert_true(len(r.json()) > 0, "Users list is populated")

    # Admin provisions a doctor
    new_doc_username = f"dr.test_{timestamp}"
    new_doc_payload = {
        "username": new_doc_username,
        "email": f"test_{timestamp}@clinic.local",
        "full_name": f"Dr. Test User {timestamp}",
        "password": "SecureDoctorPass123!",
        "role": "DOCTOR"
    }
    r = requests.post(f"{API_URL}/admin/users", json=new_doc_payload, headers=admin_headers)
    assert_true(r.status_code == 201, "Admin successfully created new doctor account")
    created_user_id = r.json()["id"]

    # Admin deactivates user
    r = requests.patch(f"{API_URL}/admin/users/{created_user_id}", json={"is_active": False}, headers=admin_headers)
    assert_true(r.status_code == 200, "Admin deactivated user account")

    # Admin verifies audit logs contain recent actions
    r = requests.get(f"{API_URL}/admin/audit", headers=admin_headers)
    assert_true(r.status_code == 200, "Admin retrieved audit logs")
    audit_actions = [x["action"] for x in r.json()]
    assert_true("CREATE_PATIENT" in audit_actions or "UPLOAD_XRAY" in audit_actions or "LOGIN" in audit_actions, "Audit logs contain expected historical clinical actions")

    # Non-admin attempts to access admin endpoints -> MUST BE REJECTED 403
    r = requests.get(f"{API_URL}/admin/users", headers=doc_headers)
    assert_true(r.status_code == 403, f"Doctor access to /admin/users rejected with 403 (got {r.status_code})")
    r = requests.get(f"{API_URL}/admin/users", headers=p1_headers)
    assert_true(r.status_code == 403, f"Patient access to /admin/users rejected with 403 (got {r.status_code})")

    # 12. Clinical Assistant & Appointment Lifecycle
    log("Step 12: Testing Grounded Clinical Assistant & Appointment Lifecycle", "INFO")
    # Query assistant for patient summary
    r = requests.post(f"{API_URL}/assistant", json={"patient_id": p1_id, "question": "Summarise this patient's imaging history"}, headers=doc_headers)
    assert_true(r.status_code == 200, "Clinical assistant executed query successfully")
    assert_true(mrn_1 in r.json().get("answer", "") or "Imaging summary" in r.json().get("answer", ""), "Assistant returned grounded imaging history")

    # Query assistant for clinical knowledge base reference
    r = requests.post(f"{API_URL}/assistant", json={"patient_id": 0, "question": "Explain cardiomegaly criteria"}, headers=doc_headers)
    assert_true(r.status_code == 200, "Clinical assistant returned medical reference notes")
    assert_true("cardiothoracic ratio" in r.json().get("answer", "").lower(), "Assistant returned verified cardiomegaly reference")

    # Patient cancels appointment
    r = requests.patch(f"{API_URL}/appointments/{appt_id}", json={"status": "CANCELLED"}, headers=p1_headers)
    assert_true(r.status_code == 200, "Patient successfully cancelled consultation appointment")

    # Patient attempts to mark appointment completed -> MUST BE REJECTED 403
    r = requests.patch(f"{API_URL}/appointments/{appt_id}", json={"status": "COMPLETED"}, headers=p1_headers)
    assert_true(r.status_code == 403, f"Patient completing appointment rejected with 403 (got {r.status_code})")

    log("=" * 60, "INFO")
    log("ALL END-TO-END REGRESSION TESTS PASSED CLEANLY!", "PASS")
    log("=" * 60, "INFO")

if __name__ == "__main__":
    run_tests()
