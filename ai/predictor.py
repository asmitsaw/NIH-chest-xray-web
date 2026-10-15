"""
Predictor orchestrator for Chest-X AI.
Executes end-to-end inference, timing, thresholding, and packaging of structured results.
"""
import time
import io
from typing import Union, Optional, Dict, Any
from PIL import Image

from .model_loader import get_model_adapter
from .preprocessing import preprocess_xray_image, validate_image_file
from .postprocessing import format_prediction_results
from .model_config import MANDATORY_DISCLAIMER

class XRayPredictor:
    """End-to-end prediction engine for chest radiographs."""
    
    def __init__(self, model_path: Optional[str] = None):
        self.adapter = get_model_adapter(model_path=model_path)
        
    def predict_image(
        self,
        image_source: Union[str, bytes, io.BytesIO],
        filename: Optional[str] = None,
        custom_thresholds: Optional[Dict[str, float]] = None,
        global_threshold: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Runs complete inference pipeline on an image.
        
        Returns:
            Dictionary containing structured predictions, display image, timing, and metadata.
        """
        validate_image_file(image_source, filename=filename)
        
        # Preprocessing
        t_start = time.perf_counter()
        tensor, display_pil = preprocess_xray_image(image_source)
        t_pre = time.perf_counter()
        
        # Forward pass inference
        raw_preds = self.adapter.predict(tensor)
        t_infer = time.perf_counter()
        
        # Validate forward pass predictions
        import numpy as np
        if not np.all(np.isfinite(raw_preds)):
            raise RuntimeError("Model forward pass produced non-finite prediction probabilities (NaN or Inf).")
        if raw_preds.shape != (1, 14):
            raise RuntimeError(f"Unexpected prediction output shape: {raw_preds.shape}. Expected (1, 14).")
            
        # Postprocessing
        thresholds_to_use = custom_thresholds
        if thresholds_to_use is None and hasattr(self.adapter, "get_thresholds"):
            thresholds_to_use = self.adapter.get_thresholds()

        structured_results = format_prediction_results(
            raw_preds,
            custom_thresholds=thresholds_to_use,
            global_threshold=global_threshold
        )
        t_end = time.perf_counter()
        
        total_time_ms = round((t_end - t_start) * 1000.0, 2)
        infer_time_ms = round((t_infer - t_pre) * 1000.0, 2)
        
        meta = self.adapter.get_metadata()
        
        return {
            "success": True,
            "predictions": structured_results["all_findings"],
            "primary_findings": structured_results["primary_findings"],
            "primary_count": structured_results["primary_count"],
            "max_finding": structured_results["max_score_disease"],
            "max_score_pct": structured_results["max_score_pct"],
            "input_tensor": tensor,
            "display_image": display_pil,
            "model_version": meta.get("version", "1.0.0"),
            "model_name": meta.get("model_name", "Chest-X AI CNN"),
            "processing_time_ms": total_time_ms,
            "inference_time_ms": infer_time_ms,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            "disclaimer": MANDATORY_DISCLAIMER
        }

# Global helper function
def run_xray_prediction(
    image_source: Union[str, bytes, io.BytesIO],
    filename: Optional[str] = None,
    global_threshold: Optional[float] = None
) -> Dict[str, Any]:
    """Convenience helper to run prediction using the singleton predictor."""
    predictor = XRayPredictor()
    return predictor.predict_image(
        image_source=image_source,
        filename=filename,
        global_threshold=global_threshold
    )
