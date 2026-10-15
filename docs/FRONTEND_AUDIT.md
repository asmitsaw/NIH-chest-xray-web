# Chest-X AI v2 — Frontend Page-by-Page Audit & Verification

**Document:** `docs/FRONTEND_AUDIT.md`  
**Audit Date:** 2026-10-15  
**Auditor:** Full-Stack & Clinical Software Engineering Pair  
**Status:** Complete Audit & Verification across All 11 Pages  

---

## 1. Executive Summary

A comprehensive source code and runtime audit was conducted for all 11 pages of the Chest-X AI v2 client (`client/src/pages/`). Every page was audited against real API contracts, state lifecycle handling (loading, empty, success, error), role-based access control, input validation, authenticated binary media fetching, and responsive layout behavior.

All identified deficiencies (such as missing UI for audited clinical amendments on finalized reports, missing model version mismatch warnings in study comparisons, and unhandled busy states on submission buttons) have been remediated.

---

## 2. Page-by-Page Audit Matrix

| Page Component | Route | Target API Endpoints | Role Access | State Handling (Load/Empty/Err) | Form Validation & Error Display | Authenticated Media / Downloads | Mock Data Status | Audit Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Login** | `/login` | `POST /api/auth/login` | Public / Unauth | Loading (`busy`), Error (`<ErrorBox>`) | Required inputs; handles 401/429 errors from server | None | Sample demo buttons for quick local demo | **PASS** |
| **Dashboard** | `/` | `GET /api/dashboard` | Role-filtered (`PATIENT` vs `DOCTOR`/`ADMIN`) | Loading (`<Loading>`), Empty (`<Empty>`), Error (`<ErrorBox>`) | Read-only summary views | None | Real SQLite query counts | **PASS** |
| **NewStudy** | `/new` | `GET /api/patients`<br>`POST /api/studies` | `DOCTOR`, `ADMIN` | Loading (`<Loading>`), Progress (`busy`), Error (`<ErrorBox>`) | MIME (`image/png`, `image/jpeg`), 15MB limit, patient selection required | Client-side blob preview; server-authenticated upload | None (actual uploads only) | **PASS** |
| **Study (Workstation)** | `/study/:id` | `GET /api/studies/:id`<br>`GET /api/meta`<br>`POST /api/studies/:id/analyze`<br>`POST /api/studies/:id/gradcam`<br>`PUT /api/studies/:id/report`<br>`POST /api/studies/:id/report/amend`<br>`GET /api/studies/:id/report.md` | Patient (own finalized only), Doctor, Admin | Workstation loading, Grad-CAM computing status, error alerts | Final impression required to finalize; amendment text required for addenda | `<SecureImage>` via `blobUrl()`; Markdown downloaded via authenticated blob download | Real CNN outputs, real Grad-CAM heatmaps on `conv2d_5` | **PASS** |
| **Patients** | `/patients` | `GET /api/patients`<br>`POST /api/patients` | `DOCTOR`, `ADMIN` | Loading (`<Loading>`), Empty search, Error (`<ErrorBox>`) | MRN uniqueness, age bounds (0-120), full name required | None | Live SQLite patient records | **PASS** |
| **PatientDetail** | `/patients/:id` | `GET /api/patients/:id` | `DOCTOR`, `ADMIN` | Loading (`<Loading>`), Empty timeline, Error (`<ErrorBox>`) | Read-only patient profile & timeline | None | Linked study records & appointments | **PASS** |
| **Compare** | `/compare` | `GET /api/patients`<br>`GET /api/studies?patient_id=...`<br>`GET /api/compare?a=...&b=...` | `DOCTOR`, `ADMIN` | Loading, Empty (<2 studies), Error (`<ErrorBox>`) | Requires two distinct studies of the same patient | Side-by-side `<SecureImage>` | Real relative score deltas; model version mismatch alert | **PASS** |
| **Appointments** | `/appointments` | `GET /api/appointments`<br>`GET /api/doctors`<br>`GET /api/patients`<br>`POST /api/appointments`<br>`PATCH /api/appointments/:id` | Patient (view/cancel own), Doctor/Admin (complete/cancel all) | Loading (`<Loading>`), Empty (`<Empty>`), Error (`<ErrorBox>`) | Date `min={today}`, doctor & time slot required; handles 409 slot conflicts | None | Live SQLite appointment schedule | **PASS** |
| **Assistant** | `/assistant` | `GET /api/patients`<br>`POST /api/assistant` | `DOCTOR`, `ADMIN` | Loading (`<Loading>`), Error (`<ErrorBox>`), auto-scroll | Patient context selection, deterministic prompt execution | None | Grounded deterministic answers from stored patient record | **PASS** |
| **Doctors** | `/doctors` | `GET /api/doctors` | All authenticated roles | Loading (`<Loading>`), Error (`<ErrorBox>`) | Read-only directory | None | Clearly badges demo profiles with `<span className="pill pending">Demo</span>` | **PASS** |
| **Model & Data** | `/model` | `GET /api/performance` | All authenticated roles | Loading (`<Loading>`), Error (`<ErrorBox>`) | Read-only educational documentation | Embeds actual ROC curves from `results/` | Honest architecture table, softmax limitations, CVPR 2017 citation | **PASS** |
| **Admin** | `/admin` | `GET /api/admin/users`<br>`POST /api/admin/users`<br>`PATCH /api/admin/users/:id`<br>`GET /api/admin/audit`<br>`GET /api/admin/health` | `ADMIN` only (route guard enforced) | Tab loading, Error (`<ErrorBox>`), live refresh button | Password length >= 8, username/email uniqueness; deactivate confirm | None | Real audit logs, live `/health` checking API, DB, and ML service | **PASS** |

---

## 3. Detailed Component Verifications

### 1. `Login.jsx`
- **Schema & Endpoints:** Calls `api.login(username, password)`. Response contains `{ token, user: { id, username, role, full_name, doctor_id, patient_id } }`. Session stored securely in `sessionStorage` under `chestx.session`.
- **States:** `busy` disables the submit and demo buttons and displays "Signing in…". Invalid credentials render error message inside `<ErrorBox>`.
- **Accessibility:** Proper `<label>` wrappers around inputs with `autoComplete` attributes.

### 2. `Dashboard.jsx`
- **Role Differentiation:** Automatically branches based on `user.role`:
  - `PATIENT` sees `PatientHome`: Lists their own radiographs and upcoming consultations.
  - `DOCTOR` and `ADMIN` see clinical worklist: Displays open studies awaiting analysis (`PENDING_ANALYSIS`) or sign-off (`AI_ANALYZED` / `IN_REVIEW`), upcoming booked appointments, and admin audit events.
- **Interactions:** Table rows are clickable (`tr.click`) and navigate directly to `/study/:id`.

### 3. `NewStudy.jsx`
- **File Validation:** Enforces PNG and JPEG image selection with `< 15MB` client-side validation before network submission.
- **Progress:** "Upload and analyse" button transitions to "Uploading and analysing…" with `disabled={busy}` to prevent duplicate uploads.
- **Offline ML Handling:** If the ML service is unreachable, Express returns `warning: 'AI service is not running...'`. The page redirects to `/study/:id` with `loc.state.warning` rendered as a non-blocking alert banner.

### 4. `Study.jsx` (Clinical Workstation)
- **Image Controls:** Includes interactive Brightness (50-170%), Contrast (50-200%), and Invert toggle via CSS filters on `<SecureImage>`.
- **Grad-CAM Interaction:** Clicking any finding in the findings ladder triggers `POST /api/studies/:id/gradcam`. Debounces colormap changes (`useDebounced(cmap, 250)`). Renders heatmap or overlay modes. Clamps opacity `[0.1, 1.0]`.
- **Report Finalization & Immutability:**
  - When draft: Attending doctor confirms, rejects, or marks findings unsure; adds custom findings chips; writes clinical notes, impression, and recommendations. Requires confirmation dialog before finalizing.
  - When finalized: Form fields and verdict buttons become strictly read-only (`disabled={locked}`). Shows green banner with signing doctor and timestamp.
  - **Audited Amendment Workflow:** Form appears when locked allowing doctors to file an addendum with reason. Invokes `api.amendReport()`, appends amendment to record, and refreshes study.
- **Patient Privacy:** Patients accessing `/study/:id` see only finalized impression and recommendation. Unsigned preliminary drafts display a friendly pending message. Raw AI model scores and prediction ladders are completely stripped.

### 5. `Patients.jsx` & `PatientDetail`
- **Account Provisioning:** Form creates patient record and atomically provisions portal login. Returns credentials card with username, email, and temporary password.
- **Search:** Instant client-side filtering across both patient full name and MRN.
- **Timeline:** Shows chronological radiographs, status pills, and previous impressions.

### 6. `Compare.jsx`
- **Cross-Patient Prevention:** Frontend forces selection of a single patient before populating study dropdowns, ensuring cross-patient comparison queries cannot be accidentally submitted.
- **Score Shift Visualization:** Visual delta bar chart highlights findings with largest upward/downward shifts.
- **Model Version Warning:** Displays notice if the two studies were analyzed using different model versions.

### 7. `Appointments.jsx`
- **Role Separation:** Patients can view and cancel their own consultations. Doctors can mark consultations complete or cancel.
- **Slot Conflict Validation:** Server-side 409 double-booking errors are caught and rendered inside `<ErrorBox>`.
- **Confirmation:** Confirmation dialogs guard both cancellation and completion actions.

### 8. `Assistant.jsx`
- **Deterministic Grounding:** Queries `POST /api/assistant` with selected patient ID. Responses strictly summarize stored imaging history, model findings, or built-in medical reference notes.
- **Safe Markdown:** Custom `<Md>` component renders bold, italic, code, and bullet lists without raw HTML injection.

### 9. `Model.jsx`
- **Educational Transparency:** Explicitly warns clinicians that the baseline CNN uses a Softmax activation head, meaning scores are relative rankings that sum to 100% rather than independent probabilities.
- **Artifact Embeds:** Links ROC curve figures generated during notebook training.

### 10. `Admin.jsx`
- **Security Guard:** Route protected by `user.role === 'ADMIN'`. Non-admins navigating to `/admin` are redirected to `/`.
- **Live System Health:** Live check pings the database (`SELECT 1`) and ML microservice (`/health`), verifying that the CNN weights are loaded.
- **User Management:** Deactivation/reactivation actions are guarded with confirmation modals.

---

## 4. Accessibility & Layout Audit

- **Keyboard Navigation:** All interactive elements (`<button>`, `<a>`, `<select>`, `<input>`) have distinct `:focus-visible` outlines (`2px solid var(--cobalt)`). Rungs in the findings ladder use semantic `<button>` elements with `aria-pressed`.
- **Contrast Ratios:** Text colors `--ink` (`#1b2430`) on `--paper` (`#ffffff`) and `--paper-2` (`#f5f6f8`) achieve contrast ratios > 11:1 (exceeding WCAG AAA). Status pills use curated dark-on-light color pairs.
- **Responsive Behavior:** `@media (max-width: 1080px)` collapses two-column workstation and dashboard layouts into single columns; `@media (max-width: 760px)` switches navigation rail into a horizontal top bar.
- **Reduced Motion:** Verified `@media (prefers-reduced-motion: reduce)` disables all animations and transitions.
