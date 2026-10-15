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


if __name__ == "__main__":
    unittest.main()

