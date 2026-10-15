"""
Explainable AI (XAI) Grad-CAM generation and visualization module for Chest-X AI.
Provides visual attribution heatmaps highlighting regions influencing AI predictions.
"""
import os
import time
from typing import Tuple, Dict, Any, Optional
import numpy as np
from PIL import Image
import cv2

from .model_config import DISEASE_CLASSES
from .model_adapter import AbstractModelAdapter

EXPLAINABILITY_DISCLAIMER: str = (
    "Explainability Note: The highlighted regions represent areas in the radiograph that "
    "contributed strongly to the model's prediction score. Highlighting does not constitute "
    "independent medical proof of pathology and must be correlated clinically by a physician."
)

# Colormap mappings
COLORMAP_OPTIONS = {
    "Jet (Default Medical)": cv2.COLORMAP_JET,
    "Turbo (High Dynamic Range)": cv2.COLORMAP_TURBO,
    "Viridis (Perceptually Uniform)": cv2.COLORMAP_VIRIDIS,
    "Plasma (High Contrast)": cv2.COLORMAP_PLASMA,
    "Inferno (Hot Spot Focus)": cv2.COLORMAP_INFERNO,
    "Hot (Thermal Radiation)": cv2.COLORMAP_HOT
}

def compute_gradcam_overlay(
    raw_heatmap: np.ndarray,
    original_rgb_image: Image.Image,
    alpha: float = 0.45,
    colormap: int = cv2.COLORMAP_JET,
    invert_base: bool = False
) -> Tuple[Image.Image, Image.Image]:
    """
    Transforms raw 2D feature map into:
    1. Colorized heatmap
    2. Blended alpha overlay onto original or inverted X-Ray
    
    Args:
        raw_heatmap: 2D numpy array [0..1]
        original_rgb_image: PIL RGB image
        alpha: Blending weight (0 = original only, 1 = heatmap only)
        colormap: OpenCV colormap constant
        invert_base: If True, inverts the grayscale radiograph for enhanced bone/tissue contrast
        
    Returns:
        (heatmap_pil_rgb, overlay_pil_rgb)
    """
    orig_w, orig_h = original_rgb_image.size
    
    # Ensure heatmap is 2D float in range [0, 1]
    heatmap_norm = np.nan_to_num(raw_heatmap, nan=0.0, posinf=1.0, neginf=0.0)
    if heatmap_norm.max() > 0:
        heatmap_norm = heatmap_norm / heatmap_norm.max()
        
    # Resize heatmap to match original image dimensions using cubic interpolation
    heatmap_resized = cv2.resize(heatmap_norm, (orig_w, orig_h), interpolation=cv2.INTER_CUBIC)
    heatmap_uint8 = np.uint8(255 * np.clip(heatmap_resized, 0.0, 1.0))
    
    # Apply colormap (produces BGR)
    colored_bgr = cv2.applyColorMap(heatmap_uint8, colormap)
    colored_rgb = cv2.cvtColor(colored_bgr, cv2.COLOR_BGR2RGB)
    
    # Original image as array
    orig_np = np.array(original_rgb_image, dtype=np.uint8)
    if invert_base:
        orig_np = 255 - orig_np
    
    # Blend overlay: (1-alpha)*orig + alpha*heatmap
    clamped_alpha = float(np.clip(alpha, 0.0, 1.0))
    overlay_np = cv2.addWeighted(orig_np, 1.0 - clamped_alpha, colored_rgb, clamped_alpha, 0)
    
    heatmap_pil = Image.fromarray(colored_rgb)
    overlay_pil = Image.fromarray(overlay_np)
    
    return heatmap_pil, overlay_pil


def generate_explainability_for_finding(
    adapter: AbstractModelAdapter,
    input_tensor: np.ndarray,
    original_display_image: Image.Image,
    disease_name: str,
    layer_name: Optional[str] = None,
    alpha: float = 0.45,
    colormap: int = cv2.COLORMAP_JET,
    invert_base: bool = False,
    output_dir: Optional[str] = None
) -> Dict[str, Any]:
    """
    Full pipeline to generate Grad-CAM for a specified disease finding with customizable visual params.
    
    Returns dictionary with:
    - disease: str
    - class_idx: int
    - heatmap_image: PIL Image
    - overlay_image: PIL Image
    - original_image: PIL Image
    - raw_heatmap: np.ndarray
    - layer_name: str
    - alpha: float
    - heatmap_path: str (if saved)
    - overlay_path: str (if saved)
    - metadata: dict
    - disclaimer: str
    """
    if disease_name not in DISEASE_CLASSES:
        raise ValueError(f"Unknown disease finding: {disease_name}. Available: {DISEASE_CLASSES}")
        
    class_idx = DISEASE_CLASSES.index(disease_name)
    alpha = float(np.clip(alpha, 0.0, 1.0))
    
    raw_heatmap, meta = adapter.explain(input_tensor, class_idx=class_idx, layer_name=layer_name)
    raw_heatmap = np.nan_to_num(raw_heatmap, nan=0.0, posinf=1.0, neginf=0.0)
    heatmap_pil, overlay_pil = compute_gradcam_overlay(
        raw_heatmap=raw_heatmap,
        original_rgb_image=original_display_image,
        alpha=alpha,
        colormap=colormap,
        invert_base=invert_base
    )
    
    heatmap_path = None
    overlay_path = None
    
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        ts = int(time.time() * 1000)
        clean_disease = disease_name.lower().replace(" ", "_")
        h_file = f"gradcam_heat_{clean_disease}_{ts}.png"
        o_file = f"gradcam_over_{clean_disease}_{ts}.png"
        
        heatmap_path = os.path.join(output_dir, h_file)
        overlay_path = os.path.join(output_dir, o_file)
        
        heatmap_pil.save(heatmap_path)
        overlay_pil.save(overlay_path)
        
    return {
        "disease": disease_name,
        "class_idx": class_idx,
        "original_image": original_display_image,
        "heatmap_image": heatmap_pil,
        "overlay_image": overlay_pil,
        "raw_heatmap": raw_heatmap,
        "layer_name": meta.get("layer", "conv2d_5"),
        "alpha": alpha,
        "heatmap_path": heatmap_path,
        "overlay_path": overlay_path,
        "metadata": meta,
        "disclaimer": EXPLAINABILITY_DISCLAIMER
    }
