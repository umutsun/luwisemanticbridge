"""
PDF Vision Analyzer Service
Intelligent visual analysis of PDFs using vision-capable LLMs

Features:
- Schema-based document analysis (tapu, fatura, harita, etc.)
- Visual content interpretation (maps, diagrams, tables)
- Structured data extraction
- Multi-provider support (OpenAI GPT-4o, Google Gemini, Claude)

Document Types:
- tapu: Land registry documents
- fatura: Invoices
- harita: Maps and cadastral plans
- sozlesme: Contracts
- kimlik: ID documents
- genel: General documents
"""

import os
import base64
import json
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime
from dataclasses import dataclass, asdict
from enum import Enum
import fitz  # PyMuPDF
from loguru import logger
import openai
import httpx

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_VISION_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")

# Vision model settings
DEFAULT_VISION_MODEL = os.getenv("VISION_MODEL", "gpt-4o")
MAX_IMAGE_SIZE_MB = 20
MAX_PAGES_FOR_VISION = 10  # Limit pages to analyze visually


class DocumentType(str, Enum):
    """Supported document types for schema-based analysis"""
    TAPU = "tapu"
    FATURA = "fatura"
    HARITA = "harita"
    SOZLESME = "sozlesme"
    KIMLIK = "kimlik"
    RESMI_YAZI = "resmi_yazi"
    BANKA = "banka"
    GENEL = "genel"


@dataclass
class AnalysisResult:
    """Structured analysis result"""
    success: bool
    document_type: str
    confidence: float
    summary: str
    extracted_data: Dict[str, Any]
    visual_elements: List[Dict[str, Any]]
    raw_text: str
    page_analyses: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    error: Optional[str] = None


# Document analysis schemas - Turkish prompts for better accuracy
DOCUMENT_SCHEMAS = {
    DocumentType.TAPU: {
        "name": "Tapu Senedi",
        "description": "Gayrimenkul tapu belgesi analizi",
        "extract_fields": [
            "ada_no", "parsel_no", "il", "ilce", "mahalle", "yuzolcumu",
            "nitelik", "malik_adi", "malik_tc", "edinme_tarihi", "edinme_sekli",
            "tapu_tarihi", "cilt_no", "sayfa_no", "yevmiye_no"
        ],
        "visual_elements": ["harita", "kroki", "mühür", "imza", "karekod"],
        "prompt_template": """Bu bir TAPU SENEDİ belgesidir. Lütfen aşağıdaki bilgileri çıkar:

1. **Taşınmaz Bilgileri:**
   - İl, İlçe, Mahalle/Köy
   - Ada No, Parsel No
   - Yüzölçümü (m²)
   - Nitelik (arsa, tarla, bina, vs.)

2. **Malik Bilgileri:**
   - Malik adı/adları
   - TC Kimlik No (varsa)
   - Hisse oranları

3. **İşlem Bilgileri:**
   - Edinme tarihi ve şekli (satış, miras, vs.)
   - Tapu tarihi
   - Cilt/Sayfa/Yevmiye No

4. **Görsel Unsurlar:**
   - Harita/kroki var mı?
   - Resmi mühür görünüyor mu?
   - İmzalar mevcut mu?
   - Karekod var mı?

JSON formatında yanıt ver."""
    },

    DocumentType.FATURA: {
        "name": "Fatura",
        "description": "Ticari fatura analizi",
        "extract_fields": [
            "fatura_no", "fatura_tarihi", "satici_unvan", "satici_vkn",
            "alici_unvan", "alici_vkn", "toplam_tutar", "kdv_orani",
            "kdv_tutari", "genel_toplam", "kalemler"
        ],
        "visual_elements": ["logo", "karekod", "barkod", "imza", "kaşe"],
        "prompt_template": """Bu bir TİCARİ FATURA belgesidir. Lütfen aşağıdaki bilgileri çıkar:

1. **Fatura Bilgileri:**
   - Fatura No
   - Fatura Tarihi
   - Fatura Tipi (satış, iade, vs.)

2. **Satıcı Bilgileri:**
   - Ünvan
   - Vergi No / TC Kimlik No
   - Adres

3. **Alıcı Bilgileri:**
   - Ünvan
   - Vergi No / TC Kimlik No
   - Adres

4. **Tutar Bilgileri:**
   - Ara Toplam
   - KDV Oranı ve Tutarı
   - Genel Toplam
   - Para birimi

5. **Kalemler:** (her kalem için)
   - Ürün/Hizmet adı
   - Miktar
   - Birim fiyat
   - Tutar

6. **Görsel Unsurlar:**
   - Firma logosu
   - Karekod/Barkod
   - İmza/Kaşe

JSON formatında yanıt ver."""
    },

    DocumentType.HARITA: {
        "name": "Harita / Kroki",
        "description": "Kadastral harita ve imar planı analizi",
        "extract_fields": [
            "harita_tipi", "olcek", "koordinatlar", "parseller",
            "yollar", "sinirlar", "alan_hesaplari", "lejant"
        ],
        "visual_elements": ["lejant", "pusula", "ölçek_çubuğu", "koordinat_sistemi"],
        "prompt_template": """Bu bir HARİTA/KROKİ belgesidir. Lütfen görsel analiz yap:

1. **Harita Türü:**
   - Kadastral harita mı?
   - İmar planı mı?
   - Aplikasyon krokisi mi?
   - Vaziyet planı mı?

2. **Teknik Bilgiler:**
   - Ölçek (1/500, 1/1000, vs.)
   - Koordinat sistemi
   - Projeksiyon tipi

3. **Parseller:**
   - Görünen parsel numaraları
   - Parsel sınırları
   - Komşu parseller

4. **Yollar ve Altyapı:**
   - Yollar ve genişlikleri
   - Su/kanalizasyon hatları
   - Elektrik hatları

5. **Lejant ve Semboller:**
   - Lejant açıklamaları
   - Kullanılan semboller
   - Pusula yönü

6. **Alan Hesaplamaları:**
   - Toplam alan
   - Yapı alanları
   - Yeşil alanlar

Haritadaki TÜM görsel detayları açıkla. JSON formatında yanıt ver."""
    },

    DocumentType.SOZLESME: {
        "name": "Sözleşme",
        "description": "Hukuki sözleşme analizi",
        "extract_fields": [
            "sozlesme_tipi", "taraflar", "sozlesme_tarihi", "sure",
            "bedel", "teminat", "ozel_kosullar", "fesih_kosullari"
        ],
        "visual_elements": ["imza", "paraf", "kaşe", "noter_onay"],
        "prompt_template": """Bu bir SÖZLEŞME belgesidir. Lütfen aşağıdaki bilgileri çıkar:

1. **Sözleşme Bilgileri:**
   - Sözleşme türü (kira, satış, iş, vs.)
   - Sözleşme tarihi
   - Sözleşme süresi

2. **Taraflar:**
   - Taraf 1 (adı, unvanı, kimlik/vergi no)
   - Taraf 2 (adı, unvanı, kimlik/vergi no)
   - Diğer taraflar (varsa)

3. **Mali Hükümler:**
   - Bedel/Ücret
   - Ödeme şekli
   - Teminat/Depozito

4. **Önemli Maddeler:**
   - Özel koşullar
   - Fesih şartları
   - Cezai şartlar

5. **Görsel Unsurlar:**
   - İmzalar mevcut mu?
   - Paraflar var mı?
   - Noter onayı var mı?

JSON formatında yanıt ver."""
    },

    DocumentType.KIMLIK: {
        "name": "Kimlik Belgesi",
        "description": "Nüfus cüzdanı, ehliyet, pasaport analizi",
        "extract_fields": [
            "belge_tipi", "tc_kimlik_no", "ad", "soyad", "dogum_tarihi",
            "dogum_yeri", "cinsiyet", "gecerlilik_tarihi", "seri_no"
        ],
        "visual_elements": ["fotograf", "imza", "hologram", "karekod", "mrz"],
        "prompt_template": """Bu bir KİMLİK BELGESİ (TC Kimlik, Ehliyet, Pasaport vb.) dir.

⚠️ GİZLİLİK UYARISI: Kişisel verileri korumak için TC Kimlik No'nun sadece ilk 3 ve son 2 hanesini göster, ortasını maskele (123*****90 gibi).

Lütfen aşağıdaki bilgileri çıkar:

1. **Belge Türü:**
   - TC Kimlik Kartı / Nüfus Cüzdanı
   - Sürücü Belgesi
   - Pasaport
   - Diğer

2. **Kişisel Bilgiler:**
   - Ad Soyad
   - TC Kimlik No (maskelenmiş)
   - Doğum Tarihi ve Yeri
   - Cinsiyet

3. **Belge Bilgileri:**
   - Seri No
   - Geçerlilik Tarihi
   - Düzenleyen Makam

4. **Güvenlik Unsurları:**
   - Fotoğraf mevcut mu?
   - Hologram görünüyor mu?
   - MRZ kodu var mı?

JSON formatında yanıt ver."""
    },

    DocumentType.RESMI_YAZI: {
        "name": "Resmi Yazı",
        "description": "Devlet kurumu resmi yazışmaları",
        "extract_fields": [
            "kurum", "sayi", "konu", "tarih", "muhatap",
            "icerik_ozeti", "ekler", "imza_yetkili"
        ],
        "visual_elements": ["antet", "mühür", "imza", "karekod", "evrak_kayit"],
        "prompt_template": """Bu bir RESMİ YAZI/EVRAK belgesidir. Lütfen aşağıdaki bilgileri çıkar:

1. **Yazı Bilgileri:**
   - Düzenleyen Kurum/Birim
   - Sayı/Evrak No
   - Tarih
   - Konu

2. **Muhatap:**
   - Yazının gönderildiği kişi/kurum
   - Adres bilgileri

3. **İçerik:**
   - Yazının özeti (2-3 cümle)
   - Ana talepler/bildirimler
   - Varsa süre/tarih bilgileri

4. **Ekler:**
   - Ek listesi

5. **İmza Bilgileri:**
   - İmza yetkilisinin adı/unvanı
   - İmza mevcut mu?

6. **Görsel Unsurlar:**
   - Kurum anteti/logosu
   - Resmi mühür
   - Evrak kayıt damgası

JSON formatında yanıt ver."""
    },

    DocumentType.BANKA: {
        "name": "Banka Belgesi",
        "description": "Hesap özeti, dekont, kredi belgesi",
        "extract_fields": [
            "banka_adi", "belge_tipi", "hesap_no", "iban", "tarih",
            "islemler", "bakiye", "doviz_cinsi"
        ],
        "visual_elements": ["banka_logo", "karekod", "imza", "kaşe"],
        "prompt_template": """Bu bir BANKA BELGESİ (hesap özeti, dekont, vb.) dir. Lütfen aşağıdaki bilgileri çıkar:

1. **Banka Bilgileri:**
   - Banka Adı
   - Şube Adı/Kodu
   - Belge türü (hesap özeti, dekont, referans mektubu, vs.)

2. **Hesap Bilgileri:**
   - Hesap No
   - IBAN
   - Hesap sahibi
   - Döviz cinsi

3. **İşlem Detayları:**
   - Tarih aralığı
   - İşlem listesi (varsa ilk 5-10 işlem)
   - Açıklama, tutar, bakiye

4. **Özet:**
   - Dönem başı bakiye
   - Toplam giriş
   - Toplam çıkış
   - Dönem sonu bakiye

JSON formatında yanıt ver."""
    },

    DocumentType.GENEL: {
        "name": "Genel Belge",
        "description": "Genel amaçlı belge analizi",
        "extract_fields": [
            "belge_tipi", "tarih", "baslik", "icerik_ozeti",
            "onemli_bilgiler", "gorunen_rakamlar"
        ],
        "visual_elements": ["tablo", "grafik", "resim", "logo", "imza"],
        "prompt_template": """Bu belgeyi analiz et ve aşağıdaki bilgileri çıkar:

1. **Belge Tanımlama:**
   - Bu ne tür bir belge? (tahmin et)
   - Belgenin amacı ne olabilir?

2. **Temel Bilgiler:**
   - Tarih bilgileri
   - Başlık veya konu
   - Düzenleyen/yazan kişi/kurum

3. **İçerik Özeti:**
   - Belgenin ana konusu (2-3 cümle)
   - Önemli noktalar

4. **Sayısal Veriler:**
   - Görünen rakamlar ve anlamları
   - Tutarlar, miktarlar, oranlar

5. **Görsel Unsurlar:**
   - Tablolar var mı? (varsa içeriği özetle)
   - Grafikler var mı? (varsa ne gösteriyor)
   - Resimler/logolar
   - İmza/mühür

JSON formatında yanıt ver."""
    }
}


class PDFVisionAnalyzer:
    """
    Intelligent PDF visual analyzer using vision-capable LLMs

    Supports:
    - OpenAI GPT-4o
    - Google Gemini Pro Vision
    - Anthropic Claude 3
    """

    def __init__(self):
        self.openai_client = None
        self.httpx_client = httpx.AsyncClient(timeout=120.0)

        if OPENAI_API_KEY:
            self.openai_client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
            logger.info("OpenAI Vision client initialized")

    async def analyze_pdf(
        self,
        pdf_path: str,
        document_type: Optional[str] = None,
        custom_prompt: Optional[str] = None,
        provider: str = "openai",
        max_pages: int = MAX_PAGES_FOR_VISION
    ) -> AnalysisResult:
        """
        Analyze PDF using vision model

        Args:
            pdf_path: Path to PDF file
            document_type: Document type for schema-based analysis (tapu, fatura, harita, etc.)
            custom_prompt: Custom analysis prompt (overrides schema prompt)
            provider: Vision provider (openai, gemini, claude)
            max_pages: Maximum pages to analyze

        Returns:
            AnalysisResult with extracted data
        """
        start_time = datetime.now()

        try:
            # Convert PDF to images
            images = self._pdf_to_images(pdf_path, max_pages=max_pages)

            if not images:
                return AnalysisResult(
                    success=False,
                    document_type="unknown",
                    confidence=0.0,
                    summary="",
                    extracted_data={},
                    visual_elements=[],
                    raw_text="",
                    page_analyses=[],
                    metadata={"pages": 0},
                    error="PDF'den görüntü çıkarılamadı"
                )

            logger.info(f"Converted PDF to {len(images)} images for analysis")

            # Auto-detect document type if not specified
            if not document_type:
                document_type = await self._detect_document_type(images[0], provider)

            # Get schema for document type
            doc_type_enum = DocumentType(document_type) if document_type in [e.value for e in DocumentType] else DocumentType.GENEL
            schema = DOCUMENT_SCHEMAS.get(doc_type_enum, DOCUMENT_SCHEMAS[DocumentType.GENEL])

            # Build analysis prompt
            if custom_prompt:
                analysis_prompt = custom_prompt
            else:
                analysis_prompt = schema["prompt_template"]

            # Analyze each page
            page_analyses = []
            all_extracted_data = {}
            all_visual_elements = []
            all_text = []

            for i, image_bytes in enumerate(images):
                logger.info(f"Analyzing page {i + 1}/{len(images)}...")

                page_result = await self._analyze_image(
                    image_bytes,
                    analysis_prompt,
                    provider
                )

                if page_result.get("success"):
                    page_analyses.append({
                        "page": i + 1,
                        "analysis": page_result.get("analysis", {}),
                        "raw_response": page_result.get("raw_response", "")
                    })

                    # Merge extracted data
                    if isinstance(page_result.get("analysis"), dict):
                        for key, value in page_result["analysis"].items():
                            if key not in all_extracted_data or not all_extracted_data[key]:
                                all_extracted_data[key] = value

                    all_text.append(page_result.get("raw_response", ""))

            # Generate summary
            summary = await self._generate_summary(
                document_type=doc_type_enum.value,
                extracted_data=all_extracted_data,
                page_count=len(images),
                provider=provider
            )

            # Calculate confidence
            confidence = self._calculate_confidence(all_extracted_data, schema)

            processing_time = (datetime.now() - start_time).total_seconds()

            return AnalysisResult(
                success=True,
                document_type=doc_type_enum.value,
                confidence=confidence,
                summary=summary,
                extracted_data=all_extracted_data,
                visual_elements=all_visual_elements,
                raw_text="\n\n---\n\n".join(all_text),
                page_analyses=page_analyses,
                metadata={
                    "pages": len(images),
                    "provider": provider,
                    "schema": schema["name"],
                    "processing_time_seconds": processing_time,
                    "analyzed_at": datetime.now().isoformat()
                }
            )

        except Exception as e:
            logger.error(f"PDF analysis error: {e}")
            return AnalysisResult(
                success=False,
                document_type=document_type or "unknown",
                confidence=0.0,
                summary="",
                extracted_data={},
                visual_elements=[],
                raw_text="",
                page_analyses=[],
                metadata={},
                error=str(e)
            )

    def _pdf_to_images(self, pdf_path: str, dpi: int = 150, max_pages: int = 10) -> List[bytes]:
        """Convert PDF pages to images"""
        images = []
        try:
            doc = fitz.open(pdf_path)
            page_count = min(len(doc), max_pages)

            for page_num in range(page_count):
                page = doc[page_num]
                mat = fitz.Matrix(dpi / 72, dpi / 72)
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png")
                images.append(img_bytes)

            doc.close()
            return images

        except Exception as e:
            logger.error(f"PDF to image conversion error: {e}")
            return []

    async def _detect_document_type(self, image_bytes: bytes, provider: str) -> str:
        """Auto-detect document type from first page"""
        detection_prompt = """Bu belgenin türünü belirle. Aşağıdakilerden biri olmalı:
- tapu (tapu senedi, gayrimenkul belgesi)
- fatura (ticari fatura, e-fatura)
- harita (kadastral harita, imar planı, kroki)
- sozlesme (kira, satış, iş sözleşmesi)
- kimlik (TC kimlik, ehliyet, pasaport)
- resmi_yazi (devlet kurumu yazısı)
- banka (hesap özeti, dekont)
- genel (diğer belgeler)

Sadece belge türünü yaz, başka bir şey yazma."""

        try:
            result = await self._call_vision_api(image_bytes, detection_prompt, provider)
            detected = result.get("text", "").strip().lower()

            # Map to valid document type
            type_mapping = {
                "tapu": "tapu",
                "fatura": "fatura",
                "harita": "harita",
                "kroki": "harita",
                "sozlesme": "sozlesme",
                "sözleşme": "sozlesme",
                "kimlik": "kimlik",
                "resmi_yazi": "resmi_yazi",
                "resmi yazi": "resmi_yazi",
                "resmi yazı": "resmi_yazi",
                "banka": "banka",
                "genel": "genel"
            }

            for key, value in type_mapping.items():
                if key in detected:
                    logger.info(f"Auto-detected document type: {value}")
                    return value

            return "genel"

        except Exception as e:
            logger.warning(f"Document type detection failed: {e}")
            return "genel"

    async def _analyze_image(
        self,
        image_bytes: bytes,
        prompt: str,
        provider: str
    ) -> Dict[str, Any]:
        """Analyze single image with vision model"""
        try:
            result = await self._call_vision_api(image_bytes, prompt, provider)

            if not result.get("success"):
                return {"success": False, "error": result.get("error")}

            raw_response = result.get("text", "")

            # Try to parse JSON from response
            analysis = self._parse_json_response(raw_response)

            return {
                "success": True,
                "analysis": analysis,
                "raw_response": raw_response
            }

        except Exception as e:
            logger.error(f"Image analysis error: {e}")
            return {"success": False, "error": str(e)}

    async def _call_vision_api(
        self,
        image_bytes: bytes,
        prompt: str,
        provider: str
    ) -> Dict[str, Any]:
        """Call vision API based on provider"""

        if provider == "openai" and self.openai_client:
            return await self._call_openai_vision(image_bytes, prompt)
        elif provider == "gemini" and GOOGLE_API_KEY:
            return await self._call_gemini_vision(image_bytes, prompt)
        else:
            # Fallback to OpenAI
            if self.openai_client:
                return await self._call_openai_vision(image_bytes, prompt)
            else:
                return {"success": False, "error": "No vision provider available"}

    async def _call_openai_vision(self, image_bytes: bytes, prompt: str) -> Dict[str, Any]:
        """Call OpenAI GPT-4 Vision"""
        try:
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')

            response = await self.openai_client.chat.completions.create(
                model="gpt-4o",
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
                                "text": prompt
                            }
                        ]
                    }
                ],
                max_tokens=4096
            )

            if response.choices:
                text = response.choices[0].message.content or ""
                return {"success": True, "text": text}

            return {"success": False, "error": "No response from OpenAI"}

        except Exception as e:
            logger.error(f"OpenAI Vision error: {e}")
            return {"success": False, "error": str(e)}

    async def _call_gemini_vision(self, image_bytes: bytes, prompt: str) -> Dict[str, Any]:
        """Call Google Gemini Vision"""
        try:
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')

            url = f"https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={GOOGLE_API_KEY}"

            payload = {
                "contents": [{
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": "image/png",
                                "data": image_b64
                            }
                        },
                        {
                            "text": prompt
                        }
                    ]
                }],
                "generationConfig": {
                    "maxOutputTokens": 4096
                }
            }

            response = await self.httpx_client.post(url, json=payload)

            if response.status_code == 200:
                data = response.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return {"success": True, "text": text}

            return {"success": False, "error": f"Gemini API error: {response.status_code}"}

        except Exception as e:
            logger.error(f"Gemini Vision error: {e}")
            return {"success": False, "error": str(e)}

    def _parse_json_response(self, text: str) -> Dict[str, Any]:
        """Parse JSON from LLM response"""
        try:
            # Try to find JSON in response
            import re

            # Look for JSON block
            json_match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))

            # Try to find any JSON object
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(0))

            # Return as-is in a wrapper
            return {"raw_text": text}

        except json.JSONDecodeError:
            return {"raw_text": text}

    async def _generate_summary(
        self,
        document_type: str,
        extracted_data: Dict[str, Any],
        page_count: int,
        provider: str
    ) -> str:
        """Generate human-readable summary"""
        schema = DOCUMENT_SCHEMAS.get(DocumentType(document_type), DOCUMENT_SCHEMAS[DocumentType.GENEL])

        summary_parts = [
            f"**Belge Türü:** {schema['name']}",
            f"**Sayfa Sayısı:** {page_count}"
        ]

        # Add key extracted data to summary
        if document_type == "tapu":
            if extracted_data.get("il") or extracted_data.get("ilce"):
                summary_parts.append(f"**Konum:** {extracted_data.get('il', '')} / {extracted_data.get('ilce', '')}")
            if extracted_data.get("ada_no") or extracted_data.get("parsel_no"):
                summary_parts.append(f"**Ada/Parsel:** {extracted_data.get('ada_no', '-')} / {extracted_data.get('parsel_no', '-')}")

        elif document_type == "fatura":
            if extracted_data.get("fatura_no"):
                summary_parts.append(f"**Fatura No:** {extracted_data.get('fatura_no')}")
            if extracted_data.get("genel_toplam"):
                summary_parts.append(f"**Toplam:** {extracted_data.get('genel_toplam')}")

        elif document_type == "harita":
            if extracted_data.get("olcek"):
                summary_parts.append(f"**Ölçek:** {extracted_data.get('olcek')}")
            if extracted_data.get("harita_tipi"):
                summary_parts.append(f"**Harita Türü:** {extracted_data.get('harita_tipi')}")

        return "\n".join(summary_parts)

    def _calculate_confidence(self, extracted_data: Dict[str, Any], schema: Dict) -> float:
        """Calculate extraction confidence based on filled fields"""
        if not extracted_data:
            return 0.0

        expected_fields = schema.get("extract_fields", [])
        if not expected_fields:
            return 0.5

        filled_count = sum(1 for field in expected_fields if extracted_data.get(field))
        confidence = filled_count / len(expected_fields)

        return round(confidence, 2)

    async def analyze_from_bytes(
        self,
        pdf_bytes: bytes,
        filename: str,
        document_type: Optional[str] = None,
        custom_prompt: Optional[str] = None,
        provider: str = "openai"
    ) -> AnalysisResult:
        """
        Analyze PDF from bytes (for API uploads)
        """
        import tempfile
        import os

        # Write to temp file
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            result = await self.analyze_pdf(
                pdf_path=tmp_path,
                document_type=document_type,
                custom_prompt=custom_prompt,
                provider=provider
            )
            result.metadata["filename"] = filename
            return result
        finally:
            # Clean up temp file
            os.unlink(tmp_path)

    def get_supported_types(self) -> List[Dict[str, str]]:
        """Get list of supported document types"""
        return [
            {
                "type": doc_type.value,
                "name": schema["name"],
                "description": schema["description"]
            }
            for doc_type, schema in DOCUMENT_SCHEMAS.items()
        ]


# Singleton instance
pdf_vision_analyzer = PDFVisionAnalyzer()
