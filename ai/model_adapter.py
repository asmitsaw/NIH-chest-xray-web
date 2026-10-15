"""
ModelAdapter interface and Keras implementation for Chest-X AI.
Decouples UI and application layers from specific machine learning models.
"""
from abc import ABC, abstractmethod
import os
import time
from typing import Dict, Any, Optional, Tuple
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential, Model
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Dropout, Flatten, Dense, Input

from .model_config import (
    DISEASE_CLASSES,
    DEFAULT_IMAGE_SIZE,
    DEFAULT_COLOR_MODE,
    GRADCAM_TARGET_LAYER,
    MODEL_LIMITATIONS_NOTE
)

class AbstractModelAdapter(ABC):
    """Abstract interface for Chest X-Ray AI model adapters."""
    
    @abstractmethod
    def load(self, model_path: str) -> None:
        """Load model weights or architecture."""
        pass
        
    @abstractmethod
    def predict(self, input_tensor: np.ndarray) -> np.ndarray:
        """Execute forward pass inference."""
        pass
        
    @abstractmethod
    def get_feature_layer(self, layer_name: Optional[str] = None) -> Any:
        """Return the target convolutional feature layer for explainability."""
        pass
        
    @abstractmethod
    def explain(self, input_tensor: np.ndarray, class_idx: int) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Generate Grad-CAM activation map for a specific finding class index."""
        pass
        
    @abstractmethod
    def get_metadata(self) -> Dict[str, Any]:
        """Return model metadata, architecture description, and performance notes."""
        pass


class TorchXRayVisionDenseNetAdapter(AbstractModelAdapter):
    """
    Adapter for TorchXRayVision DenseNet-121 pretrained foundation model (densenet121-res224-all).
    Multi-label independent Sigmoid output with documented operating thresholds and
    logit-based Grad-CAM explainability on denseblock4.
    """
    
    def __init__(self, weights: str = "densenet121-res224-all", target_layer: str = "denseblock4"):
        self.weights = weights if weights != "all" else "densenet121-res224-all"
        self.target_layer_name = target_layer
        self.model = None
        self.is_loaded = False
        self.loaded_at = None
        self.pathologies = []
        self.class_indices = []
        self.op_thresholds = {}
        self.unsupported_classes = set()
        self.load(self.weights)

    def load(self, model_path: Optional[str] = None) -> None:
        """Loads pretrained DenseNet weights via TorchXRayVision."""
        weights_name = model_path or self.weights
        if not weights_name or weights_name.endswith(".hdf5") or weights_name == "all":
            weights_name = "densenet121-res224-all"
        try:
            import torch
            import torchxrayvision as xrv
            self.model = xrv.models.DenseNet(weights=weights_name)
            self.model.eval()
            self.pathologies = list(self.model.pathologies)
            
            # Map operating thresholds from the model's actual op_threshs tensor
            self.op_thresholds = {}
            self.unsupported_classes = set()
            if hasattr(self.model, "op_threshs") and self.model.op_threshs is not None:
                op_arr = self.model.op_threshs.detach().cpu().numpy()
                for i, p in enumerate(self.pathologies):
                    if not p or p.strip() == "" or np.isnan(op_arr[i]):
                        self.unsupported_classes.add(p)
                    else:
                        self.op_thresholds[p] = float(op_arr[i])
            else:
                self.op_thresholds = {}

            # Build class index lookup for canonical NIH-14 findings
            self.class_indices = []
            for c in DISEASE_CLASSES:
                if c in self.pathologies:
                    self.class_indices.append(self.pathologies.index(c))
                else:
                    self.unsupported_classes.add(c)
                    self.class_indices.append(-1)
                    
            self.is_loaded = True
            self.loaded_at = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        except Exception as e:
            self.is_loaded = False
            raise RuntimeError(f"Failed to load TorchXRayVision DenseNet-121: {e}")

    def get_thresholds(self) -> Dict[str, float]:
        """Returns the official operating thresholds mapped from the model."""
        return dict(self.op_thresholds)

    def _prepare_tensor(self, input_tensor: np.ndarray):
        import torch
        if isinstance(input_tensor, torch.Tensor):
            t = input_tensor
        else:
            arr = np.array(input_tensor, dtype=np.float32)
            if arr.ndim == 4 and arr.shape[-1] == 1:
                # (1, H, W, 1) -> (1, 1, H, W)
                arr = np.transpose(arr, (0, 3, 1, 2))
            elif arr.ndim == 3 and arr.shape[0] == 1:
                arr = np.expand_dims(arr, 0)
            elif arr.ndim == 2:
                arr = arr[None, None, :, :]
            t = torch.from_numpy(arr)
        
        # Ensure 224x224
        if t.shape[-2:] != (224, 224):
            t = torch.nn.functional.interpolate(t, size=(224, 224), mode='bilinear', align_corners=False)
            
        # If tensor is in [0, 1] range (legacy input), normalize to [-1024, 1024]
        if t.max() <= 1.0 and t.min() >= 0.0:
            t = (2.0 * t - 1.0) * 1024.0
            
        return t

    def predict(self, input_tensor: np.ndarray) -> np.ndarray:
        """
        Executes forward inference.
        Returns pure Sigmoid probabilities for the requested 14 disease classes.
        Sigmoid is applied exactly once to raw classifier logits.
        """
        if not self.is_loaded or self.model is None:
            raise RuntimeError("Model is not loaded. Call load() first.")
        import torch
        t = self._prepare_tensor(input_tensor)
        with torch.no_grad():
            features = self.model.features2(t)
            logits = self.model.classifier(features)
            # Apply Sigmoid exactly once
            sigmoids = torch.sigmoid(logits).cpu().numpy()
            
        # Extract predictions for the 14 NIH classes using exact label index mapping
        batch_size = sigmoids.shape[0]
        nih_preds = np.zeros((batch_size, len(DISEASE_CLASSES)), dtype=np.float32)
        for i, idx in enumerate(self.class_indices):
            if idx >= 0:
                nih_preds[:, i] = sigmoids[:, idx]
            else:
                nih_preds[:, i] = np.nan
                
        if not np.all(np.isfinite(nih_preds)):
            raise RuntimeError("Model prediction output contains non-finite values (NaN or Inf).")
            
        return nih_preds

    def get_feature_layer(self, layer_name: Optional[str] = None) -> Any:
        name = layer_name or self.target_layer_name
        if hasattr(self.model.features, name):
            return getattr(self.model.features, name)
        return self.model.features.denseblock4

    def explain(self, input_tensor: np.ndarray, class_idx: int, layer_name: Optional[str] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Generates Grad-CAM activation map for a specific finding class index.
        Computes gradients on target linear logit to avoid vanishing gradient damping.
        """
        if not self.is_loaded or self.model is None:
            raise RuntimeError("Model is not loaded. Call load() first.")
        
        target_layer_name = layer_name or self.target_layer_name
        target_layer = self.get_feature_layer(target_layer_name)
        
        t = self._prepare_tensor(input_tensor).clone().detach()
        t.requires_grad = True
        
        activations = []
        gradients = []
        
        def f_hook(module, inp, out):
            activations.append(out)
        def b_hook(module, g_in, g_out):
            gradients.append(g_out[0])
            
        h_f = target_layer.register_forward_hook(f_hook)
        h_b = target_layer.register_full_backward_hook(b_hook)
        
        try:
            features = self.model.features2(t)
            logits = self.model.classifier(features)
            
            full_idx = self.class_indices[class_idx]
            if full_idx < 0:
                raise ValueError(f"Pathology index {class_idx} is not supported by this checkpoint.")
                
            # Backpropagate on raw linear logit for target pathology
            target_logit = logits[0, full_idx]
            self.model.zero_grad()
            target_logit.backward()
            
            act = activations[0].detach().cpu().numpy()[0]
            grad = gradients[0].detach().cpu().numpy()[0]
            
            # Global Average Pooling of positive gradients
            weights = np.mean(grad, axis=(1, 2))
            cam = np.zeros(act.shape[1:], dtype=np.float32)
            for i, w in enumerate(weights):
                cam += w * act[i]
                
            cam = np.maximum(cam, 0.0)
            if cam.max() > 0:
                cam = cam / (cam.max() + 1e-8)
                
            heatmap_np = np.nan_to_num(cam, nan=0.0, posinf=1.0, neginf=0.0)
            status = "success"
        except Exception as e:
            heatmap_np = np.zeros((7, 7), dtype=np.float32)
            status = f"error: {str(e)}"
        finally:
            h_f.remove()
            h_b.remove()
            
        meta = {
            "status": status,
            "layer": target_layer_name,
            "class_idx": class_idx,
            "disease": DISEASE_CLASSES[class_idx] if 0 <= class_idx < len(DISEASE_CLASSES) else "Unknown",
            "shape": heatmap_np.shape
        }
        return heatmap_np, meta

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "model_name": "TorchXRayVision DenseNet-121",
            "version": "2.0.0-torchxrayvision-densenet121",
            "weights_path": f"torchxrayvision://{self.weights}",
            "input_shape": [1, 1, 224, 224],
            "num_classes": len(DISEASE_CLASSES),
            "classes": DISEASE_CLASSES,
            "thresholds": self.op_thresholds,
            "activation": "sigmoid",
            "target_gradcam_layer": self.target_layer_name,
            "is_loaded": self.is_loaded,
            "loaded_at": self.loaded_at,
            "architecture": "DenseNet-121 (DenseBlock 1-4 + GlobalAvgPool + Sigmoid 18)",
            "limitations_note": MODEL_LIMITATIONS_NOTE
        }


class KerasSequentialAdapter(AbstractModelAdapter):
    """
    Adapter for the NIH Chest X-Ray 5-Stage Convolutional Neural Network.
    Supports HDF5 weight loading, inference, and Grad-CAM computation.
    """
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path
        self.model: Optional[Model] = None
        self.grad_model: Optional[Model] = None
        self.target_layer_name: str = "conv2d_5"
        self.loaded_at: Optional[str] = None
        self.output_activation: str = "softmax"
        self.is_loaded: bool = False
        
        if model_path and os.path.exists(model_path):
            self.load(model_path)
            
    def _build_architecture(self, input_shape: tuple = (128, 128, 1), num_classes: int = 14) -> Model:
        """
        Builds the exact Functional/Sequential architecture matching the NIH notebook checkpoint.
        Uses Functional API for reliable GradientTape / Grad-CAM tensor routing.
        """
        inp = Input(shape=input_shape, name="input_1")
        
        x = Conv2D(filters=8, kernel_size=3, padding="same", activation="relu", name="conv2d_1")(inp)
        x = MaxPooling2D(pool_size=2, name="maxpool2d_1")(x)
        x = Dropout(0.2, name="drop_1")(x)
        
        x = Conv2D(filters=16, kernel_size=3, padding="same", activation="relu", name="conv2d_2")(x)
        x = MaxPooling2D(pool_size=2, name="maxpool2d_2")(x)
        x = Dropout(0.2, name="drop_2")(x)
        
        x = Conv2D(filters=32, kernel_size=3, padding="same", activation="relu", name="conv2d_3")(x)
        x = MaxPooling2D(pool_size=2, name="maxpool2d_3")(x)
        x = Dropout(0.2, name="drop_3")(x)
        
        x = Conv2D(filters=64, kernel_size=3, padding="same", activation="relu", name="conv2d_4")(x)
        x = MaxPooling2D(pool_size=2, name="maxpool2d_4")(x)
        x = Dropout(0.2, name="drop_4")(x)
        
        x = Conv2D(filters=128, kernel_size=3, padding="same", activation="relu", name="conv2d_5")(x)
        x = MaxPooling2D(pool_size=3, name="maxpool2d_5")(x)
        x = Dropout(0.2, name="drop_5")(x)
        
        x = Flatten(name="flatten_1")(x)
        x = Dense(500, activation="relu", name="dense_1")(x)
        x = Dropout(0.2, name="drop_6")(x)
        
        # Dense output layer
        out = Dense(num_classes, activation=self.output_activation, name="predictions")(x)
        
        model = Model(inputs=inp, outputs=out, name="NIH_ChestXRay_CNN")
        return model

    def load(self, model_path: str) -> None:
        """Loads weights into the defined architecture."""
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found at path: {model_path}")
            
        self.model_path = model_path
        self.model = self._build_architecture(input_shape=(128, 128, 1), num_classes=len(DISEASE_CLASSES))
        self.model.load_weights(model_path)
        
        # Build gradient model for Grad-CAM
        try:
            target_conv = self.model.get_layer(self.target_layer_name)
            self.grad_model = Model(
                inputs=self.model.inputs,
                outputs=[target_conv.output, self.model.output]
            )
        except Exception as e:
            self.grad_model = None
            print(f"[ModelAdapter Warning] Could not construct Grad-CAM sub-model: {e}")
            
        self.is_loaded = True
        self.loaded_at = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())

    def predict(self, input_tensor: np.ndarray) -> np.ndarray:
        """Execute forward pass."""
        if not self.is_loaded or self.model is None:
            raise RuntimeError("Model is not loaded. Call load() first.")
        preds = self.model.predict(input_tensor, verbose=0)
        return preds

    def get_feature_layer(self, layer_name: Optional[str] = None) -> Any:
        """Retrieve convolutional layer by name."""
        name = layer_name or self.target_layer_name
        if self.model is None:
            return None
        return self.model.get_layer(name)

    def explain(self, input_tensor: np.ndarray, class_idx: int, layer_name: Optional[str] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Computes Grad-CAM heatmap for the given class index and optional target conv layer.
        Returns:
            (heatmap_2d_array, metadata_dict)
        """
        if not self.is_loaded or self.model is None:
            raise RuntimeError("Model is not loaded. Call load() first.")
            
        target_layer = layer_name or self.target_layer_name
        
        # Build dynamic gradient sub-model if needed
        try:
            target_conv = self.model.get_layer(target_layer)
            grad_model = Model(
                inputs=self.model.inputs,
                outputs=[target_conv.output, self.model.output]
            )
        except Exception as e:
            # Fallback to default
            grad_model = self.grad_model
            target_layer = self.target_layer_name
            
        if grad_model is None:
            heatmap = np.zeros((8, 8), dtype=np.float32)
            return heatmap, {"status": "error", "layer": target_layer}
            
        # Ensure tensor format
        tf_tensor = tf.convert_to_tensor(input_tensor, dtype=tf.float32)
        
        with tf.GradientTape() as tape:
            conv_outputs, predictions = grad_model(tf_tensor)
            loss = predictions[:, class_idx]
            
        grads = tape.gradient(loss, conv_outputs)
        
        if grads is None:
            # Fallback if gradient is disconnected
            heatmap = np.zeros((8, 8), dtype=np.float32)
            return heatmap, {"status": "gradient_zero", "layer": target_layer}
            
        # Global Average Pooling on gradients
        pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
        conv_outputs_single = conv_outputs[0]
        
        # Weighted combination of feature maps
        heatmap = conv_outputs_single @ pooled_grads[..., tf.newaxis]
        heatmap = tf.squeeze(heatmap)
        
        # Apply ReLU and scale [0, 1]
        heatmap = tf.maximum(heatmap, 0.0)
        max_val = tf.math.reduce_max(heatmap)
        if max_val > 0:
            heatmap = heatmap / max_val
        heatmap_np = heatmap.numpy()
        
        meta = {
            "status": "success",
            "layer": target_layer,
            "class_idx": class_idx,
            "disease": DISEASE_CLASSES[class_idx] if 0 <= class_idx < len(DISEASE_CLASSES) else "Unknown",
            "shape": heatmap_np.shape
        }
        return heatmap_np, meta

    def get_metadata(self) -> Dict[str, Any]:
        """Returns comprehensive model metadata."""
        return {
            "model_name": "Chest-X AI Baseline CNN",
            "version": "1.0.0-hdf5-checkpoint",
            "weights_path": self.model_path,
            "input_shape": [128, 128, 1],
            "num_classes": len(DISEASE_CLASSES),
            "classes": DISEASE_CLASSES,
            "activation": self.output_activation,
            "target_gradcam_layer": self.target_layer_name,
            "is_loaded": self.is_loaded,
            "loaded_at": self.loaded_at,
            "architecture": "5-Stage Conv2D + MaxPool2D + Dropout + Dense(500) + Dense(14)",
            "limitations_note": MODEL_LIMITATIONS_NOTE
        }
