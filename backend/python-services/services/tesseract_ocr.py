"""
Tesseract OCR Service
Local OCR using Tesseract - no API key required
"""

import os
import logging
from typing import Dict, List
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io

logger = logging.getLogger(__name__)

# Tesseract language configuration
# tur = Turkish, eng = English
TESSERACT_LANG = os.getenv("TESSERACT_LANG", "tur+eng")


class TesseractOCR:
    """Tesseract OCR for scanned documents"""

    def __init__(self):
        self.lang = TESSERACT_LANG
        logger.info(f"Tesseract OCR initialized with languages: {self.lang}")

    def ocr_image(self, image_bytes: bytes) -> Dict:
        """
        OCR a single image using Tesseract

        Args:
            image_bytes: Image as bytes (PNG/JPEG)

        Returns:
            {"success": bool, "text": str, "error": str}
        """
        try:
            # Convert bytes to PIL Image
            image = Image.open(io.BytesIO(image_bytes))

            # Run OCR
            text = pytesseract.image_to_string(image, lang=self.lang)

            return {
                "success": True,
                "text": text.strip(),
                "error": None
            }

        except Exception as e:
            logger.error(f"Tesseract OCR error: {e}")
            return {"success": False, "text": "", "error": str(e)}

    def pdf_to_images(self, pdf_path: str, dpi: int = 150) -> List[bytes]:
        """
        Convert PDF pages to images using PyMuPDF

        Args:
            pdf_path: Path to PDF file
            dpi: Resolution for rendering

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

    def ocr_pdf(self, pdf_path: str, max_pages: int = 50) -> Dict:
        """
        OCR entire PDF file using Tesseract

        Args:
            pdf_path: Path to PDF file
            max_pages: Maximum pages to process

        Returns:
            {"success": bool, "text": str, "pages": int, "chars": int, "error": str}
        """
        try:
            if not os.path.exists(pdf_path):
                return {"success": False, "text": "", "pages": 0, "chars": 0, "error": "File not found"}

            # Convert PDF to images
            logger.info(f"Converting PDF to images: {pdf_path}")
            images = self.pdf_to_images(pdf_path)

            if not images:
                return {"success": False, "text": "", "pages": 0, "chars": 0, "error": "Failed to convert PDF to images"}

            # Limit pages
            images = images[:max_pages]

            # OCR each page
            all_text = []
            for i, img_bytes in enumerate(images):
                logger.debug(f"OCR page {i + 1}/{len(images)}")
                result = self.ocr_image(img_bytes)

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
                "method": "tesseract",
                "error": None
            }

        except Exception as e:
            logger.error(f"PDF OCR failed: {e}")
            return {"success": False, "text": "", "pages": 0, "chars": 0, "error": str(e)}


# Singleton instance
tesseract_ocr = TesseractOCR()
