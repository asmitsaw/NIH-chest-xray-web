"""
Post-processing and thresholding module for Chest-X AI predictions.
Applies medical safety terminology and per-finding thresholds.
"""
from typing import List, Dict, Any, Optional
import numpy as np

from .model_config import (
    DISEASE_CLASSES,
    DEFAULT_GLOBAL_THRESHOLD,
    PER_CLASS_THRESHOLDS
)

def classify_score_status(prob: float, threshold: float) -> str:
    """
    Assigns transparent medical decision-support status without overclaiming certainty.
    Distinguishes elevated model activations from clinical diagnoses.
    """
    if threshold <= 0:
        return "Unknown threshold"
    ratio = prob / threshold
    if ratio >= 2.0 and prob >= 0.15:
        return "Markedly elevated score"
    elif ratio >= 1.2:
        return "Score above operating threshold"
    elif ratio >= 1.0:
        return "Borderline above threshold"
    elif ratio >= 0.75:
        return "Borderline / near threshold"
    else:
        return "Below operating threshold"

def format_prediction_results(
    raw_probabilities: np.ndarray,
    custom_thresholds: Optional[Dict[str, float]] = None,
    global_threshold: Optional[float] = None
) -> Dict[str, Any]:
    """
    Transforms raw prediction vector into a structured response object.
    
    Returns:
        Structured prediction dict with all findings, primary findings, and statistics.
    """
    if raw_probabilities.ndim == 2:
        probs = raw_probabilities[0]
    else:
        probs = raw_probabilities
        
    thresholds = custom_thresholds or PER_CLASS_THRESHOLDS
    default_thresh = global_threshold if global_threshold is not None else DEFAULT_GLOBAL_THRESHOLD
    
    all_findings: List[Dict[str, Any]] = []
    primary_findings: List[Dict[str, Any]] = []
    
    for idx, disease in enumerate(DISEASE_CLASSES):
        prob = float(probs[idx])
        prob_pct = round(prob * 100.0, 2)
        thresh = thresholds.get(disease, default_thresh)
        status = classify_score_status(prob, thresh)
        exceeds = prob >= thresh
        
        finding_item = {
            "disease": disease,
            "class_idx": idx,
            "probability": prob,
            "score_pct": prob_pct,
            "threshold": thresh,
            "threshold_pct": round(thresh * 100.0, 2),
            "exceeds_threshold": exceeds,
            "status": status,
            "interpretation_note": (
                f"Model score: {prob_pct}% (Operating threshold: {round(thresh * 100.0, 1)}%). "
                f"Status: {status}. Decision support aid; correlation by physician required."
            )
        }
        all_findings.append(finding_item)
        if exceeds:
            primary_findings.append(finding_item)
            
    # Sort all findings by probability descending
    all_findings.sort(key=lambda x: x["probability"], reverse=True)
    # Sort primary findings by ratio above threshold descending
    primary_findings.sort(key=lambda x: x["probability"] / max(x["threshold"], 1e-5), reverse=True)
    
    return {
        "all_findings": all_findings,
        "primary_findings": primary_findings,
        "primary_count": len(primary_findings),
        "max_score_disease": all_findings[0]["disease"] if all_findings else None,
        "max_score_pct": all_findings[0]["score_pct"] if all_findings else 0.0,
        "summary": (
            f"{len(primary_findings)} finding(s) exceed operating threshold."
            if primary_findings
            else "No findings exceed operating threshold (Within expected screening limits)."
        )
    }


def postprocess_predictions(
    predictions: Any,
    thresholds: Optional[Dict[str, float]] = None,
    rank_by: str = "probability",
    global_threshold: Optional[float] = None
) -> Dict[str, Any]:
    """
    Flexible postprocessing function supporting arrays, lists, or structured prediction dicts.
    Ranks findings by probability or threshold operating ratio without asserting uncalibrated clinical diagnosis.
    """
    if isinstance(predictions, list) and len(predictions) > 0 and isinstance(predictions[0], dict):
        items = []
        thresh_map = thresholds or PER_CLASS_THRESHOLDS
        default_thresh = global_threshold if global_threshold is not None else DEFAULT_GLOBAL_THRESHOLD
        for item in predictions:
            disease = item.get("disease", "Unknown")
            prob = float(item.get("probability", 0.0))
            thresh = thresh_map.get(disease, default_thresh)
            status = classify_score_status(prob, thresh)
            ratio = prob / max(thresh, 1e-5)
            items.append({
                "disease": disease,
                "probability": prob,
                "score_pct": round(prob * 100.0, 2),
                "threshold": thresh,
                "threshold_pct": round(thresh * 100.0, 2),
                "threshold_ratio": ratio,
                "exceeds_threshold": prob >= thresh,
                "status": status,
                "interpretation_note": f"Model score: {round(prob * 100.0, 2)}% (Threshold: {round(thresh * 100.0, 1)}%). Status: {status}."
            })
        if rank_by == "threshold_ratio":
            items.sort(key=lambda x: x["threshold_ratio"], reverse=True)
        else:
            items.sort(key=lambda x: x["probability"], reverse=True)
        return {
            "predictions": items,
            "primary": [x for x in items if x["exceeds_threshold"]],
        }
    else:
        res = format_prediction_results(predictions, custom_thresholds=thresholds, global_threshold=global_threshold)
        return {
            "predictions": res["all_findings"],
            "primary": res["primary_findings"],
            "summary": res["summary"]
        }
