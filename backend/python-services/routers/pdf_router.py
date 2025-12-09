"""
PDF Router
FastAPI router for PDF text extraction
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from services.pdf_service import pdf_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pdf", tags=["PDF"])


@router.post("/extract-text")
async def extract_text_from_pdf(file: UploadFile = File(...)):
    """
    Extract text and metadata from PDF file

    Args:
        file: PDF file (multipart/form-data)

    Returns:
        {
            "text": str,
            "metadata": {
                "pages": int,
                "author": str,
                "title": str,
                ...
            },
            "success": bool,
            "char_count": int,
            "page_count": int
        }

    Raises:
        400: Invalid file type (not PDF)
        500: Extraction failed
    """
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="File must be a PDF (.pdf extension required)"
        )

    # Validate content type (if provided)
    if file.content_type and not file.content_type.startswith('application/pdf'):
        logger.warning(f"Content-Type is {file.content_type}, expected application/pdf")

    # Extract text
    result = await pdf_service.extract_text(file)

    # Check for errors
    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Failed to extract text from PDF")
        )

    return result


@router.get("/health")
async def health_check():
    """Health check endpoint for PDF service"""
    return {
        "status": "healthy",
        "service": "pdf",
        "features": ["text_extraction", "metadata_extraction"]
    }
