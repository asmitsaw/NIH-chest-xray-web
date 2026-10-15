# Chest-X AI: Model Findings & De-risking Report (Phase 1)

## 1. Executive Summary & Verification
Phase 1 de-risking verified that the legacy Keras/HDF5 neural network weights (`weights.best.05-1.74.hdf5`, 4.20 MB) successfully load, perform inference on real radiograph tensors, and generate valid Gradient-weighted Class Activation Maps (Grad-CAM).

- **Execution Command:** `py -3.13 scripts/verify_inference.py`
- **Result:** **100% Operational (Code 0)**
- **Python Runtime:** `Python 3.13.7 (64-bit AMD64)`
- **TensorFlow Engine:** `TensorFlow 2.20.0`

---

## 2. Model Specifications Extracted from Notebook
From [`nih-chest-x-ray-multi-classification.ipynb`](../nih-chest-x-ray-multi-classification.ipynb):

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Input Shape** | `(128, 128, 1)` | Grayscale normalized `[0.0, 1.0]` |
| **Channels** | 1 | Single-channel grayscale |
| **Rescaling** | `1.0 / 255.0` | Bilinear resizing |
| **Architecture** | 5-Block Conv2D + Dense | Sequential / Functional equivalent |
| **Conv Filter Stages** | 8 -> 16 -> 32 -> 64 -> 128 | 3x3 Kernels, `same` padding, ReLU |
| **Pooling & Regularization** | MaxPooling2D + Dropout(0.2) | Pooling size 2x2 (Block 1-4), 3x3 (Block 5) |
| **Dense Head** | Dense(500, ReLU) -> Dropout(0.2) | Fully-connected latent representation |
| **Output Activation** | Softmax (14 Classes) | Multi-class / multi-label probability vector |
| **Loss Function** | `categorical_crossentropy` | Adam Optimizer |
| **Target XAI Layer** | `conv2d_5` | 128 feature channels for Grad-CAM |

---

## 3. Official 14 Disease Label Index Order
The model output vector order strictly adheres to the NIH 14 dataset labels:
1. `Atelectasis` (Index 0)
2. `Consolidation` (Index 1)
3. `Infiltration` (Index 2)
4. `Pneumothorax` (Index 3)
5. `Edema` (Index 4)
6. `Emphysema` (Index 5)
7. `Fibrosis` (Index 6)
8. `Effusion` (Index 7)
9. `Pneumonia` (Index 8)
10. `Pleural_Thickening` (Index 9)
11. `Cardiomegaly` (Index 10)
12. `Nodule` (Index 11)
13. `Mass` (Index 12)
14. `Hernia` (Index 13)

---

## 4. Verification Evidence

### Inference Performance
* Model Weight Loading Time: `246.9 ms`
* Preprocessing + Rescaling: `(1, 128, 128, 1)` float32 in `[0.000, 0.890]`
* Single Forward-Pass Latency: `289.9 ms`

### Explainability (Grad-CAM)
* Target Feature Layer: `conv2d_5`
* Gradient Routing: Global Average Pooling over `tf.GradientTape`
* Composite Blending: Alpha-blended JET / Turbo / Viridis colormaps onto original radiograph.
* Saved artifacts: `outputs/heatmaps/gradcam_heat_*.png`, `outputs/heatmaps/gradcam_over_*.png`

---

## 5. Scope Tier Status

### Tier 1 (MVP Vertical Slice) — COMPLETE & VERIFIED
- [x] PBKDF2/SHA256 RBAC Authentication with DOCTOR, PATIENT, and ADMIN roles.
- [x] Patient Directory & Registration.
- [x] X-Ray Upload with image format/channel validation.
- [x] Real 14-Class Inference via `KerasSequentialAdapter`.
- [x] Interactive Grad-CAM XAI Panel with dynamic alpha opacity, layer selection, and colormaps.
- [x] Doctor Review sign-off panel with confirm/reject/add findings workflow.
- [x] PDF/Markdown clinical decision support preliminary and finalized report exports.
- [x] Full audit logging of all system actions.

### Tier 2 — COMPLETE & VERIFIED
- [x] Patient longitudinal radiograph timeline.
- [x] Side-by-side study comparison with model score differences.
- [x] Consultation scheduling with appointment management.
- [x] Role-aware glassmorphic dashboards computed from SQLite database records.
- [x] Model Performance page with actual training ROC curves from `results (1)`.
- [x] NIH Dataset & Citation documentation page.

### Tier 3 — AVAILABLE
- [x] Doctor AI Clinical Assistant with grounded context retrieval.
