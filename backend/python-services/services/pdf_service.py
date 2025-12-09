"""
PDF Service
Handles PDF text extraction and metadata extraction
"""

from typing import Dict, Optional, BinaryIO
import PyPDF2
import io
from fastapi import UploadFile
import logging

logger = logging.getLogger(__name__)


class PDFService:
    """Service for PDF text extraction and metadata"""

    async def extract_text(self, file: UploadFile) -> Dict:
        """
        Extract text and metadata from PDF file

        Args:
            file: PDF file (UploadFile from FastAPI)

        Returns:
            {
                "text": str,
                "metadata": {
                    "pages": int,
                    "author": str,
                    "title": str,
                    "subject": str,
                    "creator": str,
                    "producer": str,
                    "created_at": str
                },
                "success": bool,
                "error": str (optional)
            }
        """
        try:
            # Read file content
            content = await file.read()
            pdf_file = io.BytesIO(content)

            # Create PDF reader
            reader = PyPDF2.PdfReader(pdf_file)

            # Extract text from all pages
            text_parts = []
            for page_num, page in enumerate(reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                except Exception as e:
                    logger.warning(f"Failed to extract text from page {page_num + 1}: {e}")
                    continue

            text = "\n\n".join(text_parts)

            # Extract metadata
            metadata_dict = {
                "pages": len(reader.pages),
                "author": "Unknown",
                "title": file.filename,
                "subject": "",
                "creator": "",
                "producer": "",
                "created_at": None
            }

            if reader.metadata:
                try:
                    metadata_dict["author"] = str(reader.metadata.get('/Author', 'Unknown') or 'Unknown')
                    metadata_dict["title"] = str(reader.metadata.get('/Title', file.filename) or file.filename)
                    metadata_dict["subject"] = str(reader.metadata.get('/Subject', '') or '')
                    metadata_dict["creator"] = str(reader.metadata.get('/Creator', '') or '')
                    metadata_dict["producer"] = str(reader.metadata.get('/Producer', '') or '')

                    # Handle creation date
                    creation_date = reader.metadata.get('/CreationDate')
                    if creation_date:
                        metadata_dict["created_at"] = str(creation_date)
                except Exception as e:
                    logger.warning(f"Failed to extract some metadata fields: {e}")

            return {
                "text": text.strip(),
                "metadata": metadata_dict,
                "success": True,
                "char_count": len(text),
                "page_count": len(reader.pages)
            }

        except PyPDF2.errors.PdfReadError as e:
            logger.error(f"PDF read error: {e}")
            return {
                "text": "",
                "metadata": {},
                "success": False,
                "error": f"Invalid or corrupted PDF file: {str(e)}"
            }
        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            return {
                "text": "",
                "metadata": {},
                "success": False,
                "error": f"Failed to extract PDF: {str(e)}"
            }

    def extract_text_from_bytes(self, pdf_bytes: bytes, filename: str = "document.pdf") -> Dict:
        """
        Extract text from PDF bytes (synchronous version)

        Args:
            pdf_bytes: PDF file as bytes
            filename: Original filename

        Returns:
            Same as extract_text()
        """
        try:
            pdf_file = io.BytesIO(pdf_bytes)
            reader = PyPDF2.PdfReader(pdf_file)

            # Extract text
            text_parts = []
            for page in reader.pages:
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                except Exception:
                    continue

            text = "\n\n".join(text_parts)

            # Extract metadata
            metadata_dict = {
                "pages": len(reader.pages),
                "author": "Unknown",
                "title": filename
            }

            if reader.metadata:
                try:
                    metadata_dict["author"] = str(reader.metadata.get('/Author', 'Unknown') or 'Unknown')
                    metadata_dict["title"] = str(reader.metadata.get('/Title', filename) or filename)
                except Exception:
                    pass

            return {
                "text": text.strip(),
                "metadata": metadata_dict,
                "success": True
            }

        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            return {
                "text": "",
                "metadata": {},
                "success": False,
                "error": str(e)
            }


# Singleton instance
pdf_service = PDFService()
