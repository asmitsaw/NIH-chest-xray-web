"""
Configuration for Chest-X AI models and inference pipeline.
"""
import os
from typing import List, Dict

# Official 14 Disease classes from NIH Chest X-Ray Dataset (excluding 'No Finding')
DISEASE_CLASSES: List[str] = [
    "Atelectasis",
    "Consolidation",
    "Infiltration",
    "Pneumothorax",
    "Edema",
    "Emphysema",
    "Fibrosis",
    "Effusion",
    "Pneumonia",
    "Pleural_Thickening",
    "Cardiomegaly",
    "Nodule",
    "Mass",
    "Hernia"
]

# Baseline / Default Thresholds (Configurable per disease)
DEFAULT_GLOBAL_THRESHOLD: float = 0.50

# All 18 Pathologies supported by TorchXRayVision DenseNet-121 (densenet121-res224-all)
ALL_XRV_PATHOLOGIES: List[str] = [
    "Atelectasis", "Consolidation", "Infiltration", "Pneumothorax",
    "Edema", "Emphysema", "Fibrosis", "Effusion", "Pneumonia",
    "Pleural_Thickening", "Cardiomegaly", "Nodule", "Mass", "Hernia",
    "Lung Lesion", "Fracture", "Lung Opacity", "Enlarged Cardiomediastinum"
]

# Calibrated Operating Thresholds from TorchXRayVision (DenseNet-121 densenet121-res224-all)
PER_CLASS_THRESHOLDS: Dict[str, float] = {
    "Atelectasis": 0.0742,
    "Consolidation": 0.0383,
    "Infiltration": 0.0981,
    "Pneumothorax": 0.0098,
    "Edema": 0.0236,
    "Emphysema": 0.0022,
    "Fibrosis": 0.0101,
    "Effusion": 0.1032,
    "Pneumonia": 0.0568,
    "Pleural_Thickening": 0.0268,
    "Cardiomegaly": 0.0503,
    "Nodule": 0.0240,
    "Mass": 0.0194,
    "Hernia": 0.0429,
    "Lung Lesion": 0.0534,
    "Fracture": 0.0360,
    "Lung Opacity": 0.2020,
    "Enlarged Cardiomediastinum": 0.0502
}

# Model Image Specifications for TorchXRayVision
DEFAULT_IMAGE_SIZE: tuple = (224, 224)
DEFAULT_COLOR_MODE: str = "grayscale"  # "grayscale" (1 channel) or "rgb" (3 channels)
DEFAULT_CHANNELS: int = 1
DEFAULT_RESCALE: float = 1.0 / 255.0
TORCHXRAYVISION_INTENSITY_BOUNDS: tuple = (-1024.0, 1024.0)

# Paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_MODEL_PATH = os.path.join(BASE_DIR, "models", "weights", "weights.best.05-1.74.hdf5")
if not os.path.exists(DEFAULT_MODEL_PATH):
    fallback_path = os.path.join(BASE_DIR, "results (1)", "weights.best.05-1.74.hdf5")
    if os.path.exists(fallback_path):
        DEFAULT_MODEL_PATH = fallback_path

# Target Feature Layer for Explainable AI (Grad-CAM)
GRADCAM_TARGET_LAYER = "denseblock4"

# Medical Safety Warnings & Legal Disclaimers
MANDATORY_DISCLAIMER: str = (
    "AI-generated analysis for research/educational use. This system does not provide "
    "a definitive medical diagnosis. Results must be reviewed by a qualified healthcare professional."
)

MODEL_LIMITATIONS_NOTE: str = (
    "Note on Architecture & Training: Powered by TorchXRayVision DenseNet-121 (densenet121-res224-all), "
    "pretrained across 800,000+ radiographs (NIH ChestX-ray14, CheXpert, MIMIC-CXR, PadChest) with "
    "independent Sigmoid activations and documented operating thresholds. Serves as clinical decision "
    "support; primary diagnosis must be established by a licensed physician."
)


