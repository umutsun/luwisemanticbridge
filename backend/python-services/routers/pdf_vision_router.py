"""
PDF Vision Analyzer Router
FastAPI endpoints for intelligent PDF visual analysis

Endpoints:
- POST /analyze - Analyze PDF with vision model
- POST /analyze/chat - Analyze PDF for chat context
- GET /types - Get supported document types
- GET /health - Health check
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel, Field
from loguru import logger
import tempfile
import os
from dataclasses import asdict

from services.pdf_vision_analyzer import pdf_vision_analyzer, DocumentType, DOCUMENT_SCHEMAS


router = APIRouter(prefix="/pdf-vision", tags=["PDF Vision Analyzer"])


class AnalyzeRequest(BaseModel):
    """Request model for URL-based analysis"""
    pdf_url: str = Field(..., description="URL of PDF to analyze")
    document_type: Optional[str] = Field(None, description="Document type (tapu, fatura, harita, etc.)")
    custom_prompt: Optional[str] = Field(None, description="Custom analysis prompt")
    provider: str = Field("openai", description="Vision provider (openai, gemini)")


class AnalysisResponse(BaseModel):
    """Response model for PDF analysis"""
    success: bool
    document_type: str
    confidence: float
    summary: str
    extracted_data: dict
    visual_elements: List[dict]
    raw_text: str
    page_count: int
    metadata: dict
    error: Optional[str] = None


class ChatAnalysisResponse(BaseModel):
    """Simplified response for chat integration"""
    success: bool
    document_type: str
    summary: str
    key_info: dict
    context_for_llm: str
    error: Optional[str] = None


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_pdf(
    file: UploadFile = File(..., description="PDF file to analyze"),
    document_type: Optional[str] = Form(None, description="Document type (auto-detect if not specified)"),
    custom_prompt: Optional[str] = Form(None, description="Custom analysis prompt"),
    provider: str = Form("openai", description="Vision provider")
):
    """
    Analyze PDF using vision model

    Supports document types:
    - tapu: Land registry documents
    - fatura: Invoices
    - harita: Maps and cadastral plans
    - sozlesme: Contracts
    - kimlik: ID documents
    - resmi_yazi: Official letters
    - banka: Bank statements
    - genel: General documents (auto-detect)

    Returns structured extraction based on document schema.
    """
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları desteklenir")

    try:
        # Read file content
        content = await file.read()

        # Validate document type if provided
        if document_type and document_type not in [e.value for e in DocumentType]:
            raise HTTPException(
                status_code=400,
                detail=f"Geçersiz belge türü. Desteklenenler: {[e.value for e in DocumentType]}"
            )

        # Analyze PDF
        result = await pdf_vision_analyzer.analyze_from_bytes(
            pdf_bytes=content,
            filename=file.filename,
            document_type=document_type,
            custom_prompt=custom_prompt,
            provider=provider
        )

        return AnalysisResponse(
            success=result.success,
            document_type=result.document_type,
            confidence=result.confidence,
            summary=result.summary,
            extracted_data=result.extracted_data,
            visual_elements=result.visual_elements,
            raw_text=result.raw_text[:5000] if result.raw_text else "",  # Limit raw text
            page_count=result.metadata.get("pages", 0),
            metadata=result.metadata,
            error=result.error
        )

    except Exception as e:
        logger.error(f"PDF analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/chat", response_model=ChatAnalysisResponse)
async def analyze_pdf_for_chat(
    file: UploadFile = File(..., description="PDF file to analyze"),
    user_question: Optional[str] = Form(None, description="User's question about the PDF"),
    provider: str = Form("openai", description="Vision provider")
):
    """
    Analyze PDF for chat context

    Returns a simplified analysis optimized for LLM context injection.
    Includes:
    - Document type detection
    - Key information extraction
    - Context string ready for LLM prompt
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları desteklenir")

    try:
        content = await file.read()

        # Full analysis
        result = await pdf_vision_analyzer.analyze_from_bytes(
            pdf_bytes=content,
            filename=file.filename,
            document_type=None,  # Auto-detect
            provider=provider
        )

        if not result.success:
            return ChatAnalysisResponse(
                success=False,
                document_type="unknown",
                summary="",
                key_info={},
                context_for_llm="",
                error=result.error
            )

        # Build context for LLM
        context_parts = [
            f"## Yüklenen Belge: {file.filename}",
            f"**Belge Türü:** {DOCUMENT_SCHEMAS.get(DocumentType(result.document_type), {}).get('name', result.document_type)}",
            f"**Sayfa Sayısı:** {result.metadata.get('pages', 1)}",
            "",
            "### Çıkarılan Bilgiler:",
            result.summary,
            "",
            "### Detaylı Veriler:",
            _format_extracted_data(result.extracted_data)
        ]

        if user_question:
            context_parts.insert(0, f"Kullanıcı Sorusu: {user_question}\n")

        # Prepare key info (most important fields)
        key_info = _extract_key_info(result.document_type, result.extracted_data)

        return ChatAnalysisResponse(
            success=True,
            document_type=result.document_type,
            summary=result.summary,
            key_info=key_info,
            context_for_llm="\n".join(context_parts)
        )

    except Exception as e:
        logger.error(f"Chat PDF analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/types")
async def get_document_types():
    """
    Get supported document types and their schemas

    Returns list of document types with:
    - type: Type identifier
    - name: Display name
    - description: What this type covers
    - fields: Expected extraction fields
    """
    types = []
    for doc_type in DocumentType:
        schema = DOCUMENT_SCHEMAS.get(doc_type, {})
        types.append({
            "type": doc_type.value,
            "name": schema.get("name", doc_type.value),
            "description": schema.get("description", ""),
            "fields": schema.get("extract_fields", []),
            "visual_elements": schema.get("visual_elements", [])
        })

    return {
        "success": True,
        "types": types,
        "total": len(types)
    }


@router.get("/health")
async def health_check():
    """Health check for PDF Vision Analyzer"""
    from services.pdf_vision_analyzer import OPENAI_API_KEY, GOOGLE_API_KEY

    providers = {
        "openai": bool(OPENAI_API_KEY),
        "gemini": bool(GOOGLE_API_KEY)
    }

    available_providers = [k for k, v in providers.items() if v]

    return {
        "status": "healthy" if available_providers else "degraded",
        "service": "pdf-vision-analyzer",
        "providers": providers,
        "available_providers": available_providers,
        "supported_types": [e.value for e in DocumentType],
        "features": [
            "visual_analysis",
            "schema_based_extraction",
            "auto_document_detection",
            "multi_page_support"
        ]
    }


def _format_extracted_data(data: dict, indent: int = 0) -> str:
    """Format extracted data for LLM context"""
    if not data:
        return "Veri çıkarılamadı."

    lines = []
    prefix = "  " * indent

    for key, value in data.items():
        if isinstance(value, dict):
            lines.append(f"{prefix}- **{key}:**")
            lines.append(_format_extracted_data(value, indent + 1))
        elif isinstance(value, list):
            lines.append(f"{prefix}- **{key}:**")
            for item in value[:5]:  # Limit list items
                if isinstance(item, dict):
                    lines.append(_format_extracted_data(item, indent + 1))
                else:
                    lines.append(f"{prefix}  - {item}")
        elif value:
            lines.append(f"{prefix}- **{key}:** {value}")

    return "\n".join(lines)


def _extract_key_info(document_type: str, data: dict) -> dict:
    """Extract most important fields for quick display"""
    key_fields = {
        "tapu": ["il", "ilce", "ada_no", "parsel_no", "malik_adi", "yuzolcumu"],
        "fatura": ["fatura_no", "fatura_tarihi", "satici_unvan", "genel_toplam"],
        "harita": ["harita_tipi", "olcek", "parseller"],
        "sozlesme": ["sozlesme_tipi", "taraflar", "bedel", "sozlesme_tarihi"],
        "kimlik": ["belge_tipi", "ad", "soyad", "dogum_tarihi"],
        "resmi_yazi": ["kurum", "sayi", "konu", "tarih"],
        "banka": ["banka_adi", "belge_tipi", "bakiye"],
        "genel": ["belge_tipi", "tarih", "baslik"]
    }

    fields = key_fields.get(document_type, key_fields["genel"])
    return {k: data.get(k) for k in fields if data.get(k)}
