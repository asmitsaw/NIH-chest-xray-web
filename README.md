# Chest-X AI (v2: React + Node)

Rebuilt from the Streamlit version. Same model, same database, new interface.

```
client/       React (Vite) web app
server/       Node + Express API (auth, patients, studies, reports, audit)
ml_service/   Small Flask wrapper around ai/ (model, preprocessing, Grad-CAM)
ai/           Your original model code, unchanged
chest_x_ai.db Your original SQLite database (the Node API reads and writes it)
```

## Run it (Node 22.13 or newer, Python 3.11+)

```bash
npm run setup      # installs server, client and Python dependencies
npm run build      # builds the React app
npm run ml         # terminal 1: AI service on :5001
npm start          # terminal 2: web app + API on :4000
```
Open http://localhost:4000. On Windows, `start.bat` does the last two steps.

For development: `npm run dev:api` and `npm run dev:client`, then open http://localhost:5173.

## Demo accounts
doctor `dr.smith` / `doctor123`, patient `patient.john` / `patient123`, admin `admin` / `admin123`.
Change these and set `JWT_SECRET` before showing this to anyone.

## Automated Testing

```bash
npm test            # Runs Node backend test suite (node:test) + Python ML unit tests
npm run test:e2e    # Runs complete live 12-step end-to-end clinical workflow verification
```

## Documentation Suite

- [`docs/RELEASE_READINESS_AUDIT.md`](docs/RELEASE_READINESS_AUDIT.md): Independent release-readiness audit report, security verification, and release verdicts.
- [`docs/PROJECT_AUDIT.md`](docs/PROJECT_AUDIT.md): Comprehensive baseline architectural and code audit.
- [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md): Master implementation status and regression evidence.
- [`docs/FRONTEND_AUDIT.md`](docs/FRONTEND_AUDIT.md): Page-by-page audit matrix across all 11 client pages.
- [`docs/SCIENTIFIC_MODEL_EVALUATION.md`](docs/SCIENTIFIC_MODEL_EVALUATION.md): Model limitations, training notebook forensic analysis, and next-gen multi-label requirements.

## Notes
- Your earlier uploads are in `outputs/uploads/`. The API resolves images by filename across `outputs/uploads/` and `data/sample_images/`.
- If the AI service is off, uploads still work and studies wait as "Awaiting analysis" (`PENDING_ANALYSIS`).
- The Flask server is a local microservice bound to localhost; only the Node API calls it.
- **Scientific Notice**: The baseline CNN uses a Softmax head; scores represent relative ranking distributions rather than independent presence probabilities. All outputs must be correlated clinically.
