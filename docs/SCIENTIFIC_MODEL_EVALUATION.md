# Chest-X AI v2 — Scientific Model Evaluation & Roadmap

**Document:** `docs/SCIENTIFIC_MODEL_EVALUATION.md`  
**Date:** 2026-10-15  
**Domain:** Medical Imaging & Machine Learning Engineering  
**Scope:** Rigorous evaluation of the baseline CNN, clinical risk assessment, and formal technical specifications for future model iterations.  

---

## 1. Executive Summary & Provenance

Chest-X AI v2 integrates a 5-stage Convolutional Neural Network (CNN) trained on the NIH ChestX-ray14 dataset. The model weights are preserved in [`models/weights/weights.best.05-1.74.hdf5`](file:///d:/chestx-ai-v2/models/weights/weights.best.05-1.74.hdf5) (4.20 MB), trained via the legacy Jupyter notebook [`nih-chest-x-ray-multi-classification.ipynb`](file:///d:/chestx-ai-v2/nih-chest-x-ray-multi-classification.ipynb).

This document details the scientific characteristics, architectural compromises, and clinical risks of the baseline model, defines the evaluation protocol, and provides non-negotiable architectural requirements for any future multi-label classification pipeline.

---

## 2. Forensic Analysis of the Baseline Model

### 2.1 Model Topology
- **Input Dimensions:** `(128, 128, 1)` (single-channel grayscale, rescaled to `[0.0, 1.0]`).
- **Feature Extractor:** 5 convolutional blocks:
  - Block 1: `Conv2D(8, 3x3, same, ReLU) -> MaxPool(2x2) -> Dropout(0.2)`
  - Block 2: `Conv2D(16, 3x3, same, ReLU) -> MaxPool(2x2) -> Dropout(0.2)`
  - Block 3: `Conv2D(32, 3x3, same, ReLU) -> MaxPool(2x2) -> Dropout(0.2)`
  - Block 4: `Conv2D(64, 3x3, same, ReLU) -> MaxPool(2x2) -> Dropout(0.2)`
  - Block 5: `Conv2D(128, 3x3, same, ReLU) -> MaxPool(3x3) -> Dropout(0.2)` (Layer Name: `conv2d_5`)
- **Classifier Head:** `Flatten() -> Dense(500, ReLU) -> Dropout(0.2) -> Dense(14, Softmax)`.
- **Training Loss:** `categorical_crossentropy` with Adam optimizer.
- **Parameters:** ~1.1 million trainable weights.

---

## 3. Critical Scientific & Clinical Limitations

### 3.1 Softmax Head vs. Multi-Label Pathology Co-occurrence
- **The Defect:** In human chest radiography, pulmonary pathologies are non-mutually exclusive. A patient may present concurrently with *Pneumonia*, *Pleural Effusion*, and *Atelectasis*.
- **The Consequence:** The baseline model uses `activation='softmax'`, which enforces a simplex constraint:
  $$\sum_{i=1}^{14} p_i = 1.0$$
  This causes the findings to **compete against one another**. An overwhelming opacity from a large pleural effusion will artificially suppress the output score for an adjacent pneumonia or consolidation, even when both pathologies are actively present.
- **Clinical Translation:** Model scores are **relative ranking statistics**, NOT calibrated probabilities of disease presence. A score of 0.28 does not mean a 28% risk of disease; it means the finding was ranked highest relative to the other 13 findings.

### 3.2 Patient-Level Data Leakage in Training Split
- **The Defect:** In cell 10 of `nih-chest-x-ray-multi-classification.ipynb`, the training and test sets were split using:
  ```python
  train_set, test_set = train_test_split(xray_data, test_size=0.2, random_state=1993)
  ```
- **The Consequence:** The split was performed at the **image level** rather than the **patient level**. In the NIH ChestX-ray14 dataset, patients have multiple longitudinal radiographs taken across weeks or months. Splitting by image row allowed radiographs of the *same patient* to appear in both the training set and the test set.
- **Scientific Impact:** The CNN could memorize patient-specific anatomical landmarks (such as thoracic cage shape, cardiac silhouette baseline, surgical hardware, or foreign bodies), artificially inflating test AUROC.

### 3.3 Severe Under-Training
- **The Defect:** The final checkpoint was trained for only 5 epochs with 50 steps per epoch and a batch size of 64 (`5 * 50 * 64 = 16,000` image exposures).
- **The Consequence:** The NIH dataset comprises 112,120 radiographs. The model was exposed to less than 15% of the available training data during optimization.

### 3.4 Silver-Standard NLP Text Labels
- **The Defect:** Ground truth labels in the NIH dataset were extracted from uncurated text radiology reports using natural language processing (DNorm and MetaMap).
- **The Consequence:** Published validation studies indicate label error rates of 10% to 15% in the NIH dataset. Models trained on these labels learn the noise of the NLP parser.

### 3.5 Grad-CAM Spatial Coarseness
- **The Defect:** The target explainability feature layer `conv2d_5` has a spatial feature map of only `8 x 8` pixels.
- **The Consequence:** Upsampling an `8 x 8` activation map to `128 x 128` (or the original film resolution) produces broad regional heatmaps. While valuable for high-level saliency checks, it cannot provide fine-grained lesion contouring or boundary delineation.

---

## 4. Reproducible Model Evaluation Protocol

To prevent subjective or unscientific performance claims, any model evaluated within the Chest-X AI project must adhere to the following evaluation pipeline:

### 4.1 Partition Protocol (Strict Group Split)
```python
from sklearn.model_selection import GroupShuffleSplit

gss = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
train_idx, test_idx = next(gss.split(df, groups=df['Patient ID']))
train_val_df = df.iloc[train_idx]
test_df = df.iloc[test_idx]

# Assert ZERO patient leakage across partitions
train_patients = set(train_val_df['Patient ID'])
test_patients = set(test_df['Patient ID'])
assert len(train_patients.intersection(test_patients)) == 0, "Patient leakage detected!"
```

### 4.2 Comprehensive Multi-Label Metric Battery
For each of the 14 findings $c \in \{1, \dots, 14\}$:
1. **AUROC (Area Under ROC Curve):** Measures discrimination ability across all potential decision thresholds.
2. **AUPRC (Area Under Precision-Recall Curve):** Essential for highly imbalanced medical findings (e.g., Hernia prevalence is <0.2%, where AUROC can be deceptively optimistic).
3. **Optimal Operating Threshold ($\tau_c$):** Selected using Youden's Index on the validation set:
   $$J(\tau) = \text{Sensitivity}(\tau) + \text{Specificity}(\tau) - 1$$
4. **Target Operating Points:**
   - High-Sensitivity Operating Point ($\text{Sensitivity} \ge 90\%$) for screening triage.
   - High-Specificity Operating Point ($\text{Specificity} \ge 95\%$) for confirmatory workflow.
5. **Expected Calibration Error (ECE):** Evaluates whether predicted probabilities reflect real-world event frequencies.

---

## 5. Architectural Requirements for Next-Generation Models

Any future model proposed to replace or supplement `weights.best.05-1.74.hdf5` must satisfy the following non-negotiable requirements before deployment:

| Specification Requirement | Mandatory Standard | Rationale |
| :--- | :--- | :--- |
| **Output Activation** | **14 Independent Sigmoid Units** | Allows multi-label coexistence without competitive simplex suppression. |
| **Loss Function** | **Weighted Binary Cross-Entropy** or **Focal Loss** | Addresses severe class imbalance (positive finding rarity). |
| **Data Partitioning** | **Strict Patient-Level Group Split** | Guarantees zero identity leakage between train, validation, and test. |
| **Input Resolution** | **$224 \times 224$ or $512 \times 512$** | Small focal opacities (e.g., solitary nodules, apical pneumothoraces) are erased at $128 \times 128$. |
| **Model Architecture** | **DenseNet-121 / ConvNeXt-Tiny** | Standardized medical imaging backbone with dense feature reuse. |
| **Artifact Versioning** | **Semantic Versioning + SHA256** | Checkpoints must be versioned (e.g. `v2.0.0-densenet121-bce.h5`) with checksum and provenance JSON. |
| **Clinical Validation Rule** | **Zero Claim Without Execution** | No performance numbers may be documented without verifiable, reproducible test scripts. |

---

## 6. Upgraded Foundation Model: TorchXRayVision DenseNet-121 (Option 1)

In response to the clinical limitations of the legacy Softmax CNN, Chest-X AI v2 now integrates **TorchXRayVision DenseNet-121** as the primary inference engine:

1. **Pretrained Foundation:** Trained on over 800,000 multi-center chest radiographs across NIH ChestX-ray14, CheXpert, MIMIC-CXR, PadChest, and RSNA Pneumonia datasets.
2. **Independent Sigmoid Multi-Label Outputs:** Replaces the competitive Softmax simplex constraint with independent Sigmoid probability units for each pathology.
3. **Calibrated Operating Thresholds:** Employs published clinical operating points (`op_threshs`) calibrated across 14 NIH pathologies:
   - Atelectasis: 0.0742, Consolidation: 0.0383, Infiltration: 0.0981, Pneumothorax: 0.0098, Edema: 0.0236, Emphysema: 0.0022, Fibrosis: 0.0101, Effusion: 0.1032, Pneumonia: 0.0568, Pleural Thickening: 0.0268, Cardiomegaly: 0.0503, Nodule: 0.0240, Mass: 0.0194, Hernia: 0.0429.
4. **Enhanced Resolution:** Input resolution upgraded from $128 \times 128$ to standard $224 \times 224 \times 1$ with lung-field normalization.
5. **Explainable AI (Grad-CAM):** Gradient-weighted Class Activation Mapping computed directly on feature block `denseblock4` with bicubic interpolation, OpenCV colormapping (Jet, Turbo, Viridis, etc.), and alpha blending.

---

## 7. Current Operational Guidance for Clinicians

1. **Multi-Label Findings:** The upgraded model allows co-occurring pathologies (e.g., Pneumonia + Infiltration) to both score positively without competitive suppression.
2. **Threshold Exceedance:** A finding is classified as positive when its independent probability exceeds its calibrated operating threshold.
3. **Grad-CAM Saliency:** The highlighted regions on `denseblock4` represent the visual features influencing the model's forward pass; they assist physician review and do not replace definitive radiology diagnosis.
4. **All decisions must rely on independent clinical examination and primary radiograph review by a qualified radiologist.**

