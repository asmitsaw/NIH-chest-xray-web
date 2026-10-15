# Chest-X AI v2 — Comprehensive Baseline Project Audit

**Document:** `docs/PROJECT_AUDIT.md`  
**Execution Date:** 2026-10-15  
**Audit Scope:** Phase A Baseline Engineering & Integrity Audit  
**Status:** Completed  

---

## 1. Executive Summary & Repository Metadata

Chest-X AI (v2) is an academic clinical decision-support research prototype for thoracic radiograph (chest X-ray) analysis. It is an evolution from an earlier Streamlit prototype into a decoupled, modern three-tier application:
- **Frontend:** Single-page application built with React 18, Vite 5, React Router 6, and Vanilla CSS.
- **Backend API:** Node.js 24 + Express 5.1 with SQLite database access via Node's native `node:sqlite` (`DatabaseSync`), PBKDF2 password hashing, and JWT-based Role-Based Access Control (RBAC).
- **ML Microservice:** Python 3.11 + Flask 3.1 HTTP microservice wrapping a 5-stage Convolutional Neural Network (CNN) built in TensorFlow 2.21 / Keras with OpenCV-powered Gradient-weighted Class Activation Mapping (Grad-CAM).

### Repository Structure Summary
```
d:/chestx-ai-v2/
├── .env.example                               # Environment template
├── chest_x_ai.db                              # Active SQLite database (WAL mode)
├── nih-chest-x-ray-multi-classification.ipynb # Original training notebook
├── package.json                               # Root workspace package orchestrator
├── requirements.txt                           # Python ML dependencies
├── start.bat                                  # Windows launch script
├── ai/                                        # Core ML package (preprocessing, adapter, Grad-CAM)
│   ├── __init__.py
│   ├── gradcam.py
│   ├── model_adapter.py
│   ├── model_config.py
│   ├── model_loader.py
│   ├── postprocessing.py
│   ├── predictor.py
│   ├── preprocessing.py
│   └── report_generator.py
├── ml_service/                                # Flask HTTP inference microservice
│   └── app.py
├── models/weights/                            # Trained neural network checkpoints
│   └── weights.best.05-1.74.hdf5              # 4.20 MB HDF5 Keras weights checkpoint
├── client/                                    # React SPA frontend
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx, App.jsx, api.js, auth.jsx, ui.jsx, styles.css
│       └── pages/ (Admin, Appointments, Assistant, Compare, Dashboard, Doctors, Login, Model, NewStudy, Patients, Study)
├── server/                                    # Express API server
│   ├── package.json
│   ├── db.js                                  # SQLite schema, seed data, PBKDF2 crypto
│   └── index.js                               # REST API routes, auth, static serving
├── data/sample_images/                        # 5 sample test radiographs
├── docs/                                      # Documentation & audit reports
├── outputs/                                   # Uploaded radiographs & generated heatmaps
└── results/                                   # Original training ROC curve visualizations
```

---

## 2. Actual Runtime Environment & Dependency Versions

All runtimes and packages were inspected directly on the host operating system:

| Component | Target / Declared | Verified Actual Version | Verification Command & Result |
| :--- | :--- | :--- | :--- |
| **Operating System** | Windows 64-bit | Windows 10/11 (AMD64) | System Info Verified |
| **Node.js** | `>=22.13` (declared in `server/package.json`) | **v24.20.0** | `node -v` -> `v24.20.0` (Supports `node:sqlite` out of the box) |
| **npm** | Any compatible | **11.x** | `npm.cmd -v` verified |
| **Python** | `3.11+` | **3.11.5** | `python --version` -> `Python 3.11.5` |
| **TensorFlow** | `>=2.15.0` | **2.21.0** | `import tensorflow as tf; print(tf.__version__)` -> `2.21.0` |
| **OpenCV** | `>=4.8.0` | **5.0.0-dev** (`opencv-python`) | `import cv2; print(cv2.__version__)` -> `5.0.0` |
| **Flask** | `>=3.0.0` | **3.1.3** | `import flask; print(flask.__version__)` -> `3.1.3` |
| **Pillow** | `>=10.0.0` | **10.x** | PIL import successful |
| **h5py** | `>=3.10.0` | **3.10+** | h5py import successful |
| **React** | `^18.3.1` | **18.3.1** | `client/package.json` |
| **Vite** | `^5.4.11` | **5.4.21** | `vite build` completed in 1.29s |
| **Express** | `^5.1.0` | **5.1.0** | `server/package.json` |

---

## 3. Environment Variables, Configuration & Ports

### Declared Environment Variables (`.env.example`)
```ini
# Node API
PORT=4000
JWT_SECRET=change-me-to-a-long-random-string
ML_URL=http://127.0.0.1:5001
# DATABASE_PATH=./chest_x_ai.db

# Python inference service
ML_PORT=5001
MODEL_PATH=models/weights/weights.best.05-1.74.hdf5
```

### Runtime Audit Findings on Configuration
1. **Missing `.env` File**: Only [.env.example](file:///d:/chestx-ai-v2/.env.example) is present in the workspace. An active `.env` file does NOT exist.
2. **Ephemeral JWT Secret**: In [server/index.js:12](file:///d:/chestx-ai-v2/server/index.js#L12), `process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')` is used. Without a `.env` file or exported variable, every server restart generates a new secret key, invalidating all issued patient, doctor, and admin JWTs.
3. **Missing `.env` Loading Mechanism in Server**: Neither [server/package.json](file:///d:/chestx-ai-v2/server/package.json) nor [server/index.js](file:///d:/chestx-ai-v2/server/index.js) imports `dotenv` or runs `node --env-file=.env`. Node 24 supports native `--env-file`, which should be wired into `server/package.json`.
4. **Port Allocation**:
   - Web application & REST API: `http://localhost:4000`
   - ML inference service: `http://127.0.0.1:5001` (internal loopback only)
   - Vite development server (if run in dev mode): `http://localhost:5173`

---

## 4. Model Architecture, Checkpoint Compatibility & Pipeline

### Architecture Specification
From [nih-chest-x-ray-multi-classification.ipynb](file:///d:/chestx-ai-v2/nih-chest-x-ray-multi-classification.ipynb) and [ai/model_adapter.py](file:///d:/chestx-ai-v2/ai/model_adapter.py):

| Layer Index & Type | Filters / Units | Kernel / Pool | Activation | Output Shape | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **input_1** | - | - | - | `(1, 128, 128, 1)` | Grayscale normalized `[0.0, 1.0]` |
| **conv2d_1** | 8 | 3 × 3, same | ReLU | `(1, 128, 128, 8)` | First receptive field |
| **maxpool2d_1** | - | 2 × 2 | - | `(1, 64, 64, 8)` | Spatial downsampling |
| **drop_1** | - | - | - | `(1, 64, 64, 8)` | Rate = 0.2 |
| **conv2d_2** | 16 | 3 × 3, same | ReLU | `(1, 64, 64, 16)` | Textures & contours |
| **maxpool2d_2** | - | 2 × 2 | - | `(1, 32, 32, 16)` | Spatial downsampling |
| **drop_2** | - | - | - | `(1, 32, 32, 16)` | Rate = 0.2 |
| **conv2d_3** | 32 | 3 × 3, same | ReLU | `(1, 32, 32, 32)` | Intermediate features |
| **maxpool2d_3** | - | 2 × 2 | - | `(1, 16, 16, 32)` | Spatial downsampling |
| **drop_3** | - | - | - | `(1, 16, 16, 32)` | Rate = 0.2 |
| **conv2d_4** | 64 | 3 × 3, same | ReLU | `(1, 16, 16, 64)` | Regional opacities |
| **maxpool2d_4** | - | 2 × 2 | - | `(1, 8, 8, 64)` | Spatial downsampling |
| **drop_4** | - | - | - | `(1, 8, 8, 64)` | Rate = 0.2 |
| **conv2d_5** | 128 | 3 × 3, same | ReLU | `(1, 8, 8, 128)` | **Target Grad-CAM XAI Layer** |
| **maxpool2d_5** | - | 3 × 3 | - | `(1, 2, 2, 128)` | Final convolutional pooling |
| **drop_5** | - | - | - | `(1, 2, 2, 128)` | Rate = 0.2 |
| **flatten_1** | - | - | - | `(1, 512)` | Vectorization |
| **dense_1** | 500 | - | ReLU | `(1, 500)` | Latent clinical embedding |
| **drop_6** | - | - | - | `(1, 500)` | Rate = 0.2 |
| **predictions** | 14 | - | **Softmax** | `(1, 14)` | Relative ranking vector |

### Canonical Class Order Verification
The class order defined in [ai/model_config.py:8-23](file:///d:/chestx-ai-v2/ai/model_config.py#L8-L23) matches the dummy label order in [nih-chest-x-ray-multi-classification.ipynb](file:///d:/chestx-ai-v2/nih-chest-x-ray-multi-classification.ipynb):
1. `Atelectasis`
2. `Consolidation`
3. `Infiltration`
4. `Pneumothorax`
5. `Edema`
6. `Emphysema`
7. `Fibrosis`
8. `Effusion`
9. `Pneumonia`
10. `Pleural_Thickening`
11. `Cardiomegaly`
12. `Nodule`
13. `Mass`
14. `Hernia`

### Checkpoint Compatibility
- Checkpoint file: `models/weights/weights.best.05-1.74.hdf5` (Size: 4,404,008 bytes / 4.20 MB).
- Checkpoint origin: Epoch 5, validation loss 1.74.
- Verification test: Executed `check_model_compatibility` via script. Weights load cleanly into `KerasSequentialAdapter`; forward pass produces finite float32 outputs with shape `(1, 14)` in ~99.9 ms on CPU.

---

## 5. Multi-Label Scientific Analysis & Output Interpretation

### Critical Softmax vs. Sigmoid Finding
- In real-world chest radiology and specifically in the NIH ChestX-ray14 dataset, patients frequently present with **multiple concurrent co-occurring pathologies** (e.g., *Effusion* and *Pneumonia* together).
- The original notebook trained this model using `Dense(14, activation='softmax')` paired with `categorical_crossentropy`.
- **Mathematical & Clinical Consequence**: Softmax assumes mutually exclusive classes. All 14 output scores sum to exactly 1.0 (100%). Therefore, the scores represent a **relative ranking distribution** among findings, NOT calibrated independent probabilities of presence. A high score means the feature pattern looks more like that finding than the other 13, not that the probability of disease presence is literally that percentage.
- **Integrity Rule**: Per Section 1 & 3 of the master engineering specification, we do NOT replace the output layer with Sigmoid at inference time (which would be mathematically invalid for weights trained under Softmax loss) and we do NOT invent fake weights. We preserve the existing checkpoint and ensure all UI elements, API responses, and reports state this limitation transparently.

---

## 6. Backend API Endpoints & Authentication Requirements

Inspection of [server/index.js](file:///d:/chestx-ai-v2/server/index.js) revealed the following route surface:

| Route Path | HTTP Method | Auth Required | Allowed Roles | Description & Handlers |
| :--- | :--- | :--- | :--- | :--- |
| `/api/auth/login` | POST | No | Public | Authenticates username/password via PBKDF2; returns JWT. Rate-limited (5 fails/min). |
| `/api/auth/me` | GET | Yes | Any | Returns decoded token claims for session restore. |
| `/api/meta` | GET | Yes | Any | Returns class list, thresholds, colormaps, disclaimers, and ML online status. |
| `/api/dashboard` | GET | Yes | Any | Role-tailored metrics: queue/appointments/counts for staff; reports/appointments for patients. |
| `/api/patients` | GET | Yes | DOCTOR, ADMIN | Lists all patients with study counts. |
| `/api/patients` | POST | Yes | DOCTOR, ADMIN | Registers a new patient record (MRN uniqueness check). |
| `/api/patients/:id` | GET | Yes | DOCTOR, ADMIN | Returns single patient profile, longitudinal studies, and appointments. |
| `/api/doctors` | GET | Yes | Any | Directory of doctor profiles, specializations, schedules. |
| `/api/studies` | GET | Yes | Any | Lists studies. Scoped to patient if user is PATIENT; all studies for staff. |
| `/api/studies/:id` | GET | Yes | Any | Returns study details. Sanitized via `forUser` (strips raw predictions from patients). |
| `/api/studies/:id/image` | GET | Yes | Any | Streams radiograph file from disk with access control via `studyOr404`. |
| `/api/studies` | POST | Yes | DOCTOR, ADMIN | Multer upload (PNG/JPEG <= 15MB), saves to disk, triggers `analyze()`. |
| `/api/studies/:id/analyze` | POST | Yes | DOCTOR, ADMIN | Re-runs inference on stored radiograph via ML microservice. |
| `/api/studies/:id/gradcam` | POST | Yes | DOCTOR, ADMIN | Requests Grad-CAM heatmap & overlay from ML microservice for a finding. |
| `/api/studies/:id/report` | PUT | Yes | DOCTOR | Saves draft or signs off report (`is_draft: false`). Updates study status. |
| `/api/studies/:id/report.md` | GET | Yes | Any | Generates and downloads Markdown clinical report. |
| `/api/compare` | GET | Yes | DOCTOR, ADMIN | Longitudinal comparison of two studies with delta score calculations. |
| `/api/appointments` | GET | Yes | Any | Lists scheduled appointments scoped by user role. |
| `/api/appointments` | POST | Yes | Any | Books appointment. Checks doctor slot conflict (`status='SCHEDULED'`). |
| `/api/appointments/:id` | PATCH | Yes | Any | Updates status to `COMPLETED` or `CANCELLED` (Patients restricted to cancel). |
| `/api/assistant` | POST | Yes | DOCTOR, ADMIN | Grounded clinical Q&A based on patient records and built-in radiology KB. |
| `/api/performance` | GET | Yes | Any | Serves architecture summary and ROC curve artifact paths. |
| `/results/*` | GET | No (static) | Public | Serves ROC curve images directly from `results/`. |
| `/api/admin/users` | GET | Yes | ADMIN | Lists all users with role and active status. |
| `/api/admin/users` | POST | Yes | ADMIN | Creates new DOCTOR or ADMIN user with PBKDF2 password hash. |
| `/api/admin/users/:id` | PATCH | Yes | ADMIN | Activates or deactivates user accounts (self-deactivation forbidden). |
| `/api/admin/audit` | GET | Yes | ADMIN | Returns the latest 200 system audit log records. |
| `/api/admin/health` | GET | Yes | ADMIN | Reports health status of API, database, and Flask inference service. |

---

## 7. Database Schema, Relationships & Initialization Behavior

### Tables in `chest_x_ai.db`
Verified via SQLite master catalog inspection:
1. `users` (10 rows): User authentication accounts (`id`, `username`, `email`, `password_hash`, `role`, `full_name`, `is_active`, `created_at`).
2. `patients` (5 rows): Patient clinical records (`id`, `user_id`, `mrn`, `full_name`, `age`, `gender`, `blood_group`, `contact_phone`, `emergency_contact`, `medical_history_notes`, `created_at`).
3. `doctors` (3 rows): Doctor clinical records (`id`, `user_id`, `full_name`, `specialization`, `qualification`, `experience_years`, `hospital_clinic`, `availability_schedule`, `profile_image`, `is_demo`, `created_at`).
4. `xray_studies` (9 rows): Radiograph studies (`id`, `patient_id`, `doctor_id`, `study_uid`, `study_date`, `study_type`, `image_path`, `original_filename`, `status`, `notes`, `created_at`).
5. `ai_predictions` (4 rows): Model inference records (`id`, `study_id`, `model_version`, `inference_time_ms`, `raw_scores_json`, `primary_findings_json`, `threshold_used`, `warning_notes`, `created_at`).
6. `explanations` (0 rows): Schema placeholder for Grad-CAM explanations (`id`, `prediction_id`, `finding_name`, `heatmap_path`, `overlay_path`, `activation_layer`, `created_at`). Currently, heatmaps are generated dynamically and streamed as base64 to avoid disk bloat.
7. `doctor_reports` (0 rows): Finalized / draft reports (`id`, `study_id`, `doctor_id`, `clinical_findings_text`, `confirmed_findings_json`, `rejected_findings_json`, `added_findings_json`, `final_impression`, `doctor_notes`, `recommendation`, `is_draft`, `finalized_at`, `created_at`, `updated_at`).
8. `appointments` (4 rows): Patient-doctor appointment slots (`id`, `patient_id`, `doctor_id`, `appointment_date`, `appointment_time`, `reason`, `status`, `notes`, `created_at`).
9. `audit_logs` (18 rows): Audit trail recording security and clinical actions (`id`, `user_id`, `username`, `role`, `action`, `entity`, `entity_id`, `details`, `ip_address`, `timestamp`).

### Integrity & Foreign Keys
- `PRAGMA integrity_check` -> `ok`
- `PRAGMA foreign_key_check` -> `[]` (zero broken foreign keys)
- Foreign keys are enforced via `PRAGMA foreign_keys = ON;` in `server/db.js`.
- Seeding logic in `initDb()` only triggers if `SELECT COUNT(*) FROM users` is zero, preserving existing records across restarts.

---

## 8. Frontend Architecture, Pages, Routes & API Calls

The React frontend in `client/src/` has 11 routes mapped in [client/src/App.jsx](file:///d:/chestx-ai-v2/client/src/App.jsx):

| Route Path | Page Component | Navigation Role Visibility | APIs Called | Key UI Elements |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `Login.jsx` | Unauthenticated | `POST /api/auth/login` | Username/password form, demo quick-switch buttons (Doctor, Patient, Admin) |
| `/` | `Dashboard.jsx` | Any | `GET /api/dashboard` | Worklist metrics, study queue table, appointments list, audit widget |
| `/study/:id` | `Study.jsx` | Any | `GET /api/study/:id`, `POST .../analyze`, `POST .../gradcam`, `PUT .../report`, `GET .../report.md` | Radiograph viewer (brightness, contrast, invert), findings ladder, Grad-CAM overlay, doctor review & sign-off form |
| `/new` | `NewStudy.jsx` | Staff (Doctor, Admin) | `GET /api/patients`, `POST /api/studies` | Drag & drop upload zone, patient selector, study type picker |
| `/patients` | `Patients.jsx` | Staff (Doctor, Admin) | `GET /api/patients`, `POST /api/patients` | Patient search by MRN/name, registration modal |
| `/patients/:id` | `PatientDetail` | Staff (Doctor, Admin) | `GET /api/patients/:id` | Patient clinical profile, longitudinal imaging timeline, appointments |
| `/compare` | `Compare.jsx` | Staff (Doctor, Admin) | `GET /api/patients`, `GET /api/studies`, `GET /api/compare` | Patient study selector, side-by-side radiograph viewer, delta score change bars |
| `/appointments` | `Appointments.jsx` | Any | `GET /api/appointments`, `GET /api/doctors`, `GET /api/patients`, `POST ...`, `PATCH ...` | Appointment schedule table, slot booking form with conflict warning |
| `/assistant` | `Assistant.jsx` | Staff (Doctor, Admin) | `GET /api/patients`, `POST /api/assistant` | Patient context selector, quick question buttons, grounded Q&A chat stream |
| `/doctors` | `Doctors.jsx` | Any | `GET /api/doctors` | Clinician credentials, hospital affiliation, weekly schedule cards |
| `/model` | `Model.jsx` | Any | `GET /api/performance` | Model limits warning, architecture specification, 14 disease tags, training ROC curves |
| `/admin` | `Admin.jsx` | Admin only | `GET /api/admin/users`, `POST ...`, `PATCH ...`, `GET .../audit`, `GET .../health` | Tabbed view: User management & creation, 200-row audit log, live health check |

---

## 9. Baseline Verification Tests, Commands & Results

| Test Category | Command Executed | Outcome | Details / Evidence |
| :--- | :--- | :--- | :--- |
| **Node Server Syntax** | `node --check server/index.js; node --check server/db.js` | **PASS (0)** | Valid ES modules, clean syntax |
| **Python Syntax** | `python -c "import compileall; ... compile_dir('ai') ... compile_dir('ml_service')"` | **PASS (0)** | 100% of Python files compiled cleanly without syntax errors |
| **Database Integrity** | `node -e "PRAGMA integrity_check; PRAGMA foreign_key_check;"` | **PASS (0)** | SQLite integrity OK, 0 foreign key violations |
| **Model Weight Loading** | Direct script loading `weights.best.05-1.74.hdf5` | **PASS (0)** | Checkpoint loaded in 246.9 ms; forward pass produced shape `(1, 14)` |
| **Inference Latency** | Sample radiograph `sample_02_cardiomegaly.png` | **PASS (0)** | Preprocessing: 16.3 ms; Forward pass: 99.95 ms; Total: 116.3 ms |
| **Grad-CAM Execution** | Class `Cardiomegaly` gradient backprop on `conv2d_5` | **PASS (0)** | Gradient backprop succeeded; feature activation shape `(8, 8)`; bicubic resize & Jet blend verified |
| **Vite Client Production Build** | `cmd /c "npm --prefix client run build"` | **PASS (0)** | Built in 1.29s -> `dist/assets/index-DE5jskwj.js` (220 kB), `dist/assets/index-DLpGsYro.css` (11.5 kB) |
| **Automated Tests** | `npm test` or `pytest` | **FAIL / MISSING** | **Zero automated test suites exist in the repository** |
| **Direct npm in PowerShell** | `npm --prefix client run build` in PowerShell | **BLOCKED** | PowerShell ExecutionPolicy blocks `npm.ps1` (`UnauthorizedAccess`) |

---

## 10. Feature-by-Feature Status Matrix

| Feature / Subsystem | Status | Relevant Files | Evidence & Notes |
| :--- | :--- | :--- | :--- |
| **Model Loading** | **Working** | `ai/model_adapter.py`, `ai/model_loader.py` | Loads `weights.best.05-1.74.hdf5` via Functional Keras rebuild. Tested and operational. |
| **Image Preprocessing** | **Working** | `ai/preprocessing.py` | Bilinear resize to 128x128, grayscale conversion, [0, 1] scaling. Verified. |
| **Multi-class Inference** | **Working** | `ai/predictor.py`, `ai/postprocessing.py` | Produces 14 disease ranking scores and threshold-based primary findings in ~100ms. |
| **Grad-CAM XAI** | **Working** | `ai/gradcam.py` | Gradient extraction on `conv2d_5`, bicubic upsampling, colormap overlay. Verified. |
| **ML Flask Microservice** | **Working** | `ml_service/app.py` | Endpoints `/health`, `/config`, `/predict`, `/gradcam` defined and functional. |
| **Authentication & RBAC** | **Working** | `server/db.js`, `server/index.js`, `client/src/auth.jsx` | PBKDF2 password verification + JWT tokens. Doctor, Patient, Admin roles supported. |
| **Workstation Radiograph Viewer** | **Working** | `client/src/pages/Study.jsx` | Brightness/contrast window leveling, image inversion, heatmap overlay toggle. |
| **Findings Ladder** | **Working** | `client/src/ui.jsx` (`Ladder`), `client/src/pages/Study.jsx` | Visual score bars with threshold tick markers. |
| **Doctor Review & Report Sign-Off** | **Partially Working** | `server/index.js`, `client/src/pages/Study.jsx` | UI works and locks on sign-off, but backend lacks a guard to prevent overwriting finalized reports. |
| **Longitudinal Comparison** | **Partially Working** | `server/index.js`, `client/src/pages/Compare.jsx` | Side-by-side viewer works, but backend lacks validation that studies belong to the same patient. |
| **Patient Registration** | **Partially Working** | `server/index.js`, `client/src/pages/Patients.jsx` | Creates patient row, but does NOT create a `users` login account. Patients cannot log in. |
| **Appointment Booking** | **Working** | `server/index.js`, `client/src/pages/Appointments.jsx` | Schedule conflict detection for doctor time-slots works properly. |
| **Clinical Assistant** | **Working** | `server/index.js`, `client/src/pages/Assistant.jsx` | Grounded retrieval from patient records and radiology KB. No hallucination. |
| **Markdown Report Export** | **Partially Working** | `server/index.js` (`/report.md`), `client/src/pages/Study.jsx` | Downloads `.md` report, but does not block patient access to unfinalized drafts. |
| **Admin User & Audit Management** | **Working** | `server/index.js`, `client/src/pages/Admin.jsx` | List users, add doctor/admin, toggle active status, inspect audit logs and health. |
| **Environment & Configuration** | **Broken / Missing** | `.env.example`, `server/index.js` | No `.env` file present; JWT secret is ephemeral across restarts. |
| **Windows PowerShell Startup** | **Partially Working** | `package.json`, `start.bat` | `npm run` blocked by PowerShell script execution policy unless called via `npm.cmd`. |
| **Automated Testing Suite** | **Missing** | N/A | No test files or testing framework configured in package.json or requirements.txt. |

---

## 11. Prioritized Defect Log

| Defect ID | Severity | Component | Description & Evidence | Proposed Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-001** | **CRITICAL** | Security / Auth | Ephemeral `JWT_SECRET` generated via `crypto.randomBytes(32)` when `.env` is missing, invalidating all sessions on restart. | Create persistent `.env` from template; configure Node `--env-file=.env` in startup scripts; enforce static secret in production mode. |
| **DEF-002** | **CRITICAL** | Backend / Workflow | `PUT /api/studies/:id/report` allows overwriting and modifying finalized reports. No backend status check exists. | Add backend guard: reject modifications with HTTP 403 if `doctor_reports.is_draft == 0` unless an audited amendment is invoked. |
| **DEF-003** | **HIGH** | Workflow / Patient Auth | `POST /api/patients` registers patient record in `patients` table, but creates no user in `users`, leaving patients unable to log in. | Automatically provision linked `users` account with role `PATIENT` and initial credentials or invite token upon patient registration. |
| **DEF-004** | **HIGH** | Security / Privacy | `GET /api/studies/:id/report.md` does not restrict patient access to unfinalized draft reports. | Enforce check in report download: return HTTP 403 to `PATIENT` role if report is draft or unapproved. |
| **DEF-005** | **MEDIUM** | Backend Validation | `GET /api/compare` does not verify that both compared studies belong to the same patient (`a.patient_id === b.patient_id`). | Add server-side validation rejecting comparisons across different patient IDs with HTTP 400. |
| **DEF-006** | **MEDIUM** | Developer Experience / Ops | Windows PowerShell ExecutionPolicy blocks `npm.ps1` commands (`UnauthorizedAccess`). | Update `package.json` scripts, `README.md`, and batch scripts to invoke `npm.cmd` or cmd sub-shells cleanly. |
| **DEF-007** | **HIGH** | QA / Testing | Zero automated unit, backend, or integration test suites exist in the repository. | Build dedicated automated test suite covering ML inference, backend authentication, study workflows, and role isolation. |
| **DEF-008** | **MEDIUM** | Health Check | `GET /api/admin/health` hardcodes `database: true` without executing a ping query on SQLite. | Execute active `SELECT 1` SQLite query in health check handler. |
| **DEF-009** | **LOW** | Documentation | Softmax output limitations and mutual exclusivity caveats need clear display across all clinical reports and exports. | Ensure all report templates and exports include prominent Softmax ranking interpretation notice. |
