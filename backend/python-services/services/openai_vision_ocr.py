"""
OpenAI GPT-4 Vision OCR Service
For extracting text from scanned PDFs using GPT-4 Vision
"""

import os
import base64
import logging
import openai
from typing import Dict, List
import fitz  # PyMuPDF for PDF to image conversion

logger = logging.getLogger(__name__)

# OpenAI API configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    logger.warning("OPENAI_API_KEY not set in environment")


class OpenAIVisionOCR:
    """OpenAI GPT-4 Vision OCR for scanned documents"""

    def __init__(self):
        self.client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

    async def ocr_image(self, image_bytes: bytes) -> Dict:
        """
        OCR a single image using GPT-4 Vision API

        Args:
            image_bytes: Image as bytes (PNG/JPEG)

        Returns:
            {"success": bool, "text": str, "error": str}
        """
        try:
            # Encode image to base64
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')

            # Call GPT-4 Vision
            response = await self.client.chat.completions.create(
                model="gpt-4o",  # GPT-4o has vision capabilities
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{image_b64}",
                                    "detail": "high"
                                }
                            },
                            {
                                "type": "text",
                                "text": "Bu görüntüdeki tüm metni aynen oku ve yaz. Sadece metni ver, başka bir şey ekleme. Türkçe karakterlere dikkat et. Tablo varsa düzgün formatla."
                            }
                        ]
                    }
                ],
                max_tokens=4096
            )

            # Extract text from response
            if response.choices and len(response.choices) > 0:
                text = response.choices[0].message.content or ""
                return {"success": True, "text": text.strip(), "error": None}

            return {"success": True, "text": "", "error": None}

        except openai.RateLimitError as e:
            logger.warning(f"OpenAI rate limit: {e}")
            return {"success": False, "text": "", "error": "Rate limit exceeded"}
        except Exception as e:
            logger.error(f"OpenAI Vision OCR error: {e}")
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
                mat = fitz.Matrix(dpi / 72, dpi / 72)
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png")
                images.append(img_bytes)

            doc.close()

        except Exception as e:
            logger.error(f"PDF to image conversion failed: {e}")

        return images

    async def ocr_pdf(self, pdf_path: str, max_pages: int = 30) -> Dict:
        """
        OCR entire PDF file using GPT-4 Vision

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
                logger.info(f"GPT-4 Vision OCR page {i + 1}/{len(images)}")
                result = await self.ocr_image(img_bytes)

                if result["success"] and result["text"]:
                    all_text.append(f"--- Page {i + 1} ---\n{result['text']}")
                elif not result["success"]:
                    logger.warning(f"Page {i + 1} OCR failed: {result.get('error')}")

            full_text = "\n\n".join(all_text)

            return {
                "success": len(full_text) > 100,
                "text": full_text,
                "pages": len(images),
                "chars": len(full_text),
                "error": None if len(full_text) > 100 else "OCR produced minimal text"
            }

        except Exception as e:
            logger.error(f"PDF OCR failed: {e}")
            return {"success": False, "text": "", "pages": 0, "chars": 0, "error": str(e)}


# Singleton instance
openai_vision_ocr = OpenAIVisionOCR()
