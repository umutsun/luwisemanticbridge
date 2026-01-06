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
from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass, field, asdict
from enum import Enum
import time

from loguru import logger


# === CONFIGURATION ===
ANALYZER_TIMEOUT = float(os.getenv("SEMANTIC_ANALYZER_TIMEOUT", "5.0"))
DEGRADED_MODE_ENABLED = os.getenv("SEMANTIC_ANALYZER_DEGRADED", "true").lower() == "true"
CACHE_TTL = int(os.getenv("SEMANTIC_CACHE_TTL", "300"))  # 5 minutes
CACHE_PREFIX = "semantic_analyzer"


class AnalysisIssue(Enum):
    """Types of issues that can be detected"""
    FORBIDDEN_PATTERN = "forbidden_pattern"
    SEMANTIC_DRIFT = "semantic_drift"
    ACTION_MISMATCH = "action_mismatch"
    MODALITY_MISMATCH = "modality_mismatch"
    NO_VERDICT_SENTENCE = "no_verdict_sentence"
    LOW_RELEVANCE = "low_relevance"


class Modality(Enum):
    """Question/Answer modality types"""
    ZORUNLU = "zorunlu"
    MUMKUN = "mumkun"
    UYGUN = "uygun"
    GEREKLI = "gerekli"
    UNKNOWN = "unknown"


class Polarity(Enum):
    """Answer polarity"""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


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
    """Validation result for a quote"""
    valid: bool
    issues: List[Dict[str, str]]
    suggested_answer: Optional[str]
    confidence: float
    fail_reasons: List[str] = field(default_factory=list)

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
        }

        # === MODALITY PATTERNS ===
        self.modality_question_patterns = {
            Modality.ZORUNLU: [
                r"zorunlu\s*(mu|mudur|mıdır|mı)",
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
                r"lazım\s*(mı|mıdır)",
            ],
        }

        self.modality_answer_patterns = {
            (Modality.ZORUNLU, Polarity.POSITIVE): [r"zorunludur", r"mecburidir"],
            (Modality.ZORUNLU, Polarity.NEGATIVE): [r"zorunlu\s+değildir", r"mecburi\s+değildir"],
            (Modality.MUMKUN, Polarity.POSITIVE): [r"mümkündür", r"yapılabilir"],
            (Modality.MUMKUN, Polarity.NEGATIVE): [r"mümkün\s+değildir", r"yapılamaz"],
            (Modality.UYGUN, Polarity.POSITIVE): [r"uygundur"],
            (Modality.UYGUN, Polarity.NEGATIVE): [r"uygun\s+değildir"],
            (Modality.GEREKLI, Polarity.POSITIVE): [r"gerekmektedir", r"gereklidir"],
            (Modality.GEREKLI, Polarity.NEGATIVE): [r"gerekmemektedir", r"gerekmez"],
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
        self.fail_messages = {
            "action_mismatch": "Mevcut kaynak farklı bir eylemi ({quote_action}) ele alıyor. "
                              "Sorulan eylem ({question_action}) hakkında doğrudan hüküm bulunamadı.",
            "modality_mismatch": "Sorulan '{question_modality}' için cevap '{answer_modality}' "
                                 "türünde verilmiş. Doğru modalite eşleşmesi bulunamadı.",
            "forbidden_pattern": "Bu alıntı soru başlığı/giriş paragrafıdır, hüküm değildir.",
            "no_verdict": "Bu konuda açık hüküm cümlesi bulunamadı.",
            "generic": "Bu konuda kesin bir hüküm cümlesi bulunamadı.",
        }

    async def initialize(self):
        """Initialize with timeout and degraded mode"""
        if self._initialized:
            return

        start = time.time()

        # Connect to Redis cache
        await self._cache.connect()

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

    def _extract_object_anchors(self, text: str) -> Set[str]:
        """Extract object/keyword anchors from text

        Returns normalized anchor names (e.g., "vergi_levhası", "fatura")
        """
        text_lower = text.lower()
        found_anchors = set()

        for anchor_name, keywords in self.object_anchors.items():
            for keyword in keywords:
                # Case-insensitive search for keyword
                if keyword.lower() in text_lower:
                    found_anchors.add(anchor_name)
                    break  # Found one match for this anchor, move to next

        return found_anchors

    def _check_object_anchor_match(self, question: str, chunk: str) -> Tuple[bool, Optional[str], Set[str], Set[str]]:
        """Check if object anchors in question match chunk

        Returns: (match, reason, question_anchors, chunk_anchors)
        """
        q_anchors = self._extract_object_anchors(question)
        c_anchors = self._extract_object_anchors(chunk)

        # If question has no specific object, consider it a match
        if not q_anchors:
            return True, None, q_anchors, c_anchors

        # If chunk has no objects but question does, it's uncertain (not a mismatch)
        if not c_anchors:
            return True, "Chunk'ta nesne belirtilmemiş", q_anchors, c_anchors

        # Check for intersection
        common = q_anchors.intersection(c_anchors)
        if common:
            return True, None, q_anchors, c_anchors

        # Different objects - this is a mismatch
        q_obj = list(q_anchors)[0].replace("_", " ") if q_anchors else "?"
        c_obj = list(c_anchors)[0].replace("_", " ") if c_anchors else "?"
        return False, f'Soru "{q_obj}" hakkında, chunk "{c_obj}" hakkında', q_anchors, c_anchors

    def _check_action_match(self, question: str, quote: str) -> Tuple[bool, Optional[str], Optional[str], Optional[str]]:
        """Check if action in question matches action in quote"""
        question_actions = self._extract_actions(question)
        quote_actions = self._extract_actions(quote)

        if not question_actions:
            return True, None, None, None

        question_normalized = set(a.normalized for a in question_actions)
        quote_normalized = set(a.normalized for a in quote_actions)

        conflicting_pairs = [
            ("keep", "hang"),
            ("rent", "sell"),
            ("export", "import"),
        ]

        for q_action in question_normalized:
            for qt_action in quote_normalized:
                for pair in conflicting_pairs:
                    if (q_action == pair[0] and qt_action == pair[1]) or \
                       (q_action == pair[1] and qt_action == pair[0]):
                        q_verb = next((a.verb for a in question_actions if a.normalized == q_action), q_action)
                        qt_verb = next((a.verb for a in quote_actions if a.normalized == qt_action), qt_action)
                        return False, f'"{q_verb}" ≠ "{qt_verb}"', q_verb, qt_verb

        if question_normalized and quote_normalized:
            if not question_normalized.intersection(quote_normalized):
                q_verb = question_actions[0].verb if question_actions else "?"
                qt_verb = quote_actions[0].verb if quote_actions else "?"
                return False, f'Soru "{q_verb}" hakkında, alıntı "{qt_verb}" hakkında', q_verb, qt_verb

        return True, None, None, None

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

            # 1. ACTION MATCH
            action_match, action_reason, q_action, qt_action = self._check_action_match(question, chunk_text)
            if not action_match:
                issues.append(f"action_mismatch: {action_reason}")
                base_score -= 0.5

            # 2. OBJECT ANCHOR MATCH (NEW)
            object_anchor_match, anchor_reason, q_anchors, c_anchors = self._check_object_anchor_match(question, chunk_text)
            if not object_anchor_match:
                issues.append(f"object_mismatch: {anchor_reason}")
                base_score -= 0.3

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
        answer: str
    ) -> QuoteValidation:
        """Validate a quote and answer combination"""
        await self.initialize()

        issues = []
        fail_reasons = []
        confidence = 1.0

        # 1. ACTION MATCH
        action_match, action_reason, q_action, qt_action = self._check_action_match(question, quote)
        if not action_match:
            issues.append({"type": AnalysisIssue.ACTION_MISMATCH.value, "description": action_reason, "severity": "critical"})
            fail_reasons.append(self.fail_messages["action_mismatch"].format(question_action=q_action or "?", quote_action=qt_action or "?"))
            confidence -= 0.5

        # 2. MODALITY ALIGNMENT
        modality_match, modality_reason = self._check_modality_alignment(question, answer)
        if not modality_match:
            q_mod = self._extract_question_modality(question)
            a_mod, _ = self._extract_answer_modality(answer)
            issues.append({"type": AnalysisIssue.MODALITY_MISMATCH.value, "description": modality_reason, "severity": "critical"})
            fail_reasons.append(self.fail_messages["modality_mismatch"].format(question_modality=q_mod.value, answer_modality=a_mod.value))
            confidence -= 0.4

        # 3. FORBIDDEN PATTERNS
        has_forbidden, forbidden_desc = self._check_forbidden_patterns(quote)
        if has_forbidden:
            issues.append({"type": AnalysisIssue.FORBIDDEN_PATTERN.value, "description": forbidden_desc, "severity": "high"})
            fail_reasons.append(self.fail_messages["forbidden_pattern"])
            confidence -= 0.3

        # 4. VERDICT SENTENCE
        has_verdict, _ = self._check_verdict_sentence(quote)
        if not has_verdict:
            issues.append({"type": AnalysisIssue.NO_VERDICT_SENTENCE.value, "description": "Alıntıda hüküm cümlesi bulunamadı", "severity": "medium"})
            fail_reasons.append(self.fail_messages["no_verdict"])
            confidence -= 0.2

        suggested_answer = None
        if issues:
            if any(i["type"] == AnalysisIssue.ACTION_MISMATCH.value for i in issues):
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
            confidence=max(0.0, confidence),
            fail_reasons=fail_reasons
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
        """Get analyzer status"""
        return {
            "initialized": self._initialized,
            "degraded_mode": self._degraded_mode,
            "model": self.model_name if not self._degraded_mode else "fallback",
            "cache_connected": self._cache._connected,
            "init_time": self._init_time,
        }


# Singleton instance
semantic_analyzer = SemanticAnalyzerService()
