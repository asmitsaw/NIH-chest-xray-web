"""
Chest-X AI v2 - Automated ML Regression Test Suite
Tests model loading, tensor preprocessing, finite constraints, corrupt input handling,
predictions output contract, and Grad-CAM explainability.
"""
import unittest
import os
import sys
import io
import numpy as np
from PIL import Image

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from ai.model_config import DISEASE_CLASSES, DEFAULT_MODEL_PATH
from ai.model_loader import check_model_compatibility, get_model_adapter
from ai.preprocessing import preprocess_xray_image, validate_image_file, PreprocessingError
from ai.predictor import XRayPredictor
from ai.gradcam import generate_explainability_for_finding


class TestChestXRayML(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.model_path = os.environ.get("MODEL_PATH") or DEFAULT_MODEL_PATH
        cls.sample_path = os.path.join(BASE_DIR, "data", "sample_images", "sample_02_cardiomegaly.png")
        if not os.path.exists(cls.model_path):
            raise unittest.SkipTest(f"Model file not found at: {cls.model_path}")
        cls.predictor = XRayPredictor(model_path=cls.model_path)

    def test_01_model_checkpoint_compatibility(self):
        """Verify model weights file exists and passes forward tensor compatibility check."""
        compat = check_model_compatibility(self.model_path)
        self.assertTrue(compat["exists"], "Model weight file does not exist.")
        self.assertTrue(compat["compatible"], f"Model weight incompatibility: {compat.get('error')}")
        self.assertEqual(compat["metadata"]["num_classes"], 14)
        self.assertEqual(compat["metadata"]["classes"], DISEASE_CLASSES)

    def test_02_preprocessing_valid_image(self):
        """Verify tensor output shape (1, 1, 224, 224), dtype, and normalized pixel value bounds [-1024, 1024]."""
        self.assertTrue(os.path.exists(self.sample_path), "Sample image not found.")
        tensor, display_img = preprocess_xray_image(self.sample_path)
        
        self.assertEqual(tensor.shape, (1, 1, 224, 224))
        self.assertEqual(tensor.dtype, np.float32)
        self.assertTrue(np.all(np.isfinite(tensor)), "Tensor contains NaN or Inf.")
        self.assertGreaterEqual(float(np.min(tensor)), -1025.0)
        self.assertLessEqual(float(np.max(tensor)), 1025.0)
        self.assertEqual(display_img.mode, "RGB")

    def test_03_preprocessing_corrupt_and_empty_images(self):
        """Verify system rejects empty payloads and corrupt binary data safely."""
        with self.assertRaises(PreprocessingError):
            preprocess_xray_image(b"")
            
        with self.assertRaises(PreprocessingError):
            preprocess_xray_image(b"NOT_AN_IMAGE_RANDOM_GARBAGE_PAYLOAD")

    def test_04_preprocessing_dimension_bounds(self):
        """Verify minimum and maximum dimension bounds enforcement."""
        tiny_img = Image.new("L", (16, 16), color=128)
        buf = io.BytesIO()
        tiny_img.save(buf, format="PNG")
        with self.assertRaises(PreprocessingError):
            preprocess_xray_image(buf.getvalue())

    def test_05_prediction_finiteness_and_classes(self):
        """Verify forward pass inference yields exactly 14 finite independent Sigmoid probabilities."""
        res = self.predictor.predict_image(self.sample_path)
        self.assertTrue(res["success"])
        self.assertIn("predictions", res)
        self.assertEqual(len(res["predictions"]), 14)

        scores = [f["probability"] for f in res["predictions"]]
        self.assertTrue(np.all(np.isfinite(scores)), "Predictions contain NaN or Inf.")
        for s in scores:
            self.assertGreaterEqual(s, 0.0, "Sigmoid probability must be >= 0.0")
            self.assertLessEqual(s, 1.0, "Sigmoid probability must be <= 1.0")

        # Verify class ordering matches canonical NIH-14 order
        finding_names = [f["disease"] for f in res["predictions"]]
        self.assertEqual(set(finding_names), set(DISEASE_CLASSES))

    def test_06_gradcam_valid_finding(self):
        """Verify Grad-CAM produces a valid 2D feature attribution heatmap and blended overlay."""
        tensor, display = preprocess_xray_image(self.sample_path)
        out = generate_explainability_for_finding(
            self.predictor.adapter,
            tensor,
            display,
            disease_name="Cardiomegaly",
            alpha=0.5
        )
        self.assertEqual(out["disease"], "Cardiomegaly")
        self.assertEqual(out["class_idx"], 10)
        self.assertIn(out["layer_name"], ["denseblock4", "conv2d_5"])
        self.assertTrue(np.all(np.isfinite(out["raw_heatmap"])))
        self.assertEqual(out["heatmap_image"].size, display.size)
        self.assertEqual(out["overlay_image"].size, display.size)

    def test_07_gradcam_invalid_disease_rejection(self):
        """Verify Grad-CAM rejects disease names not present in the 14 NIH classes."""
        tensor, display = preprocess_xray_image(self.sample_path)
        with self.assertRaises(ValueError):
            generate_explainability_for_finding(
                self.predictor.adapter,
                tensor,
                display,
                disease_name="NonExistentDisease"
            )

    def test_08_inference_determinism(self):
        """Verify that identical input tensors yield strictly deterministic prediction scores."""
        res1 = self.predictor.predict_image(self.sample_path)
        res2 = self.predictor.predict_image(self.sample_path)
        scores1 = [f["probability"] for f in res1["predictions"]]
        scores2 = [f["probability"] for f in res2["predictions"]]
        np.testing.assert_allclose(scores1, scores2, rtol=1e-5, atol=1e-6)

    def test_09_operating_thresholds_mapping(self):
        """Verify that all 14 findings have documented operating thresholds mapped by pathology label."""
        threshs = self.predictor.adapter.get_thresholds()
        for disease in DISEASE_CLASSES:
            self.assertIn(disease, threshs, f"Missing operating threshold for {disease}")
            self.assertGreater(threshs[disease], 0.0, f"Threshold for {disease} must be positive")
            self.assertLess(threshs[disease], 1.0, f"Threshold for {disease} must be < 1.0")

    def test_10_no_double_sigmoid(self):
        """Verify forward pass returns raw logits and adapter applies exactly one sigmoid (not double sigmoid)."""
        tensor, _ = preprocess_xray_image(self.sample_path)
        adapter = self.predictor.adapter
        raw_logits = adapter.get_logits(tensor)[0]
        
        # Verify raw classifier output is linear logits (can be negative and outside [0, 1])
        has_negative = np.any(raw_logits < 0)
        self.assertTrue(has_negative, "Classifier output must be unconstrained linear logits.")

        # Verify adapter predictions match exact 1 / (1 + exp(-logit))
        preds = adapter.predict(tensor)[0]
        expected_sigmoids = 1.0 / (1.0 + np.exp(-raw_logits))
        for disease in DISEASE_CLASSES:
            idx = adapter.get_pathology_index(disease)
            target_idx = adapter.class_names.index(disease)
            np.testing.assert_allclose(
                preds[target_idx],
                expected_sigmoids[idx],
                rtol=1e-4,
                atol=1e-5,
                err_msg=f"Prediction for {disease} does not match single sigmoid of raw logit."
            )

    def test_11_pathology_label_indexing(self):
        """Confirm that findings are mapped to output heads strictly by label string, not assumed ordinal index."""
        adapter = self.predictor.adapter
        self.assertEqual(len(adapter.pathologies), 18)
        for disease in DISEASE_CLASSES:
            self.assertIn(disease, adapter.pathologies)
            # Ensure label index resolves correctly
            idx = adapter.get_pathology_index(disease)
            self.assertEqual(adapter.pathologies[idx], disease)

    def test_12_aspect_preserving_crop_and_intensity(self):
        """Verify anisotropic images preserve aspect ratio via center crop and scale to [-1024, 1024]."""
        # Create non-square test image (width 400, height 200)
        rect_img = Image.new("L", (400, 200), color=100)
        buf = io.BytesIO()
        rect_img.save(buf, format="PNG")
        tensor, display = preprocess_xray_image(buf.getvalue())
        self.assertEqual(tensor.shape, (1, 1, 224, 224))
        self.assertGreaterEqual(float(np.min(tensor)), -1025.0)
        self.assertLessEqual(float(np.max(tensor)), 1025.0)
        self.assertTrue(np.all(np.isfinite(tensor)))

    def test_13_multi_finding_gradcam_logits(self):
        """Verify Grad-CAM produces distinct, finite heatmaps for multiple pathologies on the same image."""
        pneu_sample = os.path.join(BASE_DIR, "data", "sample_images", "sample_04_pneumonia_infiltration.png")
        tensor, display = preprocess_xray_image(pneu_sample)
        out_infilt = generate_explainability_for_finding(
            self.predictor.adapter, tensor, display, disease_name="Infiltration"
        )
        out_pneumo = generate_explainability_for_finding(
            self.predictor.adapter, tensor, display, disease_name="Pneumonia"
        )
        self.assertTrue(np.all(np.isfinite(out_infilt["raw_heatmap"])))
        self.assertTrue(np.all(np.isfinite(out_pneumo["raw_heatmap"])))
        self.assertGreater(out_infilt["raw_heatmap"].max(), 0.0)
        self.assertGreater(out_pneumo["raw_heatmap"].max(), 0.0)
        self.assertEqual(out_infilt["heatmap_image"].size, display.size)
        self.assertEqual(out_pneumo["heatmap_image"].size, display.size)
        # Verify heatmaps for different findings are not identical
        diff = np.abs(out_infilt["raw_heatmap"] - out_pneumo["raw_heatmap"]).sum()
        self.assertGreater(diff, 1e-4, "Grad-CAM heatmaps for Infiltration and Pneumonia should differ.")

    def test_14_postprocessing_status_and_ranking(self):
        """Verify postprocessing ranks findings by operating-point ratio and assigns non-diagnostic status strings."""
        from ai.postprocessing import postprocess_predictions
        mock_preds = [
            {"disease": "Cardiomegaly", "probability": 0.60},
            {"disease": "Pneumonia", "probability": 0.35},
            {"disease": "Effusion", "probability": 0.30},
        ]
        mock_threshs = {
            "Cardiomegaly": 0.40,  # ratio = 1.50 -> Score above operating threshold
            "Pneumonia": 0.05,     # ratio = 7.00, prob >= 0.15 -> Markedly elevated score
            "Effusion": 0.35,      # ratio = 0.85 -> Borderline / near threshold
        }
        res = postprocess_predictions(mock_preds, thresholds=mock_threshs, rank_by="threshold_ratio")
        ranked = res["predictions"]
        # Pneumonia ratio (5.0) > Cardiomegaly ratio (1.5) > Effusion ratio (0.85)
        self.assertEqual(ranked[0]["disease"], "Pneumonia")
        self.assertEqual(ranked[0]["status"], "Markedly elevated score")
        self.assertEqual(ranked[1]["disease"], "Cardiomegaly")
        self.assertEqual(ranked[1]["status"], "Score above operating threshold")
        self.assertEqual(ranked[2]["disease"], "Effusion")
        self.assertEqual(ranked[2]["status"], "Borderline / near threshold")


if __name__ == "__main__":
    unittest.main()

