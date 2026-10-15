"""
Chest-X AI inference service.
Thin HTTP wrapper around the existing `ai/` package (model, preprocessing, Grad-CAM).
The Node API calls this service; the browser never talks to it directly.
"""
import base64
import io
import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

# Load .env if present
env_file = os.path.join(BASE_DIR, ".env")
if os.path.exists(env_file):
    with open(env_file, "r", encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

import cv2
from flask import Flask, jsonify, request

from ai.model_config import (DISEASE_CLASSES, DEFAULT_GLOBAL_THRESHOLD,
                             MANDATORY_DISCLAIMER, PER_CLASS_THRESHOLDS)
from ai.model_loader import get_model_adapter
from ai.preprocessing import preprocess_xray_image, PreprocessingError
from ai.postprocessing import format_prediction_results
from ai.gradcam import generate_explainability_for_finding, EXPLAINABILITY_DISCLAIMER

COLORMAPS = {
    "jet": cv2.COLORMAP_JET, "turbo": cv2.COLORMAP_TURBO,
    "viridis": cv2.COLORMAP_VIRIDIS, "plasma": cv2.COLORMAP_PLASMA,
    "inferno": cv2.COLORMAP_INFERNO, "hot": cv2.COLORMAP_HOT,
}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB limit
_adapter = None


def adapter():
    global _adapter
    if _adapter is None:
        _adapter = get_model_adapter()
    return _adapter


def read_upload():
    if "image" not in request.files:
        raise ValueError("Missing 'image' file field in multipart request.")
    f = request.files["image"]
    if not f.filename or f.filename.strip() == "":
        raise ValueError("No file selected in 'image' upload field.")
    raw = f.read()
    if len(raw) == 0:
        raise ValueError("Uploaded image file is empty (0 bytes).")
    if len(raw) > 16 * 1024 * 1024:
        raise ValueError("Uploaded image exceeds the 16 MB maximum size limit.")
    return io.BytesIO(raw)


def png_b64(pil_img):
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@app.get("/health")
def health():
    try:
        ad = adapter()
        if not ad.is_loaded or ad.model is None:
            return jsonify(ok=False, ready=False, error="Model weights are not loaded into memory."), 503
        meta = ad.get_metadata()
        return jsonify(
            ok=True,
            ready=True,
            model=meta.get("model_name"),
            version=meta.get("version"),
            target_layer=meta.get("target_gradcam_layer"),
            classes_count=meta.get("num_classes", len(DISEASE_CLASSES))
        )
    except Exception as e:
        return jsonify(ok=False, ready=False, error=str(e)), 503


@app.get("/config")
def config():
    ad = adapter()
    threshs = ad.get_thresholds() if hasattr(ad, "get_thresholds") else PER_CLASS_THRESHOLDS
    return jsonify(classes=DISEASE_CLASSES, thresholds=threshs,
                   default_threshold=DEFAULT_GLOBAL_THRESHOLD,
                   disclaimer=MANDATORY_DISCLAIMER, xai_disclaimer=EXPLAINABILITY_DISCLAIMER,
                   colormaps=list(COLORMAPS))


@app.post("/predict")
def predict():
    try:
        data = read_upload()
        tensor, _ = preprocess_xray_image(data)
        import time
        t0 = time.perf_counter()
        ad = adapter()
        raw = ad.predict(tensor)
        ms = round((time.perf_counter() - t0) * 1000, 2)
        
        gt = request.form.get("threshold")
        threshold_val = None
        if gt is not None and gt.strip() != "":
            try:
                threshold_val = float(gt)
                if not (0.0 <= threshold_val <= 1.0):
                    return jsonify(error="Threshold parameter must be between 0.0 and 1.0"), 400
            except ValueError:
                return jsonify(error="Invalid numeric threshold parameter"), 400
                
        threshs = ad.get_thresholds() if hasattr(ad, "get_thresholds") else PER_CLASS_THRESHOLDS
        res = format_prediction_results(raw, custom_thresholds=threshs, global_threshold=threshold_val)
        meta = ad.get_metadata()
        return jsonify(
            predictions=res["all_findings"], primary_findings=res["primary_findings"],
            model_version=meta.get("version", "1.0.0"), model_name=meta.get("model_name"),
            inference_time_ms=ms, disclaimer=MANDATORY_DISCLAIMER)
    except (ValueError, PreprocessingError) as ve:
        return jsonify(error=str(ve)), 400
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.post("/gradcam")
def gradcam():
    try:
        data = read_upload()
        disease = request.form.get("disease", "").strip()
        if not disease:
            return jsonify(error="Missing required 'disease' parameter"), 400
        if disease not in DISEASE_CLASSES:
            return jsonify(error=f"Invalid disease finding '{disease}'. Allowed classes: {', '.join(DISEASE_CLASSES)}"), 400
            
        try:
            alpha = float(request.form.get("alpha", 0.45))
            alpha = max(0.0, min(1.0, alpha))
        except ValueError:
            return jsonify(error="Invalid numeric 'alpha' parameter (must be between 0.0 and 1.0)"), 400
            
        cmap_name = request.form.get("colormap", "jet").lower()
        if cmap_name not in COLORMAPS:
            return jsonify(error=f"Unsupported colormap '{cmap_name}'. Allowed: {', '.join(COLORMAPS)}"), 400
        cmap = COLORMAPS[cmap_name]
        
        tensor, display = preprocess_xray_image(data)
        out = generate_explainability_for_finding(
            adapter(), tensor, display, disease, alpha=alpha, colormap=cmap,
            invert_base=request.form.get("invert") == "1")
        return jsonify(disease=disease, layer=out["layer_name"],
                       heatmap=png_b64(out["heatmap_image"]),
                       overlay=png_b64(out["overlay_image"]),
                       disclaimer=out["disclaimer"])
    except (ValueError, PreprocessingError) as ve:
        return jsonify(error=str(ve)), 400
    except Exception as e:
        return jsonify(error=str(e)), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("ML_PORT", 5001)))
