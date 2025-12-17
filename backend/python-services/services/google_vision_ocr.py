"""
Google Cloud Vision OCR Service
For extracting text from scanned PDFs
"""

import os
import base64
import logging
import httpx
from typing import Dict, List, Optional
from pathlib import Path
import fitz  # PyMuPDF for PDF to image conversion

logger = logging.getLogger(__name__)

# Google Vision API keys (rotate if rate limited)
GOOGLE_API_KEYS = [
    os.getenv("GOOGLE_VISION_API_KEY", "AIzaSyBPnbg7Ciwn2NZUXNF24dAinMHguLvJov4"),
    os.getenv("GOOGLE_VISION_API_KEY_2", "AIzaSyBe1NPb4HsVQuVwvvx83_wuKTy4UbfQvr8"),
]

VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate"


class GoogleVisionOCR:
    """Google Cloud Vision OCR for scanned documents"""

    def __init__(self):
        self.current_key_index = 0
        self.client = httpx.AsyncClient(timeout=60.0)

    def get_api_key(self) -> str:
        """Get current API key, rotate if needed"""
        return GOOGLE_API_KEYS[self.current_key_index % len(GOOGLE_API_KEYS)]

    def rotate_key(self):
        """Rotate to next API key"""
        self.current_key_index += 1
        logger.info(f"Rotated to API key index {self.current_key_index % len(GOOGLE_API_KEYS)}")

    async def ocr_image(self, image_bytes: bytes) -> Dict:
        """
        OCR a single image using Google Vision API

        Args:
            image_bytes: Image as bytes (PNG/JPEG)

        Returns:
            {"success": bool, "text": str, "error": str}
        """
        try:
            # Encode image to base64
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')

            # Prepare request
            request_body = {
                "requests": [{
                    "image": {"content": image_b64},
                    "features": [{"type": "TEXT_DETECTION"}]
                }]
            }

            # Make API call
            api_key = self.get_api_key()
            url = f"{VISION_API_URL}?key={api_key}"

            response = await self.client.post(url, json=request_body)

            if response.status_code == 429:
                # Rate limited, rotate key and retry
                self.rotate_key()
                api_key = self.get_api_key()
                url = f"{VISION_API_URL}?key={api_key}"
                response = await self.client.post(url, json=request_body)

            if response.status_code != 200:
                return {
                    "success": False,
                    "text": "",
                    "error": f"API error: {response.status_code} - {response.text[:200]}"
                }

            data = response.json()

            # Extract text from response
            if "responses" in data and len(data["responses"]) > 0:
                annotations = data["responses"][0].get("textAnnotations", [])
                if annotations:
                    # First annotation contains full text
                    full_text = annotations[0].get("description", "")
                    return {"success": True, "text": full_text, "error": None}

            return {"success": True, "text": "", "error": None}

        except Exception as e:
            logger.error(f"Vision OCR error: {e}")
            return {"success": False, "text": "", "error": str(e)}

    def pdf_to_images(self, pdf_path: str, dpi: int = 150) -> List[bytes]:
        """
        Convert PDF pages to images using PyMuPDF

        Args:
            pdf_path: Path to PDF file
            dpi: Resolution for rendering (higher = better OCR but slower)

        Returns:
            List of image bytes (PNG format)
        """
        images = []
        try:
            doc = fitz.open(pdf_path)

            for page_num in range(len(doc)):
                page = doc[page_num]
                # Render page to pixmap
                mat = fitz.Matrix(dpi / 72, dpi / 72)
                pix = page.get_pixmap(matrix=mat)
                # Convert to PNG bytes
                img_bytes = pix.tobytes("png")
                images.append(img_bytes)

            doc.close()

        except Exception as e:
            logger.error(f"PDF to image conversion failed: {e}")

        return images

    async def ocr_pdf(self, pdf_path: str, max_pages: int = 50) -> Dict:
        """
        OCR entire PDF file

        Args:
            pdf_path: Path to PDF file
            max_pages: Maximum pages to process

        Returns:
            {"success": bool, "text": str, "pages": int, "error": str}
        """
        try:
            if not os.path.exists(pdf_path):
                return {"success": False, "text": "", "pages": 0, "error": "File not found"}

            # Convert PDF to images
            logger.info(f"Converting PDF to images: {pdf_path}")
            images = self.pdf_to_images(pdf_path)

            if not images:
                return {"success": False, "text": "", "pages": 0, "error": "Failed to convert PDF to images"}

            # Limit pages
            images = images[:max_pages]

            # OCR each page
            all_text = []
            for i, img_bytes in enumerate(images):
                logger.debug(f"OCR page {i + 1}/{len(images)}")
                result = await self.ocr_image(img_bytes)

                if result["success"] and result["text"]:
                    all_text.append(f"--- Page {i + 1} ---\n{result['text']}")
                elif not result["success"]:
                    logger.warning(f"Page {i + 1} OCR failed: {result.get('error')}")

            full_text = "\n\n".join(all_text)

            return {
                "success": True,
                "text": full_text,
                "pages": len(images),
                "chars": len(full_text),
                "error": None
            }

        except Exception as e:
            logger.error(f"PDF OCR failed: {e}")
            return {"success": False, "text": "", "pages": 0, "error": str(e)}

    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()


# Singleton instance
google_vision_ocr = GoogleVisionOCR()
