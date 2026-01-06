"""
Semantic Analyzer Service v2.0
High-performance semantic analysis for RAG quality control

CRITICAL FEATURES:
1. Action/Verb extraction and matching (asmak ≠ bulundurmak)
2. Modality/Polarity alignment (zorunlu mu? → zorunludur/değildir)
3. Similarity + Rule-based hybrid decision
4. Redis caching for performance
5. Timeout and degraded mode support

NO spaCy - uses multilingual embeddings + rule-based extraction
"""

import re
import os
import asyncio
import hashlib
import json
import uuid
from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass, field, asdict
from enum import Enum
import time
from datetime import datetime

from loguru import logger


# === CONFIGURATION ===
ANALYZER_TIMEOUT = float(os.getenv("SEMANTIC_ANALYZER_TIMEOUT", "5.0"))
DEGRADED_MODE_ENABLED = os.getenv("SEMANTIC_ANALYZER_DEGRADED", "true").lower() == "true"
CACHE_TTL = int(os.getenv("SEMANTIC_CACHE_TTL", "300"))  # 5 minutes
CACHE_PREFIX = "semantic_analyzer"
SCHEMA_CONFIG_KEY = "semantic_analyzer_config"  # Redis key for schema-based config


class AnalysisIssue(Enum):
    """Types of issues that can be detected"""
    FORBIDDEN_PATTERN = "forbidden_pattern"
    SEMANTIC_DRIFT = "semantic_drift"
    ACTION_MISMATCH = "action_mismatch"
    MODALITY_MISMATCH = "modality_mismatch"
    NO_VERDICT_SENTENCE = "no_verdict_sentence"
    LOW_RELEVANCE = "low_relevance"
    QUOTE_NOT_VERBATIM = "quote_not_verbatim"  # Quote doesn't exist in source
    MODALITY_INFERENCE = "modality_inference"  # Inferred obligation from possibility
    QUOTE_IS_SYSTEM_MESSAGE = "quote_is_system_message"  # NEW: Quote contains fail-closed message instead of real text


class Modality(Enum):
    """Question/Answer modality types

    STRONG family (obligation): ZORUNLU, GEREKLI, YETERLI
    WEAK family (possibility): MUMKUN, UYGUN
    """
    ZORUNLU = "zorunlu"
    MUMKUN = "mumkun"
    UYGUN = "uygun"
    GEREKLI = "gerekli"
    YETERLI = "yeterli"  # NEW: "yeterli mi?" is STRONG modality
    UNKNOWN = "unknown"

    @classmethod
    def is_strong(cls, modality: "Modality") -> bool:
        """Check if modality is in STRONG family (obligation-related)"""
        return modality in (cls.ZORUNLU, cls.GEREKLI, cls.YETERLI)

    @classmethod
    def is_weak(cls, modality: "Modality") -> bool:
        """Check if modality is in WEAK family (possibility-related)"""
        return modality in (cls.MUMKUN, cls.UYGUN)


class Polarity(Enum):
    """Answer polarity"""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


class PartialRelevanceReason(Enum):
    """Reason codes for partial_relevance (for telemetry and UI)"""
    DUAL_ACTION_ONLY_ONE_COVERED = "dual_action_only_one_covered"
    ANCHOR_AMBIGUITY_SURET = "anchor_ambiguity_suret"
    ANCHOR_CERTIFIED_COPY = "anchor_certified_copy"  # onaylı/tasdikli suret


@dataclass
class ActionExtraction:
    """Extracted action/verb from text"""
    verb: str
    context: str
    normalized: str


@dataclass
class ChunkAnalysis:
    """Analysis result for a single chunk

    Score breakdown:
    - base_score: Core quality score (0-1) from action/modality/patterns
    - bonus: Additional points (0-0.5) from obligation match + anchor match
    - final_score: base_score + bonus (may exceed 1.0, that's OK)
    """
    chunk_id: str
    relevance_score: float
    action_match: bool
    action_details: Optional[str]
    modality_match: bool
    modality_details: Optional[str]
    has_drift: bool
    drift_reason: Optional[str]
    has_forbidden_pattern: bool
    forbidden_pattern: Optional[str]
    has_verdict_sentence: bool
    verdict_sentence: Optional[str]
    object_anchor_match: bool = True  # New: object/keyword anchor
    object_anchor_details: Optional[str] = None  # New: anchor details
    partial_relevance: bool = False  # NEW: dual-action partial match
    partial_relevance_details: Optional[str] = None  # NEW: partial match explanation
    partial_relevance_reason_code: Optional[str] = None  # NEW: enum code for telemetry
    issues: List[str] = field(default_factory=list)
    recommended: bool = False
    # Score breakdown
    base_score: float = 1.0  # Core quality (0-1)
    bonus: float = 0.0  # Additional bonus (0-0.5)
    confidence: float = 0.0  # Legacy: final_score = base + bonus

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def final_score(self) -> float:
        """Calculate final score (base + bonus)"""
        return self.base_score + self.bonus


@dataclass
class QuoteValidation:
    """Validation result for a quote

    When ALINTI contains a system message instead of real source text,
    suggested_quote provides a steril replacement.
    """
    valid: bool
    issues: List[Dict[str, str]]
    suggested_answer: Optional[str]
    suggested_quote: Optional[str] = None  # NEW: steril ALINTI replacement when quote_is_system_message
    confidence: float = 1.0
    fail_reasons: List[str] = field(default_factory=list)
    config_version: Optional[str] = None  # Track which config was used

    def to_dict(self) -> dict:
        return asdict(self)


class RedisCache:
    """Redis cache wrapper for semantic analyzer"""

    def __init__(self):
        self._redis = None
        self._connected = False

    async def connect(self):
        """Connect to Redis"""
        if self._connected:
            return

        try:
            import redis.asyncio as redis
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            self._redis = redis.from_url(redis_url, decode_responses=True)
            await self._redis.ping()
            self._connected = True
            logger.info(f"Semantic analyzer cache connected to Redis")
        except Exception as e:
            logger.warning(f"Redis cache not available: {e}")
            self._connected = False

    def _make_key(self, prefix: str, *args) -> str:
        """Generate cache key from arguments"""
        content = ":".join(str(a) for a in args)
        hash_val = hashlib.md5(content.encode()).hexdigest()[:16]
        return f"{CACHE_PREFIX}:{prefix}:{hash_val}"

    async def get(self, key: str) -> Optional[dict]:
        """Get value from cache"""
        if not self._connected or not self._redis:
            return None
        try:
            data = await self._redis.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.debug(f"Cache get error: {e}")
        return None

    async def set(self, key: str, value: dict, ttl: int = CACHE_TTL):
        """Set value in cache"""
        if not self._connected or not self._redis:
            return
        try:
            await self._redis.setex(key, ttl, json.dumps(value))
        except Exception as e:
            logger.debug(f"Cache set error: {e}")

    async def get_similarity(self, text1: str, text2: str) -> Optional[float]:
        """Get cached similarity score"""
        key = self._make_key("sim", text1, text2)
        result = await self.get(key)
        return result.get("score") if result else None

    async def set_similarity(self, text1: str, text2: str, score: float):
        """Cache similarity score"""
        key = self._make_key("sim", text1, text2)
        await self.set(key, {"score": score})

    async def get_analysis(self, question: str, chunk_text: str) -> Optional[dict]:
        """Get cached chunk analysis"""
        key = self._make_key("analysis", question, chunk_text)
        return await self.get(key)

    async def set_analysis(self, question: str, chunk_text: str, analysis: dict):
        """Cache chunk analysis"""
        key = self._make_key("analysis", question, chunk_text)
        await self.set(key, analysis)

    async def get_config(self) -> Optional[dict]:
        """Get schema-based configuration from Redis"""
        if not self._connected or not self._redis:
            return None
        try:
            data = await self._redis.get(SCHEMA_CONFIG_KEY)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.debug(f"Config get error: {e}")
        return None

    async def set_config(self, config: dict):
        """Store schema-based configuration in Redis"""
        if not self._connected or not self._redis:
            return
        try:
            # Long TTL for config (1 hour)
            await self._redis.setex(SCHEMA_CONFIG_KEY, 3600, json.dumps(config))
        except Exception as e:
            logger.debug(f"Config set error: {e}")


class SemanticAnalyzerService:
    """
    Semantic analysis service for RAG quality control

    Decision hierarchy:
    1. Action/Verb match (most important - asmak ≠ bulundurmak)
    2. Modality/Polarity alignment (zorunlu mu? → zorunludur answer)
    3. Forbidden patterns (KONU, İLGİ, sorulmaktadır)
    4. Verdict sentence presence
    5. Similarity score (least important alone)
    """

    # === VERDICT TOKEN CATEGORIES ===
    # IMPORTANT: Lists are sorted by length (longest-first) to prevent
    # "zorunlu" matching before "zorunlu değildir"
    #
    # STRONG: Definitive obligation/sufficiency statements
    # Includes: zorunlu, gerekli, yeterli (all answer obligation questions)
    STRONG_VERDICT_TOKENS = sorted([
        "zorunludur", "zorunlu değildir", "zorunlu bulunmamaktadır",
        "gerekmektedir", "gerekmemektedir", "gerekmez",
        "mecburidir", "mecburi değildir",
        "şarttır", "şart değildir",
        "yeterlidir", "yeterli değildir",  # MOVED from WEAK - answers "yeterli mi?"
    ], key=len, reverse=True)  # Longest-first matching

    # WEAK: Possibility/suitability statements (cannot infer STRONG from these)
    # NOTE: WEAK ≠ low confidence. WEAK = "cannot infer obligation from this"
    # If question asks "mümkün mü?", WEAK token IS definitive for that modality
    WEAK_VERDICT_TOKENS = sorted([
        "mümkündür", "mümkün değildir", "mümkün bulunmamaktadır",
        "uygundur", "uygun değildir",
        "yapılabilir", "yapılamaz",
        "olabilir", "olamaz",
    ], key=len, reverse=True)  # Longest-first matching

    @classmethod
    def _find_verdict_tokens(cls, text: str) -> Tuple[List[str], List[str]]:
        """Find verdict tokens using longest-first matching

        Prevents "zorunlu" from matching when "zorunlu değildir" is present.

        Returns:
            (strong_tokens, weak_tokens) - Found tokens in each category
        """
        text_norm = cls._normalize_text(text)
        found_strong = []
        found_weak = []

        # Track matched positions to avoid overlapping matches
        matched_positions = set()

        def find_token(token: str) -> Optional[int]:
            """Find token position, avoiding already matched regions"""
            start = 0
            while True:
                pos = text_norm.find(token, start)
                if pos == -1:
                    return None
                # Check if this position overlaps with already matched tokens
                token_range = set(range(pos, pos + len(token)))
                if not token_range.intersection(matched_positions):
                    return pos
                start = pos + 1
            return None

        # Match STRONG tokens first (longest-first within category)
        for token in cls.STRONG_VERDICT_TOKENS:
            pos = find_token(token)
            if pos is not None:
                found_strong.append(token)
                matched_positions.update(range(pos, pos + len(token)))

        # Then match WEAK tokens (longest-first within category)
        for token in cls.WEAK_VERDICT_TOKENS:
            pos = find_token(token)
            if pos is not None:
                found_weak.append(token)
                matched_positions.update(range(pos, pos + len(token)))

        return found_strong, found_weak

    @staticmethod
    def _normalize_text(text: str) -> str:
        """Unified text normalization for all comparisons

        Normalizes whitespace and converts to lowercase.
        Used across all text comparison methods for consistency.
        """
        if not text:
            return ""
        # Remove extra whitespace but preserve exact words
        return re.sub(r'\s+', ' ', text.strip().lower())

    def __init__(self):
        self.model_name = os.getenv(
            "SEMANTIC_MODEL",
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
        self._model = None
        self._initialized = False
        self._degraded_mode = False
        self._init_time = 0.0
        self._cache = RedisCache()
        self._verbatim_tolerance = 0.85  # Default, can be overridden by schema

        # Config versioning for debugging/tracking
        self._config_version: Optional[str] = None
        self._config_timestamp: Optional[str] = None

        # === TURKISH VERBS/ACTIONS ===
        self.action_groups = {
            "keep": ["bulundur", "bulundurmak", "taşı", "taşımak", "muhafaza", "sakla", "saklama"],
            "hang": ["as", "asmak", "asma", "asıl", "asılma"],
            "fill": ["doldur", "doldurmak", "düzenle", "düzenleme", "tanzim"],
            "submit": ["ibraz", "ibraz et", "sun", "sunmak", "ver", "teslim"],
            "rent": ["kirala", "kiralama", "kira"],
            "sell": ["sat", "satış", "satım", "devret", "devir"],
            "buy": ["al", "satın al", "satın alma", "temin"],
            "export": ["ihraç", "ihracat", "dış satım"],
            "import": ["ithal", "ithalat", "dış alım"],
            "register": ["tescil", "kayıt", "kaydet", "kaydettir"],
        }

        # === OBJECT/KEYWORD ANCHORS ===
        # Different document types - same action on different objects is NOT equivalent
        self.object_anchors = {
            "vergi_levhası": ["vergi levhası", "vergi levha", "vl", "levha"],
            "sevk_irsaliyesi": ["sevk irsaliyesi", "irsaliye", "sevk belgesi"],
            "fatura": ["fatura", "e-fatura", "efatura", "elektronik fatura"],
            "beyanname": ["beyanname", "kdv beyannamesi", "gelir vergisi beyannamesi"],
            "defter": ["defter", "yevmiye defteri", "envanter defteri", "büyük defter"],
            "fiş": ["fiş", "ödeme kaydedici cihaz fişi", "perakende satış fişi", "yazarkasa fişi"],
            "makbuz": ["makbuz", "gider pusulası", "müstahsil makbuzu"],
            "belge": ["belge", "evrak", "doküman"],
            "ödeme": ["ödeme", "tahsilat", "para", "nakit"],
            "taşınmaz": ["taşınmaz", "gayrimenkul", "arsa", "arazi", "bina", "konut", "işyeri"],
            "araç": ["araç", "otomobil", "taşıt", "motorlu taşıt"],
            "fotokopi": ["fotokopi", "kopya", "suret"],  # NEW: for decoy tests
        }

        # === MODALITY PATTERNS ===
        # STRONG family: ZORUNLU, GEREKLI, YETERLI (obligation-related)
        # WEAK family: MUMKUN, UYGUN (possibility-related)
        self.modality_question_patterns = {
            Modality.ZORUNLU: [
                r"zorunlu\s*(mu|mudur|mıdır|mı)",
                r"zorunlulu[gğ]u\s+var\s*(mı|mıdır)",  # "zorunluluğu var mı"
                r"mecburi\s*(mi|midir)",
                r"şart\s*(mı|mıdır)",
            ],
            Modality.MUMKUN: [
                r"mümkün\s*(mü|müdür|midir|mi)",
                r"yapılabilir\s*mi",
                r"olabilir\s*mi",
            ],
            Modality.UYGUN: [
                r"uygun\s*(mu|mudur)",
                r"doğru\s*mu",
            ],
            Modality.GEREKLI: [
                r"gerekli\s*(mi|midir)",
                r"gerek(ir|iyor)\s*(mi|mı)",  # "gerekir mi"
                r"gerek\s+var\s*(mı|mıdır)",  # "gerek var mı"
                r"lazım\s*(mı|mıdır)",
            ],
            Modality.YETERLI: [  # NEW: STRONG family
                r"yeterli\s*(mi|midir)",
                r"yeter\s*(mi|midir)",
            ],
        }

        self.modality_answer_patterns = {
            (Modality.ZORUNLU, Polarity.POSITIVE): [r"zorunludur", r"mecburidir"],
            (Modality.ZORUNLU, Polarity.NEGATIVE): [r"zorunlu\s+değildir", r"mecburi\s+değildir", r"zorunlu\s+bulunmamaktadır"],
            (Modality.MUMKUN, Polarity.POSITIVE): [r"mümkündür", r"yapılabilir"],
            (Modality.MUMKUN, Polarity.NEGATIVE): [r"mümkün\s+değildir", r"yapılamaz"],
            (Modality.UYGUN, Polarity.POSITIVE): [r"uygundur"],
            (Modality.UYGUN, Polarity.NEGATIVE): [r"uygun\s+değildir"],
            (Modality.GEREKLI, Polarity.POSITIVE): [r"gerekmektedir", r"gereklidir"],
            (Modality.GEREKLI, Polarity.NEGATIVE): [r"gerekmemektedir", r"gerekmez"],
            (Modality.YETERLI, Polarity.POSITIVE): [r"yeterlidir", r"yeter"],  # NEW
            (Modality.YETERLI, Polarity.NEGATIVE): [r"yeterli\s+değildir", r"yetmez"],  # NEW
        }

        # === FORBIDDEN PATTERNS ===
        self.forbidden_patterns = [
            (r"sorulmaktadır", "soru kalıbı"),
            (r"mümkün\s+olup\s+olmadığı", "soru kalıbı"),
            (r"olup\s+olmadığı\s*(hk\.?|hakkında)", "KONU satırı"),
            (r"\s+hk\.?\s*$", "KONU başlığı"),
            (r"^KONU\s*:", "KONU: başlığı"),
            (r"^İLGİ\s*:", "İLGİ: başlığı"),
            (r"Dilekçenizde.*sorulmaktadır", "dilekçe soru kalıbı"),
        ]

        # === VERDICT PATTERNS ===
        self.verdict_patterns = [
            r"mümkündür", r"mümkün\s+değildir",
            r"uygundur", r"uygun\s+değildir",
            r"gerekmektedir", r"gerekmemektedir",
            r"zorunludur", r"zorunlu\s+değildir",
            r"yapılmalıdır", r"yapılamaz",
            r"bulunmaktadır", r"bulunmamaktadır",
        ]

        # === FAIL-CLOSED MESSAGES ===
        # Standardized messages for both CEVAP and ALINTI fail-closed scenarios
        # Format: Each message should be usable standalone as CEVAP text
        self.fail_messages = {
            # Action-related issues
            "action_mismatch": "Mevcut kaynak farklı bir eylemi ({quote_action}) ele alıyor. "
                              "Sorulan eylem ({question_action}) hakkında doğrudan hüküm bulunamadı.",
            # Modality-related issues
            "modality_mismatch": "Sorulan '{question_modality}' için cevap '{answer_modality}' "
                                 "türünde verilmiş. Doğru modalite eşleşmesi bulunamadı.",
            "modality_inference": "Kaynak yalnızca 'mümkün/olabilir' yönünde bilgi içeriyor. "
                                  "'Zorunlu olup olmadığı' hakkında açık hüküm cümlesi bulunamadı.",
            # Quote-related issues
            "quote_not_verbatim": "Belirtilen alıntı, kaynak metinde birebir bulunamadı. "
                                  "Lütfen kaynağı kontrol ediniz.",
            "forbidden_pattern": "Bu alıntı soru başlığı/giriş paragrafıdır, hüküm değildir.",
            # Verdict-related issues
            "no_verdict": "Bu konuda açık hüküm cümlesi bulunamadı.",
            "no_strong_verdict": "Kaynakta sadece 'mümkün/uygun' gibi yumuşak ifadeler var. "
                                 "Kesin zorunluluk/yasak bildiren hüküm bulunamadı.",
            # Generic fallback
            "generic": "Bu konuda kesin bir hüküm cümlesi bulunamadı.",
            # ALINTI-specific (synchronized with CEVAP)
            "alinti_empty": "Kaynak metin bu soru için doğrudan alıntılanabilir ifade içermiyor.",
            # System message detection
            "quote_is_system_message": "ALINTI alanında gerçek kaynak metni yerine sistem mesajı bulundu. "
                                       "ALINTI, kaynaktan birebir alıntı olmalıdır.",
        }

        # === SYSTEM MESSAGE PATTERNS ===
        # These patterns detect when ALINTI contains a system/fail-closed message
        # instead of an actual verbatim quote from source
        self.system_message_patterns = [
            # Fail-closed messages
            (r"kesin\s+(bir\s+)?hüküm\s+cümlesi\s+bulunamadı", "fail-closed hüküm mesajı"),
            (r"açık\s+hüküm\s+cümlesi\s+bulunamadı", "fail-closed hüküm mesajı"),
            (r"doğrudan\s+hüküm\s+bulunamadı", "fail-closed hüküm mesajı"),
            (r"bu\s+konuda.*bulunamadı", "fail-closed genel mesajı"),
            (r"kaynak(lar)?\s+(bu\s+)?soru(yu)?\s+karşılamıyor", "kaynak yetersizliği mesajı"),
            (r"ilgili\s+kaynak\s+incelenebilir", "kaynak yönlendirme mesajı"),
            # System-generated phrases
            (r"mevcut\s+kaynak(lar)?(da)?\s+.*\s+bulunamadı", "kaynak yetersizliği mesajı"),
            (r"doğrudan\s+alıntılanabilir\s+ifade\s+içermiyor", "alıntı bulunamadı mesajı"),
            (r"kaynağı\s+kontrol\s+ediniz", "kontrol yönlendirmesi"),
            # Meta-commentary (not actual quotes)
            (r"ancak\s+ilgili\s+kaynak", "meta-yorum"),
            (r"kaynak\s+metin(de)?\s+.*\s+yok", "kaynak içerik yorumu"),
        ]

    async def load_config_from_schema(self, config: dict):
        """Load configuration from database schema

        Expected config structure:
        {
            "action_groups": {...},      # Override action verb groups
            "object_anchors": {...},     # Override object anchor groups
            "forbidden_patterns": [...], # Override forbidden patterns
            "verdict_patterns": [...],   # Override verdict patterns
            "fail_messages": {...},      # Override fail messages
            "verbatim_tolerance": 0.85,  # Quote verification tolerance
            "modality_patterns": {...}   # Override modality patterns
        }
        """
        if not config:
            return

        # Update action groups
        if "action_groups" in config and isinstance(config["action_groups"], dict):
            self.action_groups.update(config["action_groups"])
            logger.info(f"Updated action_groups from schema: {len(config['action_groups'])} groups")

        # Update object anchors
        if "object_anchors" in config and isinstance(config["object_anchors"], dict):
            self.object_anchors.update(config["object_anchors"])
            logger.info(f"Updated object_anchors from schema: {len(config['object_anchors'])} anchors")

        # Update forbidden patterns
        if "forbidden_patterns" in config and isinstance(config["forbidden_patterns"], list):
            self.forbidden_patterns = [
                (p["pattern"], p.get("description", "yasaklı pattern"))
                for p in config["forbidden_patterns"]
                if isinstance(p, dict) and "pattern" in p
            ]
            logger.info(f"Updated forbidden_patterns from schema: {len(self.forbidden_patterns)} patterns")

        # Update verdict patterns
        if "verdict_patterns" in config and isinstance(config["verdict_patterns"], list):
            self.verdict_patterns = config["verdict_patterns"]
            logger.info(f"Updated verdict_patterns from schema: {len(self.verdict_patterns)} patterns")

        # Update fail messages
        if "fail_messages" in config and isinstance(config["fail_messages"], dict):
            self.fail_messages.update(config["fail_messages"])
            logger.info(f"Updated fail_messages from schema")

        # Store verbatim tolerance
        if "verbatim_tolerance" in config:
            self._verbatim_tolerance = float(config["verbatim_tolerance"])
            logger.info(f"Set verbatim_tolerance from schema: {self._verbatim_tolerance}")

        # Generate config version hash for tracking
        config_str = json.dumps(config, sort_keys=True, ensure_ascii=False)
        self._config_version = hashlib.sha256(config_str.encode()).hexdigest()[:12]
        self._config_timestamp = datetime.now().isoformat()
        logger.info(f"Config version: {self._config_version} @ {self._config_timestamp}")

        # Cache the config in Redis (with version info)
        config_with_meta = {
            **config,
            "_version": self._config_version,
            "_timestamp": self._config_timestamp
        }
        await self._cache.set_config(config_with_meta)

    async def initialize(self):
        """Initialize with timeout and degraded mode"""
        if self._initialized:
            return

        start = time.time()

        # Connect to Redis cache
        await self._cache.connect()

        # Try to load config from Redis cache
        cached_config = await self._cache.get_config()
        if cached_config:
            await self.load_config_from_schema(cached_config)
            logger.info("Loaded config from Redis cache")

        try:
            if DEGRADED_MODE_ENABLED:
                try:
                    await asyncio.wait_for(self._load_model(), timeout=ANALYZER_TIMEOUT)
                except asyncio.TimeoutError:
                    logger.warning(f"Model loading timed out, using degraded mode")
                    self._degraded_mode = True
            else:
                await self._load_model()

            self._initialized = True
            self._init_time = time.time() - start
            logger.info(f"Semantic analyzer initialized in {self._init_time:.2f}s (degraded={self._degraded_mode})")

        except Exception as e:
            logger.error(f"Failed to initialize: {e}")
            self._degraded_mode = True
            self._initialized = True

    async def _load_model(self):
        """Load the sentence transformer model"""
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"Loading semantic model: {self.model_name}")
            self._model = SentenceTransformer(self.model_name)
        except ImportError:
            logger.warning("sentence-transformers not installed")
            self._degraded_mode = True
        except Exception as e:
            logger.error(f"Model loading failed: {e}")
            self._degraded_mode = True

    def _extract_actions(self, text: str) -> List[ActionExtraction]:
        """Extract actions/verbs from text with word boundary matching"""
        text_lower = text.lower()
        found_actions = []

        for group_name, verbs in self.action_groups.items():
            for verb in verbs:
                # Use word boundary regex to avoid false positives
                # e.g., "as" should not match "levhası"
                pattern = rf'\b{re.escape(verb)}\w*'
                match = re.search(pattern, text_lower)
                if match:
                    idx = match.start()
                    start = max(0, idx - 30)
                    end = min(len(text), idx + len(verb) + 30)
                    context = text[start:end]
                    found_actions.append(ActionExtraction(verb=verb, context=context, normalized=group_name))

        return found_actions

    def _extract_object_anchors(self, text: str) -> Tuple[Set[str], Dict[str, List[str]]]:
        """Extract object/keyword anchors from text

        Returns:
            (found_anchors, matched_keywords)
            - found_anchors: Set of normalized anchor names (e.g., "vergi_levhası", "fatura")
            - matched_keywords: Dict mapping anchor_name -> list of matched keywords
        """
        text_lower = text.lower()
        found_anchors = set()
        matched_keywords: Dict[str, List[str]] = {}

        for anchor_name, keywords in self.object_anchors.items():
            anchor_matches = []
            for keyword in keywords:
                # Case-insensitive search for keyword
                if keyword.lower() in text_lower:
                    anchor_matches.append(keyword)
            if anchor_matches:
                found_anchors.add(anchor_name)
                matched_keywords[anchor_name] = anchor_matches

        return found_anchors, matched_keywords

    # Certified copy patterns - these indicate "onaylı suret" NOT "fotokopi"
    CERTIFIED_COPY_PATTERNS = [
        r"onaylı\s+suret",
        r"tasdikli\s+suret",
        r"noter\s+onaylı\s+suret",
        r"noter\s+tasdikli\s+suret",
        r"aslına\s+uygun\s+suret",
        r"suret\s+onayı",
        r"sureti\s+onaylı",
    ]

    def _check_object_anchor_match(
        self,
        question: str,
        chunk: str
    ) -> Tuple[bool, Optional[str], Set[str], Set[str], float, Optional[str]]:
        """Check if object anchors in question match chunk

        SURET AMBIGUITY RULE:
        "suret" can mean "certified copy" (onaylı suret) which is different from photocopy.
        When "fotokopi" anchor matches via "suret" alone (without "fotokopi" or "kopya"),
        lower confidence with a warning.

        CERTIFIED COPY EXCLUSION:
        If "onaylı suret", "tasdikli suret", "noter onaylı suret" found,
        completely EXCLUDE the fotokopi anchor match (these are NOT photocopies).

        Returns: (match, reason, question_anchors, chunk_anchors, confidence_penalty, reason_code)
            - confidence_penalty: 0.0 for clean match, 0.1 for ambiguous "suret", 0.25 for certified copy
            - reason_code: PartialRelevanceReason enum value for telemetry
        """
        q_anchors, q_keywords = self._extract_object_anchors(question)
        c_anchors, c_keywords = self._extract_object_anchors(chunk)

        confidence_penalty = 0.0  # No penalty by default
        reason_code = None

        # If question has no specific object, consider it a match
        if not q_anchors:
            return True, None, q_anchors, c_anchors, 0.0, None

        # If chunk has no objects but question does, it's uncertain (not a mismatch)
        if not c_anchors:
            return True, "Chunk'ta nesne belirtilmemiş", q_anchors, c_anchors, 0.0, None

        # Check for intersection
        common = q_anchors.intersection(c_anchors)
        if common:
            # SURET AMBIGUITY CHECK: If "fotokopi" anchor matched via "suret" alone
            if "fotokopi" in common:
                q_fotokopi_keywords = q_keywords.get("fotokopi", [])
                c_fotokopi_keywords = c_keywords.get("fotokopi", [])

                # Check if EITHER question or chunk matched via "suret" alone
                q_has_strong = any(k in ["fotokopi", "kopya"] for k in q_fotokopi_keywords)
                c_has_strong = any(k in ["fotokopi", "kopya"] for k in c_fotokopi_keywords)
                q_only_suret = "suret" in q_fotokopi_keywords and not q_has_strong
                c_only_suret = "suret" in c_fotokopi_keywords and not c_has_strong

                if q_only_suret or c_only_suret:
                    # CERTIFIED COPY CHECK: Look for "onaylı suret" etc. patterns
                    # If found, this is NOT a fotokopi - harder penalty
                    combined_text = (question + " " + chunk).lower()
                    is_certified_copy = any(
                        re.search(pattern, combined_text, re.IGNORECASE)
                        for pattern in self.CERTIFIED_COPY_PATTERNS
                    )

                    if is_certified_copy:
                        # CERTIFIED COPY: This is definitely NOT fotokopi
                        # Remove fotokopi from common anchors, apply hard penalty
                        confidence_penalty = 0.25
                        reason_code = PartialRelevanceReason.ANCHOR_CERTIFIED_COPY.value
                        warning = (
                            '"onaylı/tasdikli suret" ifadesi bulundu - bu "fotokopi" DEĞİL, '
                            '"onaylı suret" farklı bir hukuki kavramdır'
                        )
                        return True, warning, q_anchors, c_anchors, confidence_penalty, reason_code
                    else:
                        # Ambiguous match - "suret" could mean "onaylı suret"
                        confidence_penalty = 0.1
                        reason_code = PartialRelevanceReason.ANCHOR_AMBIGUITY_SURET.value
                        warning = (
                            '"suret" kelimesi bulundu ancak "fotokopi/kopya" ifadesi yok - '
                            '"onaylı suret" farklı bir kavram olabilir'
                        )
                        return True, warning, q_anchors, c_anchors, confidence_penalty, reason_code

            return True, None, q_anchors, c_anchors, 0.0, None

        # Different objects - this is a mismatch
        q_obj = list(q_anchors)[0].replace("_", " ") if q_anchors else "?"
        c_obj = list(c_anchors)[0].replace("_", " ") if c_anchors else "?"
        return False, f'Soru "{q_obj}" hakkında, chunk "{c_obj}" hakkında', q_anchors, c_anchors, 0.0, None

    def _check_action_match(
        self,
        question: str,
        quote: str
    ) -> Tuple[bool, Optional[str], Optional[str], Optional[str], bool, Optional[str], Optional[str]]:
        """Check if action in question matches action in quote

        DUAL-ACTION RULE:
        If question contains TWO actions (e.g., "bulundurmak ve asmak yeterli mi?"),
        and chunk covers ONLY ONE of them, return partial_relevance=True instead of
        immediate action_mismatch.

        Returns:
            (match, reason, q_action, qt_action, partial_relevance, partial_details, reason_code)
        """
        question_actions = self._extract_actions(question)
        quote_actions = self._extract_actions(quote)

        if not question_actions:
            return True, None, None, None, False, None, None

        question_normalized = set(a.normalized for a in question_actions)
        quote_normalized = set(a.normalized for a in quote_actions)

        conflicting_pairs = [
            ("keep", "hang"),
            ("rent", "sell"),
            ("export", "import"),
        ]

        # DUAL-ACTION CHECK: If question has 2+ actions from conflicting pairs
        # and chunk covers one of them, it's partial_relevance (not full mismatch)
        if len(question_normalized) >= 2:
            # Check if question has actions from a conflicting pair
            for pair in conflicting_pairs:
                pair_set = set(pair)
                question_pair_actions = question_normalized.intersection(pair_set)

                # Question has BOTH actions from a conflicting pair (e.g., "keep" AND "hang")
                if len(question_pair_actions) == 2:
                    # Check if chunk covers at least one
                    covered = quote_normalized.intersection(pair_set)
                    if len(covered) == 1:
                        # PARTIAL RELEVANCE: chunk covers only one action
                        covered_action = list(covered)[0]
                        missing_action = list(pair_set - covered)[0]
                        covered_verb = next((a.verb for a in quote_actions if a.normalized == covered_action), covered_action)
                        missing_verb = next((a.verb for a in question_actions if a.normalized == missing_action), missing_action)
                        return (
                            True,  # Not a full mismatch
                            None,
                            covered_verb,  # Return covered action for LLM context
                            missing_verb,  # Return missing action for LLM context
                            True,  # partial_relevance
                            f'Kaynak sadece "{covered_verb}" eylemi için hüküm içeriyor, "{missing_verb}" hakkında bilgi yok',
                            PartialRelevanceReason.DUAL_ACTION_ONLY_ONE_COVERED.value
                        )

        # Standard conflicting pair check (for single-action questions)
        for q_action in question_normalized:
            for qt_action in quote_normalized:
                for pair in conflicting_pairs:
                    if (q_action == pair[0] and qt_action == pair[1]) or \
                       (q_action == pair[1] and qt_action == pair[0]):
                        q_verb = next((a.verb for a in question_actions if a.normalized == q_action), q_action)
                        qt_verb = next((a.verb for a in quote_actions if a.normalized == qt_action), qt_action)
                        return False, f'"{q_verb}" ≠ "{qt_verb}"', q_verb, qt_verb, False, None, None

        if question_normalized and quote_normalized:
            if not question_normalized.intersection(quote_normalized):
                q_verb = question_actions[0].verb if question_actions else "?"
                qt_verb = quote_actions[0].verb if quote_actions else "?"
                return False, f'Soru "{q_verb}" hakkında, alıntı "{qt_verb}" hakkında', q_verb, qt_verb, False, None, None

        return True, None, None, None, False, None, None

    def _extract_question_modality(self, question: str) -> Modality:
        """Extract modality from question"""
        question_lower = question.lower()
        for modality, patterns in self.modality_question_patterns.items():
            for pattern in patterns:
                if re.search(pattern, question_lower, re.IGNORECASE):
                    return modality
        return Modality.UNKNOWN

    def _extract_answer_modality(self, answer: str) -> Tuple[Modality, Polarity]:
        """Extract modality and polarity from answer"""
        answer_lower = answer.lower()
        for (modality, polarity), patterns in self.modality_answer_patterns.items():
            for pattern in patterns:
                if re.search(pattern, answer_lower, re.IGNORECASE):
                    return modality, polarity
        return Modality.UNKNOWN, Polarity.NEUTRAL

    def _check_modality_alignment(self, question: str, answer: str) -> Tuple[bool, Optional[str]]:
        """Check if answer modality aligns with question modality"""
        q_modality = self._extract_question_modality(question)
        a_modality, _ = self._extract_answer_modality(answer)

        if q_modality == Modality.UNKNOWN or a_modality == Modality.UNKNOWN:
            return True, None

        if q_modality != a_modality:
            return False, f'Soru "{q_modality.value}" tipinde, cevap "{a_modality.value}" tipinde'

        return True, None

    async def _compute_similarity(self, text1: str, text2: str) -> float:
        """Compute semantic similarity with caching"""
        # Check cache first
        cached = await self._cache.get_similarity(text1, text2)
        if cached is not None:
            return cached

        if self._model is None or self._degraded_mode:
            stopwords = {"mi", "mu", "mü", "mı", "ve", "ile", "için", "de", "da", "bir", "bu", "ne"}
            words1 = set(w for w in text1.lower().split() if w not in stopwords and len(w) > 2)
            words2 = set(w for w in text2.lower().split() if w not in stopwords and len(w) > 2)
            if not words1 or not words2:
                return 0.0
            intersection = words1 & words2
            union = words1 | words2
            score = len(intersection) / len(union)
        else:
            try:
                embeddings = self._model.encode([text1, text2])
                from numpy import dot
                from numpy.linalg import norm
                score = float(dot(embeddings[0], embeddings[1]) / (norm(embeddings[0]) * norm(embeddings[1])))
            except Exception as e:
                logger.error(f"Similarity computation failed: {e}")
                score = 0.0

        # Cache the result
        await self._cache.set_similarity(text1, text2, score)
        return score

    def _check_forbidden_patterns(self, text: str) -> Tuple[bool, Optional[str]]:
        """Check if text contains forbidden patterns"""
        for pattern, description in self.forbidden_patterns:
            if re.search(pattern, text, re.IGNORECASE | re.MULTILINE):
                return True, description
        return False, None

    def _check_verdict_sentence(self, text: str) -> Tuple[bool, Optional[str]]:
        """Check if text contains a verdict sentence"""
        for pattern in self.verdict_patterns:
            match = re.search(rf"[^.]*{pattern}[^.]*\.", text, re.IGNORECASE)
            if match:
                return True, match.group(0).strip()
        return False, None

    # Source indicators that suggest quote is from real legal source, not system message
    SOURCE_INDICATORS = [
        r"\bvuk\b", r"\bttk\b", r"\btmk\b", r"\btbk\b",  # Kanun kısaltmaları
        r"\bmadde\s*\d+", r"\bmd\.\s*\d+",  # Madde referansları
        r"\btebliğ\b", r"\bözelge\b", r"\bgenelge\b",  # Düzenleme tipleri
        r"\bdanıştay\b", r"\byargıtay\b",  # Yüksek mahkemeler
        r"\bkarar\s*(no|sayı)", r"\besas\s*(no|sayı)",  # Karar referansları
        r"\btarih(li|inde)?\s*\d{1,2}[./]\d{1,2}[./]\d{2,4}",  # Tarih referansları
        r"\bgib\b", r"\bgelir\s+idaresi\b",  # Kurumlar
        r"\bsayılı\s+(kanun|yasa|tebliğ)",  # Sayılı mevzuat
        r"\bfıkra\b", r"\bbent\b",  # Mevzuat alt birimleri
    ]

    def _check_quote_is_system_message(self, quote: str) -> Tuple[bool, Optional[str]]:
        """Check if quote contains a system/fail-closed message instead of real source text

        CRITICAL: ALINTI must be verbatim text from source, NOT a system-generated message.
        This catches cases where LLM outputs fail-closed text as if it were a quote.

        FALSE POSITIVE PROTECTION:
        - If quote contains source indicators (VUK, tebliğ, madde X, etc.), it's likely real
        - System messages typically don't have legal source references

        Example bad ALINTI:
        "Bu konuda kesin bir hüküm cümlesi bulunamadı, ancak ilgili kaynak incelenebilir."

        This is NOT a real quote - it's a system message disguised as a quote.

        Returns:
            (is_system_message, description) - True if quote looks like system message
        """
        quote_lower = quote.lower()

        # FALSE POSITIVE PROTECTION: Check for source indicators first
        # If quote has legal source references, it's probably a real quote
        has_source_indicator = any(
            re.search(pattern, quote_lower, re.IGNORECASE)
            for pattern in self.SOURCE_INDICATORS
        )

        if has_source_indicator:
            # Quote has source indicators - likely a real legal quote, not system message
            return False, None

        # Check for system message patterns
        for pattern, description in self.system_message_patterns:
            if re.search(pattern, quote_lower, re.IGNORECASE):
                return True, f"ALINTI sistem mesajı içeriyor: {description}"

        return False, None

    def _verify_verbatim_quote(self, quote: str, source_text: str, strict: bool = True) -> Tuple[bool, Optional[str]]:
        """Verify that a quote exists VERBATIM in source text

        CRITICAL: ALINTI is legal evidence - must be EXACT substring match.
        Tolerance-based matching is DISABLED for quote verification.

        Args:
            quote: The quoted text to verify (ALINTI content)
            source_text: The source chunk text (MUST be exact chunk sent to LLM)
            strict: If True, require exact match (default). If False, allow tolerance.

        Returns:
            (is_verbatim, reason)
        """
        if not quote or not source_text:
            return False, "Boş alıntı veya kaynak"

        # Use unified normalize function
        quote_norm = self._normalize_text(quote)
        source_norm = self._normalize_text(source_text)

        # PRIMARY CHECK: Exact substring match (REQUIRED for strict mode)
        if quote_norm in source_norm:
            return True, None

        # STRICT MODE (default): No tolerance for ALINTI - it's legal evidence
        if strict:
            # Use longest-first matching for verdict tokens
            quote_strong, quote_weak = self._find_verdict_tokens(quote)
            source_strong, source_weak = self._find_verdict_tokens(source_text)

            quote_verdicts = quote_strong + quote_weak
            source_verdicts = source_strong + source_weak

            if quote_verdicts:
                # Check if these EXACT verdict tokens exist in source
                missing_verdicts = set(quote_verdicts) - set(source_verdicts)
                if missing_verdicts:
                    # Identify if missing tokens are STRONG (more critical)
                    missing_strong = [v for v in missing_verdicts if v in self.STRONG_VERDICT_TOKENS]
                    if missing_strong:
                        return False, f"KRİTİK: Alıntıdaki zorunluluk ifadesi kaynak metinde yok: {missing_strong}"
                    return False, f"Alıntıdaki hüküm kelimesi kaynak metinde yok: {list(missing_verdicts)}"

            return False, "Alıntı kaynak metinde birebir bulunamadı"

        # NON-STRICT MODE: Use tolerance (only for internal extraction, NOT for ALINTI validation)
        quote_words = quote_norm.split()
        if len(quote_words) < 5:
            return False, "Kısa alıntı kaynak metinde bulunamadı"

        source_words = source_norm.split()
        window_size = len(quote_words)
        tolerance = self._verbatim_tolerance

        best_overlap = 0.0
        for i in range(len(source_words) - window_size + 1):
            window = source_words[i:i + window_size]
            overlap = len(set(quote_words) & set(window)) / len(quote_words)
            best_overlap = max(best_overlap, overlap)
            if overlap >= tolerance:
                return True, None

        return False, f"Alıntı kaynak metinde bulunamadı (benzerlik: {best_overlap:.0%})"

    def _check_sequence_match(self, quote_words: List[str], source_words: List[str], max_gap: int = 3) -> bool:
        """Check if quote words appear in sequence in source (with allowed gaps)"""
        if not quote_words:
            return False

        # Find starting positions for first quote word
        first_word = quote_words[0]
        start_positions = [i for i, w in enumerate(source_words) if w == first_word]

        for start_pos in start_positions:
            matched = 1
            last_match_pos = start_pos

            for q_word in quote_words[1:]:
                # Look for this word within max_gap positions from last match
                found = False
                for offset in range(1, max_gap + 1):
                    check_pos = last_match_pos + offset
                    if check_pos < len(source_words) and source_words[check_pos] == q_word:
                        matched += 1
                        last_match_pos = check_pos
                        found = True
                        break
                if not found:
                    break

            # If we matched most words (80%+), consider it a match
            if matched / len(quote_words) >= 0.8:
                return True

        return False

    def _check_modality_inference(
        self,
        question: str,
        source_text: str,
        answer: str
    ) -> Tuple[bool, Optional[str]]:
        """Check if answer infers obligation from possibility (FORBIDDEN)

        CRITICAL RULE:
        - If question is STRONG family (zorunlu/gerekli/yeterli) and source only has WEAK verdicts,
          answering with STRONG obligation verdict is INVALID inference.

        EXCEPTION:
        - If question is WEAK family (mümkün/uygun),
          WEAK tokens ARE definitive for that modality → allow definitive answer.

        STRONG family: ZORUNLU, GEREKLI, YETERLI (obligation-related)
        WEAK family: MUMKUN, UYGUN (possibility-related)

        Returns:
            (is_valid, reason) - False if invalid inference detected
        """
        q_modality = self._extract_question_modality(question)

        # EXCEPTION: If question is WEAK family (mümkün mü? / uygun mu?),
        # WEAK tokens ARE definitive for that modality - no inference check needed
        if Modality.is_weak(q_modality):
            return True, None

        # Only enforce strict check when question is STRONG family
        if not Modality.is_strong(q_modality):
            return True, None

        # Use longest-first matching
        source_strong, source_weak = self._find_verdict_tokens(source_text)
        answer_strong, _ = self._find_verdict_tokens(answer)

        # INVALID: Question is STRONG family, source only has WEAK tokens,
        # but answer claims STRONG obligation
        if answer_strong and source_weak and not source_strong:
            return False, f"'{source_weak}' içeren kaynaktan '{answer_strong}' çıkarımı yapılamaz"

        return True, None

    async def analyze_chunks(
        self,
        question: str,
        chunks: List[Dict],
        min_relevance: float = 0.3
    ) -> List[ChunkAnalysis]:
        """Analyze multiple chunks with hybrid decision making

        Score breakdown:
        - base_score: Starts at 1.0, penalties applied for issues
        - bonus: Applied ONLY when object anchor matches
        - confidence: base_score + bonus (legacy field, may exceed 1.0)
        """
        await self.initialize()

        results = []

        for idx, chunk in enumerate(chunks):
            chunk_id = chunk.get("id", str(idx))
            chunk_text = chunk.get("text", "")

            # Check cache
            cached = await self._cache.get_analysis(question, chunk_text)
            if cached:
                results.append(ChunkAnalysis(**cached))
                continue

            issues = []
            base_score = 1.0  # Core quality score (0-1)
            bonus = 0.0  # Extra points for matching modality with anchor
            partial_relevance_reason_code = None  # Telemetry reason code

            # 1. ACTION MATCH (with dual-action partial relevance check)
            action_match, action_reason, covered_action, missing_action, partial_relevance, partial_details, action_reason_code = self._check_action_match(question, chunk_text)
            if not action_match:
                issues.append(f"action_mismatch: {action_reason}")
                base_score -= 0.5
            elif partial_relevance:
                # PARTIAL RELEVANCE: chunk covers one action of a dual-action question
                partial_relevance_reason_code = action_reason_code

                # DYNAMIC PENALTY: Check if chunk has STRONG verdict + correct anchor
                # before deciding penalty severity
                chunk_strong, chunk_weak = self._find_verdict_tokens(chunk_text)
                _, _, q_anchors_temp, c_anchors_temp, _, _ = self._check_object_anchor_match(question, chunk_text)
                anchor_match_ok = bool(q_anchors_temp.intersection(c_anchors_temp)) if q_anchors_temp else True

                if chunk_strong and anchor_match_ok:
                    # Chunk has STRONG verdict + correct anchor: smaller penalty
                    base_score -= 0.1
                    issues.append(f"partial_relevance: {partial_details} [STRONG verdict bulundu]")
                elif chunk_weak or not anchor_match_ok:
                    # Chunk has WEAK verdict or weak anchor: larger penalty
                    base_score -= 0.25
                    issues.append(f"partial_relevance: {partial_details} [verdict zayıf veya anchor zayıf]")
                else:
                    # Default penalty
                    base_score -= 0.15
                    issues.append(f"partial_relevance: {partial_details}")

            # 2. OBJECT ANCHOR MATCH (with suret ambiguity check)
            object_anchor_match, anchor_reason, q_anchors, c_anchors, anchor_penalty, anchor_reason_code = self._check_object_anchor_match(question, chunk_text)
            if not object_anchor_match:
                issues.append(f"object_mismatch: {anchor_reason}")
                base_score -= 0.3
            elif anchor_penalty > 0:
                # Ambiguous anchor match (e.g., "suret" without "fotokopi/kopya")
                if anchor_reason_code:
                    partial_relevance_reason_code = anchor_reason_code
                issues.append(f"anchor_ambiguity: {anchor_reason}")
                base_score -= anchor_penalty

            # 3. MODALITY ALIGNMENT
            has_verdict, verdict = self._check_verdict_sentence(chunk_text)
            modality_match = True
            modality_details = None
            if has_verdict and verdict:
                modality_match, modality_details = self._check_modality_alignment(question, verdict)
                if not modality_match:
                    issues.append(f"modality_mismatch: {modality_details}")
                    base_score -= 0.4

            # 4. FORBIDDEN PATTERNS
            has_forbidden, forbidden_desc = self._check_forbidden_patterns(chunk_text)
            if has_forbidden:
                issues.append(f"forbidden_pattern: {forbidden_desc}")
                base_score -= 0.3

            # 5. VERDICT SENTENCE
            if not has_verdict:
                issues.append("no_verdict_sentence")
                base_score -= 0.2

            # 6. SIMILARITY
            relevance = await self._compute_similarity(question, chunk_text)
            if relevance < min_relevance:
                issues.append(f"low_relevance: {relevance:.2f}")
                base_score -= 0.1

            # 7. OBLIGATION PATTERN BONUS (only with anchor match!)
            # For "zorunlu mu?" questions, prioritize chunks with obligation verdicts
            # BUT only if object anchor also matches
            q_modality = self._extract_question_modality(question)
            if q_modality == Modality.ZORUNLU and object_anchor_match and action_match:
                # Check if chunk contains obligation patterns
                obligation_patterns = [
                    r"zorunludur", r"zorunlu\s+değildir", r"zorunlu\s+bulunmamaktadır",
                    r"yeterlidir", r"yeterli\s+değildir",
                    r"gerekmektedir", r"gerekmemektedir", r"gerekmez",
                    r"mecburidir", r"mecburi\s+değildir",
                ]
                chunk_lower = chunk_text.lower()
                for pattern in obligation_patterns:
                    if re.search(pattern, chunk_lower, re.IGNORECASE):
                        bonus = 0.3  # Significant bonus for matching modality
                        break

            # Clamp base_score to 0-1 range
            base_score = max(0.0, min(1.0, base_score))

            # Final confidence = base + bonus (may exceed 1.0, that's OK per user requirement)
            confidence = base_score + bonus

            has_drift = not action_match
            drift_reason = action_reason

            recommended = (
                action_match and
                object_anchor_match and  # NEW: require anchor match
                modality_match and
                not has_forbidden and
                has_verdict and
                relevance >= min_relevance * 0.7
            )

            analysis = ChunkAnalysis(
                chunk_id=chunk_id,
                relevance_score=relevance,
                action_match=action_match,
                action_details=action_reason,
                modality_match=modality_match,
                modality_details=modality_details,
                has_drift=has_drift,
                drift_reason=drift_reason,
                has_forbidden_pattern=has_forbidden,
                forbidden_pattern=forbidden_desc,
                has_verdict_sentence=has_verdict,
                verdict_sentence=verdict,
                object_anchor_match=object_anchor_match,
                object_anchor_details=anchor_reason,
                partial_relevance=partial_relevance,
                partial_relevance_details=partial_details,
                partial_relevance_reason_code=partial_relevance_reason_code,
                issues=issues,
                recommended=recommended,
                base_score=base_score,
                bonus=bonus,
                confidence=max(0.0, confidence)
            )

            # Cache the analysis
            await self._cache.set_analysis(question, chunk_text, analysis.to_dict())
            results.append(analysis)

        results.sort(key=lambda x: (-x.confidence, -x.relevance_score))
        return results

    async def validate_quote(
        self,
        question: str,
        quote: str,
        answer: str,
        source_text: Optional[str] = None  # NEW: source text for verbatim verification
    ) -> QuoteValidation:
        """Validate a quote and answer combination

        Args:
            question: The user's question
            quote: The quoted text (ALINTI)
            answer: The generated answer (CEVAP)
            source_text: Optional source chunk text for verbatim verification
        """
        await self.initialize()

        issues = []
        fail_reasons = []
        confidence = 1.0

        # 0. SYSTEM MESSAGE CHECK (CRITICAL - must be first)
        # Detects when ALINTI contains fail-closed message instead of real source text
        is_system_msg, system_msg_reason = self._check_quote_is_system_message(quote)
        if is_system_msg:
            issues.append({
                "type": AnalysisIssue.QUOTE_IS_SYSTEM_MESSAGE.value,
                "description": system_msg_reason,
                "severity": "critical"
            })
            fail_reasons.append(self.fail_messages["quote_is_system_message"])
            confidence -= 0.7  # Critical penalty - this is NOT a valid quote

        # 1. VERBATIM QUOTE VERIFICATION (CRITICAL)
        if source_text and not is_system_msg:  # Skip if already flagged as system message
            is_verbatim, verbatim_reason = self._verify_verbatim_quote(quote, source_text)
            if not is_verbatim:
                issues.append({
                    "type": AnalysisIssue.QUOTE_NOT_VERBATIM.value,
                    "description": verbatim_reason,
                    "severity": "critical"
                })
                fail_reasons.append(self.fail_messages["quote_not_verbatim"])
                confidence -= 0.6  # Critical penalty for non-verbatim quote

        # 2. MODALITY INFERENCE CHECK (CRITICAL)
        if source_text:
            is_valid_inference, inference_reason = self._check_modality_inference(question, source_text, answer)
            if not is_valid_inference:
                issues.append({
                    "type": AnalysisIssue.MODALITY_INFERENCE.value,
                    "description": inference_reason,
                    "severity": "critical"
                })
                fail_reasons.append(self.fail_messages["modality_inference"])
                confidence -= 0.5  # Critical penalty for invalid inference

        # 3. ACTION MATCH (with dual-action partial relevance check)
        action_match, action_reason, covered_action, missing_action, partial_relevance, partial_details, reason_code = self._check_action_match(question, quote)
        if not action_match:
            issues.append({"type": AnalysisIssue.ACTION_MISMATCH.value, "description": action_reason, "severity": "critical"})
            fail_reasons.append(self.fail_messages["action_mismatch"].format(question_action=covered_action or "?", quote_action=missing_action or "?"))
            confidence -= 0.5
        elif partial_relevance:
            # PARTIAL RELEVANCE: quote covers one action of dual-action question
            # Less severe than mismatch - still valid but with warning
            issues.append({
                "type": "partial_relevance",
                "description": partial_details,
                "severity": "medium",
                "reason_code": reason_code,
                "covers_action": covered_action,
                "missing_action": missing_action
            })
            confidence -= 0.15  # Smaller penalty

        # 4. MODALITY ALIGNMENT
        modality_match, modality_reason = self._check_modality_alignment(question, answer)
        if not modality_match:
            q_mod = self._extract_question_modality(question)
            a_mod, _ = self._extract_answer_modality(answer)
            issues.append({"type": AnalysisIssue.MODALITY_MISMATCH.value, "description": modality_reason, "severity": "critical"})
            fail_reasons.append(self.fail_messages["modality_mismatch"].format(question_modality=q_mod.value, answer_modality=a_mod.value))
            confidence -= 0.4

        # 5. FORBIDDEN PATTERNS
        has_forbidden, forbidden_desc = self._check_forbidden_patterns(quote)
        if has_forbidden:
            issues.append({"type": AnalysisIssue.FORBIDDEN_PATTERN.value, "description": forbidden_desc, "severity": "high"})
            fail_reasons.append(self.fail_messages["forbidden_pattern"])
            confidence -= 0.3

        # 6. VERDICT SENTENCE
        has_verdict, _ = self._check_verdict_sentence(quote)
        if not has_verdict:
            issues.append({"type": AnalysisIssue.NO_VERDICT_SENTENCE.value, "description": "Alıntıda hüküm cümlesi bulunamadı", "severity": "medium"})
            fail_reasons.append(self.fail_messages["no_verdict"])
            confidence -= 0.2

        suggested_answer = None
        suggested_quote = None  # NEW: steril ALINTI replacement

        if issues:
            # Priority: system_message > verbatim > inference > action > modality > forbidden > verdict
            if any(i["type"] == AnalysisIssue.QUOTE_IS_SYSTEM_MESSAGE.value for i in issues):
                suggested_answer = self.fail_messages["quote_is_system_message"]
                # STERIL ALINTI: Replace fake quote with proper non-quote message
                suggested_quote = "—"  # UI should show this as "no quote available"
            elif any(i["type"] == AnalysisIssue.QUOTE_NOT_VERBATIM.value for i in issues):
                suggested_answer = self.fail_messages["quote_not_verbatim"]
            elif any(i["type"] == AnalysisIssue.MODALITY_INFERENCE.value for i in issues):
                suggested_answer = self.fail_messages["modality_inference"]
            elif any(i["type"] == AnalysisIssue.ACTION_MISMATCH.value for i in issues):
                suggested_answer = fail_reasons[0] if fail_reasons else self.fail_messages["generic"]
            elif any(i["type"] == AnalysisIssue.MODALITY_MISMATCH.value for i in issues):
                suggested_answer = next((r for r in fail_reasons if "modalite" in r.lower()), self.fail_messages["no_verdict"])
            elif any(i["type"] == AnalysisIssue.FORBIDDEN_PATTERN.value for i in issues):
                suggested_answer = self.fail_messages["forbidden_pattern"]
            else:
                suggested_answer = self.fail_messages["generic"]

        return QuoteValidation(
            valid=len(issues) == 0,
            issues=issues,
            suggested_answer=suggested_answer,
            suggested_quote=suggested_quote,  # NEW: steril ALINTI for system message cases
            confidence=max(0.0, confidence),
            fail_reasons=fail_reasons,
            config_version=self._config_version  # Track which config was used
        )

    async def filter_chunks_for_llm(
        self,
        question: str,
        chunks: List[Dict],
        max_chunks: int = 5,
        min_relevance: float = 0.3
    ) -> Dict:
        """Filter and rank chunks before sending to LLM"""
        analyses = await self.analyze_chunks(question, chunks, min_relevance)

        recommended = [a for a in analyses if a.recommended]

        if not recommended and analyses:
            best = analyses[0]
            return {
                "chunks": [chunks[0]] if chunks else [],
                "analysis": {
                    "total_analyzed": len(chunks),
                    "recommended_count": 0,
                    "best_available": {"confidence": best.confidence, "issues": best.issues},
                    "warning": self.fail_messages["generic"]
                },
                "action": "use_with_caution"
            }

        filtered_indices = []
        for a in recommended[:max_chunks]:
            try:
                idx = int(a.chunk_id)
                if idx < len(chunks):
                    filtered_indices.append(idx)
            except ValueError:
                continue

        filtered_chunks = [chunks[i] for i in filtered_indices]

        return {
            "chunks": filtered_chunks,
            "analysis": {
                "total_analyzed": len(chunks),
                "recommended_count": len(recommended),
                "top_confidence": recommended[0].confidence if recommended else 0,
                "all_action_match": all(a.action_match for a in recommended[:max_chunks]),
                "all_modality_match": all(a.modality_match for a in recommended[:max_chunks])
            },
            "action": "proceed"
        }

    def get_status(self) -> Dict:
        """Get analyzer status including config version"""
        return {
            "initialized": self._initialized,
            "degraded_mode": self._degraded_mode,
            "model": self.model_name if not self._degraded_mode else "fallback",
            "cache_connected": self._cache._connected,
            "init_time": self._init_time,
            "config_version": self._config_version,
            "config_timestamp": self._config_timestamp,
        }

    def validate_source_text(self, source_text: Optional[str], chunk_sent_to_llm: str) -> Tuple[bool, Optional[str]]:
        """Validate that source_text matches the chunk sent to LLM

        Uses fuzzy matching to handle:
        - HTML cleaning differences
        - Whitespace normalization differences
        - Truncation in pipeline

        Args:
            source_text: The source_text parameter passed to validate_quote
            chunk_sent_to_llm: The actual chunk text that was sent to the LLM

        Returns:
            (is_valid, warning_message)

        Usage in integration:
            # In RAG service, before calling validate_quote:
            is_valid, warning = semantic_analyzer.validate_source_text(
                source_text=source_text_param,
                chunk_sent_to_llm=chunk_for_llm
            )
            if not is_valid:
                logger.warning(f"source_text mismatch: {warning}")
        """
        if not source_text:
            return False, "source_text is required for verbatim verification"

        if not chunk_sent_to_llm:
            return False, "chunk_sent_to_llm is empty"

        # Normalize both for comparison
        source_norm = self._normalize_text(source_text)
        chunk_norm = self._normalize_text(chunk_sent_to_llm)

        # 1. EXACT MATCH (ideal case)
        if source_norm == chunk_norm:
            return True, None

        # 2. HASH MATCH (same content, different formatting)
        source_hash = hashlib.md5(source_norm.encode()).hexdigest()
        chunk_hash = hashlib.md5(chunk_norm.encode()).hexdigest()
        if source_hash == chunk_hash:
            return True, None

        # 3. SUBSTRING MATCH (source is subset of chunk - common with metadata)
        if source_norm in chunk_norm:
            return True, "source_text is subset of chunk (acceptable)"

        # 4. PREFIX MATCH (truncation case - chunk was truncated)
        min_len = min(len(source_norm), len(chunk_norm))
        if min_len > 50:  # Only check prefix if texts are substantial
            prefix_match_ratio = sum(1 for a, b in zip(source_norm[:min_len], chunk_norm[:min_len]) if a == b) / min_len
            if prefix_match_ratio >= 0.9:  # 90% prefix match
                return True, f"prefix match ({prefix_match_ratio:.0%}) - likely truncation difference"

        # 5. LENGTH SIMILARITY + WORD OVERLAP (FAIL-CLOSED: return warning, not valid)
        # This stage is too loose - could validate wrong chunks
        # Return valid=False but with informative warning for debugging
        source_words = set(source_norm.split())
        chunk_words = set(chunk_norm.split())
        if source_words and chunk_words:
            word_overlap = len(source_words & chunk_words) / max(len(source_words), len(chunk_words))
            len_ratio = min(len(source_norm), len(chunk_norm)) / max(len(source_norm), len(chunk_norm))

            # High similarity but not exact - WARN but don't validate
            if word_overlap >= 0.85 and len_ratio >= 0.8:
                return False, f"FUZZY_MATCH_WARNING: High similarity (words: {word_overlap:.0%}, length: {len_ratio:.0%}) but not exact - verbatim check may be unreliable"

        # Significant mismatch - definitely fail
        len_diff = abs(len(source_norm) - len(chunk_norm))
        return False, f"source_text differs from chunk (length diff: {len_diff} chars) - verbatim verification unreliable"

    def get_verdict_token_category(self, text: str) -> Tuple[List[str], List[str]]:
        """Get categorized verdict tokens found in text

        Uses longest-first matching to prevent overlapping matches
        (e.g., "zorunlu değildir" won't also match "zorunlu")

        Returns:
            (strong_tokens, weak_tokens) - Lists of found tokens in each category

        Useful for debugging and understanding what verdict types are in a text.
        """
        return self._find_verdict_tokens(text)


# Singleton instance
semantic_analyzer = SemanticAnalyzerService()
