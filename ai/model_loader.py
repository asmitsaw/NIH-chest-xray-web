"""
Model loader factory and singleton cache for Chest-X AI.
Allows dynamic configuration of model path and adapter selection.
"""
import os
import logging
from typing import Optional

from .model_config import DEFAULT_MODEL_PATH
from .model_adapter import (
    AbstractModelAdapter,
    TorchXRayVisionDenseNetAdapter,
    KerasSequentialAdapter
)

logger = logging.getLogger("chest_x_ai.model_loader")

_GLOBAL_ADAPTER: Optional[AbstractModelAdapter] = None

def get_model_adapter(
    model_path: Optional[str] = None,
    backend: Optional[str] = None,
    force_reload: bool = False
) -> AbstractModelAdapter:
    """
    Returns the loaded model adapter instance (singleton cached).
    
    Defaults to TorchXRayVision DenseNet-121 (Option 1).
    Can be configured via backend="keras" or MODEL_BACKEND="keras" in environment.
    """
    global _GLOBAL_ADAPTER
    
    selected_backend = backend or os.environ.get("MODEL_BACKEND", "torchxrayvision").lower()
    selected_path = model_path or os.environ.get("MODEL_PATH") or DEFAULT_MODEL_PATH
    
    if _GLOBAL_ADAPTER is not None and not force_reload:
        meta = _GLOBAL_ADAPTER.get_metadata()
        is_same_backend = (
            (selected_backend == "keras" and "Baseline CNN" in meta.get("model_name", "")) or
            (selected_backend != "keras" and "TorchXRayVision" in meta.get("model_name", ""))
        )
        if is_same_backend and _GLOBAL_ADAPTER.is_loaded:
            return _GLOBAL_ADAPTER
            
    if selected_backend == "keras":
        logger.info(f"Loading legacy Keras Sequential CNN from: {selected_path}")
        adapter = KerasSequentialAdapter(model_path=selected_path)
    else:
        weights = os.environ.get("TORCHXRAYVISION_WEIGHTS", "all")
        logger.info(f"Loading TorchXRayVision DenseNet-121 (weights: {weights})")
        adapter = TorchXRayVisionDenseNetAdapter(weights=weights)
        
    _GLOBAL_ADAPTER = adapter
    return _GLOBAL_ADAPTER

def check_model_compatibility(model_path: str) -> dict:
    """
    Validates model file existence and tests forward inference.
    """
    results = {
        "path": model_path,
        "exists": os.path.exists(model_path),
        "compatible": False,
        "error": None,
        "metadata": None
    }
    if not results["exists"]:
        results["error"] = "File not found"
        return results
        
    try:
        adapter = KerasSequentialAdapter(model_path=model_path)
        import numpy as np
        test_tensor = np.zeros((1, 128, 128, 1), dtype=np.float32)
        preds = adapter.predict(test_tensor)
        if preds.shape == (1, 14):
            results["compatible"] = True
            results["metadata"] = adapter.get_metadata()
        else:
            results["error"] = f"Unexpected prediction shape: {preds.shape} (Expected (1, 14))"
    except Exception as e:
        results["error"] = str(e)
        
    return results
