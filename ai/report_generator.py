"""
AI Preliminary Clinical Report Generator for Chest-X AI.
Generates structured, non-hallucinatory preliminary documentation for physician review.
"""
import time
from typing import Dict, Any, Optional, List
from .model_config import MANDATORY_DISCLAIMER, MODEL_LIMITATIONS_NOTE

def generate_preliminary_ai_report(
    patient_data: Dict[str, Any],
    study_data: Dict[str, Any],
    ai_results: Dict[str, Any],
    explainability_info: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Generates a structured preliminary report object without hallucinating external clinical data.
    """
    findings = ai_results.get("primary_findings", [])
    all_findings = ai_results.get("predictions", [])
    model_version = ai_results.get("model_version", "NIH-CNN-v1.0")
    timestamp = ai_results.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()))
    
    # Format AI Findings Text
    if findings:
        findings_lines = []
        for f in findings:
            findings_lines.append(
                f"- **{f['disease']}**: Model probability score of {f['score_pct']}% "
                f"({f['status']}, threshold: {f['threshold_pct']}%)"
            )
        findings_summary_text = "\n".join(findings_lines)
    else:
        findings_summary_text = "No evaluated finding exceeded the configured reporting threshold."

    # Explainability summary
    if explainability_info:
        xai_lines = [
            f"- Grad-CAM visual attribution computed for: {', '.join([x['disease'] for x in explainability_info])}."
        ]
        xai_text = "\n".join(xai_lines)
    else:
        xai_text = "Grad-CAM explainability heatmaps available upon physician request in the analysis console."

    report_content = f"""# CHEST-X AI PRELIMINARY CLINICAL DECISION-SUPPORT REPORT

**STATUS:** PRELIMINARY AI-ASSISTED REPORT — REQUIRES PHYSICIAN REVIEW AND SIGN-OFF
**GENERATED:** {timestamp}

---

### 1. PATIENT INFORMATION
- **Full Name:** {patient_data.get('full_name', 'N/A')}
- **Medical Record Number (MRN):** {patient_data.get('mrn', 'N/A')}
- **Age / Gender:** {patient_data.get('age', 'N/A')} yrs / {patient_data.get('gender', 'N/A')}
- **Blood Group:** {patient_data.get('blood_group', 'N/A')}

### 2. STUDY INFORMATION
- **Study Type:** {study_data.get('study_type', 'Chest Radiograph (PA/AP)')}
- **Study UID:** {study_data.get('study_uid', 'N/A')}
- **Acquisition / Upload Date:** {study_data.get('study_date', timestamp)}
- **AI Model Engine:** {model_version}

### 3. AI-DETECTED FINDINGS & MODEL PROBABILITIES
{findings_summary_text}

### 4. EXPLAINABLE AI ATTRIBUTION (GRAD-CAM)
{xai_text}

### 5. MODEL LIMITATIONS & SAFETY NOTICE
- {MODEL_LIMITATIONS_NOTE}
- **Notice:** {MANDATORY_DISCLAIMER}

---

### 6. ATTENDING PHYSICIAN REVIEW & FINAL IMPRESSION
*(This section must be completed and authorized by a licensed healthcare professional)*

- **Physician Review Status:** PENDING PHYSICIAN AUTHORIZATION
- **Doctor Final Impression:** [ Awaiting clinical sign-off ]
- **Attending Doctor:** {study_data.get('doctor_name', 'Unassigned / Pending')}
"""

    return {
        "title": f"Preliminary AI Report - {patient_data.get('mrn', 'Study')}",
        "raw_markdown": report_content,
        "patient_id": patient_data.get("id"),
        "study_id": study_data.get("id"),
        "timestamp": timestamp,
        "is_draft": True,
        "disclaimer": MANDATORY_DISCLAIMER
    }
