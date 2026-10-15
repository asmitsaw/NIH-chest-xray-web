"""
Image preprocessing and validation pipeline for Chest-X AI.
Ensures runtime input matches TorchXRayVision DenseNet-121 inference requirements:
- Native resolution: 224x224
- Single-channel grayscale [1, 1, 224, 224]
- Intensity range: [-1024, 1024] via xrv.datasets.normalize
- Aspect-preserving center cropping (preventing distortion of thoracic anatomy)
- Support for PNG, JPEG, BMP, TIFF, and DICOM (.dcm)
"""
import io
import os
import logging
from typing import Tuple, Union, Optional
import numpy as np
from PIL import Image
import cv2

try:
    import pydicom
    HAS_PYDICOM = True
except ImportError:
    HAS_PYDICOM = False

try:
    import torchxrayvision as xrv
    HAS_XRV = True
except ImportError:
    HAS_XRV = False

from .model_config import (
    DEFAULT_IMAGE_SIZE,
    DEFAULT_COLOR_MODE,
    TORCHXRAYVISION_INTENSITY_BOUNDS
)

logger = logging.getLogger("chest_x_ai.preprocessing")

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".dcm"}
MAX_FILE_SIZE_MB = 25
MIN_IMAGE_DIM = 32
MAX_IMAGE_DIM = 8192

class PreprocessingError(ValueError):
    """Custom exception for image preprocessing issues."""
    pass


def validate_image_file(file_or_path: Union[str, bytes, io.BytesIO], filename: Optional[str] = None) -> bool:
    """Validates file extension, non-empty content, and basic readability."""
    if filename:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise PreprocessingError(
                f"Unsupported file format '{ext}'. Allowed formats: {', '.join(ALLOWED_EXTENSIONS)}"
            )
    if isinstance(file_or_path, (bytes, bytearray)) and len(file_or_path) == 0:
        raise PreprocessingError("Uploaded image payload is empty (0 bytes).")
    return True


def is_dicom(file_or_path: Union[str, bytes, io.BytesIO], filename: Optional[str] = None) -> bool:
    """Checks whether the input stream is a DICOM file."""
    if filename and filename.lower().endswith(".dcm"):
        return True
    if isinstance(file_or_path, str) and file_or_path.lower().endswith(".dcm"):
        return True
    # Check DICM header bytes (128 preamble + "DICM")
    try:
        if isinstance(file_or_path, (bytes, bytearray)) and len(file_or_path) > 132:
            return file_or_path[128:132] == b"DICM"
        elif isinstance(file_or_path, io.BytesIO):
            pos = file_or_path.tell()
            file_or_path.seek(128)
            magic = file_or_path.read(4)
            file_or_path.seek(pos)
            return magic == b"DICM"
    except Exception:
        pass
    return False


def load_dicom_image(file_or_path: Union[str, bytes, io.BytesIO]) -> Tuple[np.ndarray, Image.Image]:
    """Loads and standardizes a DICOM radiograph."""
    if not HAS_PYDICOM:
        raise PreprocessingError("pydicom is required to process DICOM images.")
    try:
        if isinstance(file_or_path, str):
            ds = pydicom.dcmread(file_or_path)
        elif isinstance(file_or_path, (bytes, bytearray)):
            ds = pydicom.dcmread(io.BytesIO(file_or_path))
        else:
            file_or_path.seek(0)
            ds = pydicom.dcmread(file_or_path)
            
        arr = ds.pixel_array.astype(np.float32)
        
        # Handle Photometric Interpretation (MONOCHROME1 means 0 is bright, max is black)
        photometric = getattr(ds, "PhotometricInterpretation", "MONOCHROME2")
        if photometric == "MONOCHROME1":
            arr = np.max(arr) - arr
            
        # Determine bit depth max bound
        bits_stored = getattr(ds, "BitsStored", None)
        if bits_stored is not None and bits_stored > 0:
            maxval = float((1 << bits_stored) - 1)
        else:
            maxval = float(np.max(arr)) if np.max(arr) > 0 else 255.0
            
        # Create display RGB image (normalized 0..255 uint8)
        norm_disp = np.clip((arr - arr.min()) / (arr.max() - arr.min() + 1e-6) * 255.0, 0, 255).astype(np.uint8)
        display_rgb = Image.fromarray(norm_disp).convert("RGB")
        
        return arr, display_rgb, maxval
    except Exception as e:
        raise PreprocessingError(f"Failed to read DICOM image: {str(e)}")


def load_image(file_or_path: Union[str, bytes, io.BytesIO]) -> Tuple[np.ndarray, Image.Image, float]:
    """
    Safely loads an image file or stream into a 2D float32 numpy array and display RGB image.
    """
    if is_dicom(file_or_path):
        return load_dicom_image(file_or_path)
        
    try:
        if isinstance(file_or_path, (bytes, bytearray)):
            if len(file_or_path) == 0:
                raise PreprocessingError("Uploaded image payload is empty (0 bytes).")
            pil_img = Image.open(io.BytesIO(file_or_path))
        elif isinstance(file_or_path, io.BytesIO):
            file_or_path.seek(0, io.SEEK_END)
            size = file_or_path.tell()
            if size == 0:
                raise PreprocessingError("Uploaded image stream is empty (0 bytes).")
            file_or_path.seek(0)
            pil_img = Image.open(file_or_path)
        elif isinstance(file_or_path, str):
            if not os.path.exists(file_or_path):
                raise PreprocessingError(f"Image file not found: {file_or_path}")
            if os.path.getsize(file_or_path) == 0:
                raise PreprocessingError("Image file on disk is empty (0 bytes).")
            pil_img = Image.open(file_or_path)
        else:
            raise PreprocessingError("Unsupported image source type.")
        
        # Load pixels to detect corrupted files early
        pil_img.load()

        if pil_img.width < MIN_IMAGE_DIM or pil_img.height < MIN_IMAGE_DIM:
            raise PreprocessingError(
                f"Image dimensions ({pil_img.width}x{pil_img.height}) are too small. Minimum required: {MIN_IMAGE_DIM}x{MIN_IMAGE_DIM}."
            )
        if pil_img.width > MAX_IMAGE_DIM or pil_img.height > MAX_IMAGE_DIM:
            raise PreprocessingError(
                f"Image dimensions ({pil_img.width}x{pil_img.height}) exceed maximum allowed {MAX_IMAGE_DIM}x{MAX_IMAGE_DIM}."
            )

        # Standard display RGB
        display_rgb = pil_img.convert("RGB")
        
        # Grayscale 2D array for modeling
        gray_img = pil_img.convert("L")
        raw_arr = np.asarray(gray_img, dtype=np.float32)
        maxval = 255.0
        
        return raw_arr, display_rgb, maxval
    except PreprocessingError:
        raise
    except Exception as e:
        raise PreprocessingError(f"Failed to read image: {str(e)}")


def aspect_preserving_crop_and_resize(img_2d: np.ndarray, target_size: int = 224) -> np.ndarray:
    """
    Applies center crop on the longer dimension to produce a square without
    anisotropic stretching, then resizes to native model target_size (224x224).
    Matches TorchXRayVision XRayCenterCrop + XRayResizer behavior.
    """
    h, w = img_2d.shape
    crop_size = min(h, w)
    start_y = (h - crop_size) // 2
    start_x = (w - crop_size) // 2
    cropped = img_2d[start_y:start_y + crop_size, start_x:start_x + crop_size]
    
    # High-quality area/cubic interpolation for downsampling
    if crop_size != target_size:
        resized = cv2.resize(cropped, (target_size, target_size), interpolation=cv2.INTER_AREA)
    else:
        resized = cropped
        
    return resized.astype(np.float32)


def preprocess_xray_image(
    file_or_path: Union[str, bytes, io.BytesIO],
    target_size: Tuple[int, int] = DEFAULT_IMAGE_SIZE,
    color_mode: str = DEFAULT_COLOR_MODE,
    rescale: Optional[float] = None,
    apply_xrv_norm: bool = True
) -> Tuple[np.ndarray, Image.Image]:
    """
    Preprocesses a chest radiograph image for inference.
    
    Steps:
    1. Read and validate raw image (PNG, JPEG, DICOM).
    2. Convert to RGB copy for display and Grad-CAM overlays.
    3. Center-crop long dimension to preserve anatomical aspect ratio.
    4. Resize to target resolution (224x224).
    5. Normalize intensity to expected [-1024, 1024] range via xrv.datasets.normalize.
    6. Return tensor with shape [1, 1, 224, 224] and original display image.
    
    Returns:
        (tensor_4d, display_pil_image)
    """
    raw_arr, display_rgb, maxval = load_image(file_or_path)
    orig_h, orig_w = raw_arr.shape
    
    # 1. Aspect-preserving crop and resize to 224x224
    target_dim = target_size[0]
    processed_2d = aspect_preserving_crop_and_resize(raw_arr, target_size=target_dim)
    
    # 2. Intensity normalization
    if apply_xrv_norm:
        if HAS_XRV:
            # Official TorchXRayVision normalization
            norm_2d = xrv.datasets.normalize(processed_2d, maxval=maxval)
        else:
            # Direct mathematical equivalent: scales to [-1024, 1024]
            norm_2d = (2.0 * (processed_2d.astype(np.float32) / maxval) - 1.0) * 1024.0
    else:
        norm_2d = processed_2d / maxval
        
    # 3. Shape tensor to [1, 1, target_dim, target_dim]
    tensor = norm_2d[np.newaxis, np.newaxis, :, :].astype(np.float32)
    
    # 4. Validate output tensor integrity
    if not np.all(np.isfinite(tensor)):
        raise PreprocessingError("Preprocessed image tensor contains non-finite values (NaN or Inf).")
        
    expected_shape = (1, 1, target_dim, target_dim)
    if tensor.shape != expected_shape:
        raise PreprocessingError(f"Unexpected tensor shape {tensor.shape}; expected {expected_shape}.")
        
    # Development logging (without PII)
    if os.environ.get("FLASK_ENV") == "development" or os.environ.get("DEBUG") == "1":
        logger.info(
            f"[Preprocessing] Input image size: ({orig_w}x{orig_h}) -> "
            f"Tensor: {tensor.shape}, Range: [{tensor.min():.1f}, {tensor.max():.1f}]"
        )
        
    return tensor, display_rgb
