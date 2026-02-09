"""
RAG Pipeline Microservice - v12.44
Orchestrates the full RAG pipeline as middleware chain.

Pipeline Steps:
  1. QueryAnalyzer    - Domain detection, article detection, rate question
  2. SemanticRetriever - Embedding + vector search + hybrid scoring
  3. JinaReranker      - Optional semantic re-scoring via Jina API
  4. DomainFilter      - Cross-domain source filtering (P0)
  5. SourceRanker      - Hierarchy scoring, diversification, threshold
  6. EvidenceGate      - Quality check before LLM call
  7. ResponseValidator - Post-LLM citation/escape/summary fixes (P1-P3)

Each step is independent, testable, and can be toggled via config.
"""

import time
import re
import hashlib
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from loguru import logger

from services.database import get_db
from services.redis_client import cache_get, cache_set


# ═══════════════════════════════════════════════════════════════════════════
# PIPELINE CONTEXT - Shared state passed through all steps
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class PipelineContext:
    """Shared context object flowing through all pipeline steps."""
    # Input
    query: str
    conversation_id: Optional[str] = None
    user_id: str = "demo-user"
    language: str = "tr"

    # Query analysis results
    query_domain: Optional[str] = None
    query_domain_keywords: List[str] = field(default_factory=list)
    article_query: Optional[Dict[str, Any]] = None
    is_rate_question: bool = False
    rate_law_code: Optional[str] = None
    is_follow_up: bool = False
    follow_up_law_code: Optional[str] = None

    # Search results
    raw_results: List[Dict[str, Any]] = field(default_factory=list)
    reranked_results: List[Dict[str, Any]] = field(default_factory=list)
    filtered_results: List[Dict[str, Any]] = field(default_factory=list)
    ranked_results: List[Dict[str, Any]] = field(default_factory=list)

    # LLM response
    llm_response: Optional[str] = None
    final_response: Optional[str] = None
    final_sources: List[Dict[str, Any]] = field(default_factory=list)

    # Evidence gate
    passes_evidence_gate: bool = True
    best_score: float = 0.0
    quality_chunks: int = 0

    # Validation results
    escape_contradiction: bool = False
    invalid_citations: List[int] = field(default_factory=list)
    summary_citation_added: bool = False

    # Performance
    timings: Dict[str, float] = field(default_factory=dict)

    # Config (loaded from DB)
    settings: Dict[str, Any] = field(default_factory=dict)

    # Debug
    debug: bool = False
    debug_info: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize context for API response."""
        return {
            "query": self.query,
            "query_domain": self.query_domain,
            "article_query": self.article_query,
            "is_rate_question": self.is_rate_question,
            "passes_evidence_gate": self.passes_evidence_gate,
            "best_score": round(self.best_score, 4),
            "quality_chunks": self.quality_chunks,
            "escape_contradiction": self.escape_contradiction,
            "invalid_citations": self.invalid_citations,
            "summary_citation_added": self.summary_citation_added,
            "results_count": len(self.ranked_results),
            "timings": {k: round(v, 2) for k, v in self.timings.items()},
            "debug": self.debug_info if self.debug else None,
        }


# ═══════════════════════════════════════════════════════════════════════════
# PIPELINE STEPS - Each is an independent, testable unit
# ═══════════════════════════════════════════════════════════════════════════

class QueryAnalyzer:
    """
    Step 1: Analyze query intent, domain, article references.
    Detects: domain routing, article queries, rate questions.
    """

    # Domain -> keywords mapping for query intent detection
    DOMAIN_ROUTING = {
        "VIVK": {
            "keywords": ["veraset", "intikal", "miras", "vasiyet", "veraset vergisi", "tereke"],
            "exclude": [r"kdv", r"gvk", r"kvk", r"otv"],
        },
        "KDVK": {
            "keywords": ["kdv", "katma değer", "kdvk", "3065", "kdv beyanname", "kdv iade"],
            "exclude": [r"vivk", r"veraset", r"miras", r"intikal"],
        },
        "GVK": {
            "keywords": ["gelir vergisi", "gvk", "193", "yıllık beyan", "stopaj", "tevkifat",
                         "serbest meslek", "menkul", "gayrimenkul sermaye iradı"],
            "exclude": [r"vivk", r"veraset", r"kvk"],
        },
        "KVK": {
            "keywords": ["kurumlar vergisi", "kvk", "5520", "kurum kazancı", "kar dağıtımı"],
            "exclude": [r"vivk", r"veraset"],
        },
        "VUK": {
            "keywords": ["vergi usul", "vuk", "213", "yoklama", "inceleme", "zamanaşımı",
                         "uzlaşma", "izaha davet"],
            "exclude": [],  # VUK is cross-cutting
        },
        "DVK": {
            "keywords": ["damga vergisi", "dvk", "488", "damga", "nispi", "maktu"],
            "exclude": [r"vivk", r"veraset"],
        },
        "OTVK": {
            "keywords": ["özel tüketim", "ötv", "ötvk", "4760"],
            "exclude": [r"vivk", r"veraset"],
        },
        "MTVK": {
            "keywords": ["motorlu taşıt", "mtv", "mtvk", "197"],
            "exclude": [r"vivk", r"veraset"],
        },
        "AATUHK": {
            "keywords": ["6183", "amme alacağı", "kamu alacağı", "haciz", "ödeme emri",
                         "teminat", "tecil", "taksit"],
            "exclude": [],  # AATUHK is cross-cutting
        },
        "CVOA": {
            "keywords": ["çifte vergilendirme", "çvöa", "uluslararası", "dar mükellef"],
            "exclude": [r"vivk", r"veraset"],
        },
    }

    # Article detection patterns
    ARTICLE_PATTERN = re.compile(
        r"\b(VUK|GVK|KVK|KDVK|ÖTVK|MTV|DVK|HMK|SGK|İYUK|AATUHK|VİVK|VIVK)"
        r"\s*(?:madde\s*)?\.?\s*(\d+)",
        re.IGNORECASE
    )

    # Rate question patterns
    RATE_PATTERNS = [
        re.compile(r"oran[ıi]\s*(kaç|nedir|ne\s*kadar)", re.IGNORECASE),
        re.compile(r"yüzde\s*kaç", re.IGNORECASE),
        re.compile(r"vergi\s*oran", re.IGNORECASE),
        re.compile(r"ne\s*kadar.*vergi", re.IGNORECASE),
    ]

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        start = time.time()
        query_lower = ctx.query.lower()

        # 1. Domain detection
        for domain, config in self.DOMAIN_ROUTING.items():
            matched = [k for k in config["keywords"] if k in query_lower]
            if matched:
                ctx.query_domain = domain
                ctx.query_domain_keywords = matched
                logger.info(f"[QueryAnalyzer] Domain: {domain} (matched: {', '.join(matched)})")
                break

        # 2. Article detection
        match = self.ARTICLE_PATTERN.search(ctx.query)
        if match:
            ctx.article_query = {
                "law_code": match.group(1).upper(),
                "article_number": int(match.group(2)),
                "matched_text": match.group(0),
            }
            logger.info(f"[QueryAnalyzer] Article: {ctx.article_query['law_code']} m.{ctx.article_query['article_number']}")

        # 3. Rate question detection
        for pattern in self.RATE_PATTERNS:
            if pattern.search(ctx.query):
                ctx.is_rate_question = True
                # Detect law code from query
                ctx.rate_law_code = ctx.article_query["law_code"] if ctx.article_query else ctx.query_domain
                logger.info(f"[QueryAnalyzer] Rate question detected, law_code={ctx.rate_law_code}")
                break

        ctx.timings["query_analysis_ms"] = (time.time() - start) * 1000
        return ctx


class DomainFilter:
    """
    Step 4 (P0): Filter sources by detected query domain.
    Removes cross-domain noise (e.g., KDV sources for veraset question).
    """

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        if not ctx.query_domain:
            ctx.filtered_results = ctx.reranked_results or ctx.raw_results
            return ctx

        start = time.time()
        sources = ctx.reranked_results if ctx.reranked_results else ctx.raw_results
        domain_config = QueryAnalyzer.DOMAIN_ROUTING.get(ctx.query_domain, {})
        exclude_patterns = [re.compile(p, re.IGNORECASE) for p in domain_config.get("exclude", [])]

        if not exclude_patterns:
            ctx.filtered_results = sources
            ctx.timings["domain_filter_ms"] = (time.time() - start) * 1000
            return ctx

        # Also build include patterns from domain keywords
        include_patterns = [re.compile(re.escape(k), re.IGNORECASE)
                           for k in domain_config.get("keywords", [])]

        filtered = []
        removed = 0
        for source in sources:
            text = f"{source.get('source_table', '')} {source.get('title', '')} {source.get('content', '')[:500]}".lower()

            # Always keep if matches target domain
            if any(p.search(text) for p in include_patterns):
                filtered.append(source)
                continue

            # Exclude if matches another domain
            if any(p.search(text) for p in exclude_patterns):
                removed += 1
                logger.debug(f"[DomainFilter] Excluded: {source.get('title', '')[:50]}")
                continue

            # Keep generic sources
            filtered.append(source)

        if removed > 0:
            logger.info(f"[DomainFilter] {ctx.query_domain}: {removed}/{len(sources)} sources filtered")

        ctx.filtered_results = filtered
        ctx.timings["domain_filter_ms"] = (time.time() - start) * 1000
        return ctx


class SourceRanker:
    """
    Step 5: Rank sources by hierarchy, diversify by tier.
    Applies quality threshold and source type priority.
    """

    # Hierarchy weights by source type keyword
    HIERARCHY_WEIGHTS = {
        "kanun": 100, "mevzuat": 100,
        "teblig": 95, "yonetmelik": 90,
        "sirkuler": 85,
        "ozelge": 80,
        "danistay": 75, "yargitay": 75,
        "makale": 50,
        "sorucevap": 45,
        "document": 30,
    }

    # Tier thresholds for diversification
    TIER_THRESHOLDS = [0.40, 0.25, 0.15]  # High, Medium, Lower

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        start = time.time()
        sources = ctx.filtered_results if ctx.filtered_results else ctx.raw_results

        if not sources:
            ctx.ranked_results = []
            ctx.timings["ranking_ms"] = (time.time() - start) * 1000
            return ctx

        # Load settings
        threshold = float(ctx.settings.get("similarityThreshold", 0.10))
        max_sources = int(ctx.settings.get("maxSourcesToShow", 15))
        min_sources = int(ctx.settings.get("minSourcesToShow", 7))

        # 1. Calculate combined score
        for source in sources:
            similarity = source.get("similarity_score", 0) / 100  # Normalize to 0-1
            hierarchy_weight = self._get_hierarchy_weight(source)

            combined = (hierarchy_weight / 100 * 0.7) + (similarity * 0.3)
            source["_combined_score"] = combined
            source["_hierarchy_weight"] = hierarchy_weight
            source["_similarity_normalized"] = similarity

        # 2. Sort by combined score
        sources.sort(key=lambda s: s["_combined_score"], reverse=True)

        # 3. Quality threshold
        above_threshold = [s for s in sources if s["_similarity_normalized"] >= threshold]

        if len(above_threshold) >= max_sources:
            ranked = above_threshold[:max_sources]
        elif above_threshold:
            ranked = above_threshold
        else:
            ranked = sources[:3]  # Fallback: top 3
            logger.warning(f"[SourceRanker] No quality sources above {threshold}, using top 3 fallback")

        # 4. Diversify by tier
        if len(ranked) > 5:
            ranked = self._diversify(ranked, max_sources)

        # Track best score for evidence gate
        if ranked:
            ctx.best_score = max(s["_similarity_normalized"] for s in ranked)
            ctx.quality_chunks = len([s for s in ranked if s["_similarity_normalized"] >= 0.15])

        ctx.ranked_results = ranked
        logger.info(f"[SourceRanker] {len(sources)} -> {len(ranked)} sources "
                     f"(threshold={threshold}, best={ctx.best_score:.3f})")

        ctx.timings["ranking_ms"] = (time.time() - start) * 1000
        return ctx

    def _get_hierarchy_weight(self, source: Dict) -> int:
        source_table = (source.get("source_table", "") or "").lower()
        title = (source.get("title", "") or "").lower()
        combined = f"{source_table} {title}"

        for keyword, weight in self.HIERARCHY_WEIGHTS.items():
            if keyword in combined:
                return weight
        return 30  # Default

    def _diversify(self, sources: List[Dict], max_total: int) -> List[Dict]:
        tiers = [[] for _ in range(4)]
        for s in sources:
            score = s["_similarity_normalized"]
            if score >= self.TIER_THRESHOLDS[0]:
                tiers[0].append(s)
            elif score >= self.TIER_THRESHOLDS[1]:
                tiers[1].append(s)
            elif score >= self.TIER_THRESHOLDS[2]:
                tiers[2].append(s)
            else:
                tiers[3].append(s)

        max_per_tier = [5, 5, 3, 2]
        diversified = []
        for tier, max_t in zip(tiers, max_per_tier):
            diversified.extend(tier[:max_t])

        # Fill remaining
        remaining = [s for s in sources if s not in diversified]
        while len(diversified) < max_total and remaining:
            diversified.append(remaining.pop(0))

        logger.info(f"[SourceRanker] Diversify: T1={len(tiers[0])}, T2={len(tiers[1])}, "
                     f"T3={len(tiers[2])}, T4={len(tiers[3])} -> {len(diversified)}")
        return diversified


class EvidenceGate:
    """
    Step 6: Quality check before LLM call.
    Blocks LLM call if sources don't meet minimum quality threshold.
    """

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        start = time.time()

        enabled = ctx.settings.get("evidenceGateEnabled", "true") == "true"
        min_score = float(ctx.settings.get("evidenceGateMinScore", 0.15))
        min_chunks = int(ctx.settings.get("evidenceGateMinChunks", 2))

        if not enabled:
            ctx.passes_evidence_gate = True
            ctx.timings["evidence_gate_ms"] = (time.time() - start) * 1000
            return ctx

        passes = ctx.best_score >= min_score and ctx.quality_chunks >= min_chunks
        ctx.passes_evidence_gate = passes

        if not passes:
            logger.warning(
                f"[EvidenceGate] FAILED: best_score={ctx.best_score:.3f} (min={min_score}), "
                f"quality_chunks={ctx.quality_chunks} (min={min_chunks})"
            )
        else:
            logger.info(
                f"[EvidenceGate] PASSED: best_score={ctx.best_score:.3f}, "
                f"quality_chunks={ctx.quality_chunks}"
            )

        ctx.timings["evidence_gate_ms"] = (time.time() - start) * 1000
        return ctx


class ResponseValidator:
    """
    Step 7 (P1-P3): Post-LLM response validation and fixes.
    - P1: Escape pattern contradiction detection
    - P2: Citation validation (out-of-range citations)
    - P3: Summary citation enforcement
    """

    # P1: Escape patterns (no regulation found)
    ESCAPE_PATTERNS = [
        re.compile(r"açık\s+düzenleme.*?(?:bulunmam|yok)", re.IGNORECASE),
        re.compile(r"doğrudan\s+düzenleme.*?yok", re.IGNORECASE),
        re.compile(r"mevzuatta.*?yer\s+almam", re.IGNORECASE),
        re.compile(r"ilgili\s+(?:bir\s+)?(?:hüküm|düzenleme).*?(?:bulunmam|yok)", re.IGNORECASE),
        re.compile(r"net\s+bir\s+düzenleme.*?yok", re.IGNORECASE),
    ]

    # P1: Assertion patterns (contradicts escape)
    ASSERTION_PATTERNS = [
        re.compile(r"dolayısıyla.*?(?:yapılmalı|edilmeli|gerek|zorunlu)", re.IGNORECASE),
        re.compile(r"bu\s+nedenle.*?(?:gerekir|gereklidir|edilmeli)", re.IGNORECASE),
        re.compile(r"sonuç\s+olarak.*?(?:edilmeli|yapılmalı|belirlenir)", re.IGNORECASE),
        re.compile(r"(?:beyan\s+edilmeli|vergi.*?hesaplanmalı|ödenmeli)", re.IGNORECASE),
    ]

    # P3: Summary section patterns
    SUMMARY_PATTERNS = [
        re.compile(r"^##\s*özet", re.IGNORECASE | re.MULTILINE),
        re.compile(r"^\*\*özet\*\*", re.IGNORECASE | re.MULTILINE),
        re.compile(r"^özet:", re.IGNORECASE | re.MULTILINE),
        re.compile(r"^##\s*summary", re.IGNORECASE | re.MULTILINE),
    ]

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        if not ctx.llm_response:
            return ctx

        start = time.time()
        response = ctx.llm_response
        source_count = len(ctx.ranked_results)

        # P1: Escape pattern contradiction
        response = self._fix_escape_contradiction(response, ctx)

        # P2: Citation validation
        response = self._validate_citations(response, source_count, ctx)

        # P3: Summary citation enforcement
        response = self._enforce_summary_citation(response, source_count, ctx)

        ctx.final_response = response
        ctx.timings["validation_ms"] = (time.time() - start) * 1000
        return ctx

    def _fix_escape_contradiction(self, response: str, ctx: PipelineContext) -> str:
        escape_match = None
        assertion_match = None

        for p in self.ESCAPE_PATTERNS:
            m = p.search(response)
            if m:
                escape_match = m.group(0)
                break

        for p in self.ASSERTION_PATTERNS:
            m = p.search(response)
            if m:
                assertion_match = m.group(0)
                break

        if escape_match and assertion_match:
            ctx.escape_contradiction = True
            logger.warning(f"[ResponseValidator] P1 CONTRADICTION: '{escape_match}' + '{assertion_match}'")

            warning = (
                "\n\n**\u26a0\ufe0f Belirsizlik:** Bu konuda mevzuatta a\u00e7\u0131k bir d\u00fczenleme "
                "bulunamam\u0131\u015ft\u0131r. A\u015fa\u011f\u0131daki de\u011ferlendirme genel ilkelere "
                "dayanmaktad\u0131r ve kesin h\u00fck\u00fcm niteli\u011fi ta\u015f\u0131mamaktad\u0131r.\n\n"
            )

            for p in self.ESCAPE_PATTERNS:
                full_match = re.search(p.pattern + r"[^.]*\.", response, re.IGNORECASE)
                if full_match:
                    pos = full_match.end()
                    response = response[:pos] + warning + response[pos:]
                    break

        return response

    def _validate_citations(self, response: str, source_count: int, ctx: PipelineContext) -> str:
        if source_count == 0:
            return re.sub(r"\[\d+\]", "", response)

        citations = re.findall(r"\[(\d+)\]", response)
        invalid = [int(c) for c in set(citations) if int(c) > source_count or int(c) < 1]

        if invalid:
            ctx.invalid_citations = invalid
            logger.warning(f"[ResponseValidator] P2 INVALID CITATIONS: {invalid} (max={source_count})")

            for num in invalid:
                response = re.sub(rf"\[{num}\]", "[1]", response)

        return response

    def _enforce_summary_citation(self, response: str, source_count: int, ctx: PipelineContext) -> str:
        if source_count == 0:
            return response

        for pattern in self.SUMMARY_PATTERNS:
            match = pattern.search(response)
            if match:
                # Extract summary section
                after = response[match.end():]
                next_section = re.search(r"\n##\s+", after)
                end_pos = match.end() + (next_section.start() if next_section else min(500, len(after)))
                summary = response[match.start():end_pos]

                if not re.search(r"\[\d+\]", summary):
                    # Add citation after first sentence
                    sentence_end = re.search(r"[.!?](?=\s|$)", summary)
                    if sentence_end:
                        insert_pos = match.start() + sentence_end.end()
                        response = response[:insert_pos] + " [1]" + response[insert_pos:]
                        ctx.summary_citation_added = True
                        logger.info("[ResponseValidator] P3: Added citation to summary")
                break

        # Also check first paragraph as implicit summary
        if not ctx.summary_citation_added:
            first_para_end = response.find("\n\n")
            if first_para_end > 50:
                first_para = response[:first_para_end]
                if not re.search(r"\[\d+\]", first_para):
                    sentence_end = re.search(r"[.!?](?=\s|$)", first_para)
                    if sentence_end:
                        pos = sentence_end.end()
                        response = response[:pos] + " [1]" + response[pos:]
                        ctx.summary_citation_added = True
                        logger.info("[ResponseValidator] P3: Added citation to first paragraph")

        return response


# ═══════════════════════════════════════════════════════════════════════════
# PIPELINE ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════

class RAGPipeline:
    """
    Orchestrates the RAG pipeline as a middleware chain.
    Each step receives and returns a PipelineContext.
    Steps can be toggled, reordered, or replaced.
    """

    def __init__(self):
        self.query_analyzer = QueryAnalyzer()
        self.domain_filter = DomainFilter()
        self.source_ranker = SourceRanker()
        self.evidence_gate = EvidenceGate()
        self.response_validator = ResponseValidator()
        logger.info("[RAGPipeline] Initialized with all steps")

    async def analyze_query(self, query: str, debug: bool = False) -> Dict[str, Any]:
        """
        Run query analysis only (Steps 1).
        Useful for pre-flight checks without full pipeline.
        """
        ctx = PipelineContext(query=query, debug=debug)
        ctx = await self.query_analyzer.execute(ctx)
        return ctx.to_dict()

    async def run_post_retrieval(
        self,
        query: str,
        search_results: List[Dict[str, Any]],
        settings: Optional[Dict[str, Any]] = None,
        debug: bool = False,
    ) -> Dict[str, Any]:
        """
        Run post-retrieval pipeline (Steps 1, 4, 5, 6).
        Takes search results from Python semantic search and applies
        domain filtering, ranking, and evidence gate.

        This replaces Node.js post-processing for these steps.
        """
        start = time.time()
        ctx = PipelineContext(query=query, debug=debug)
        ctx.settings = settings or {}
        ctx.raw_results = search_results

        # Load settings from DB if not provided
        if not ctx.settings:
            ctx.settings = await self._load_settings()

        # Step 1: Query Analysis
        ctx = await self.query_analyzer.execute(ctx)

        # Step 4: Domain Filter (P0)
        ctx.reranked_results = search_results  # Input for domain filter
        ctx = await self.domain_filter.execute(ctx)

        # Step 5: Source Ranking
        ctx = await self.source_ranker.execute(ctx)

        # Step 6: Evidence Gate
        ctx = await self.evidence_gate.execute(ctx)

        ctx.timings["total_post_retrieval_ms"] = (time.time() - start) * 1000

        return {
            "success": True,
            "query_analysis": {
                "domain": ctx.query_domain,
                "domain_keywords": ctx.query_domain_keywords,
                "article_query": ctx.article_query,
                "is_rate_question": ctx.is_rate_question,
            },
            "ranked_results": ctx.ranked_results,
            "passes_evidence_gate": ctx.passes_evidence_gate,
            "best_score": round(ctx.best_score, 4),
            "quality_chunks": ctx.quality_chunks,
            "timings": {k: round(v, 2) for k, v in ctx.timings.items()},
            "stats": {
                "input_count": len(search_results),
                "after_domain_filter": len(ctx.filtered_results),
                "after_ranking": len(ctx.ranked_results),
            },
        }

    async def validate_response(
        self,
        query: str,
        llm_response: str,
        sources: List[Dict[str, Any]],
        language: str = "tr",
        debug: bool = False,
    ) -> Dict[str, Any]:
        """
        Run response validation (Step 7: P1-P3).
        Takes LLM response and validates/fixes citations, escape patterns, summaries.

        This replaces Node.js P1-P3 post-processing.
        """
        start = time.time()
        ctx = PipelineContext(query=query, language=language, debug=debug)
        ctx.llm_response = llm_response
        ctx.ranked_results = sources

        # Step 7: Response Validation
        ctx = await self.response_validator.execute(ctx)

        ctx.timings["total_validation_ms"] = (time.time() - start) * 1000

        return {
            "success": True,
            "original_response": llm_response,
            "validated_response": ctx.final_response,
            "changes": {
                "escape_contradiction_detected": ctx.escape_contradiction,
                "invalid_citations_fixed": ctx.invalid_citations,
                "summary_citation_added": ctx.summary_citation_added,
                "response_modified": ctx.final_response != llm_response,
            },
            "timings": {k: round(v, 2) for k, v in ctx.timings.items()},
        }

    async def full_pipeline(
        self,
        query: str,
        search_results: List[Dict[str, Any]],
        llm_response: str,
        settings: Optional[Dict[str, Any]] = None,
        language: str = "tr",
        debug: bool = False,
    ) -> Dict[str, Any]:
        """
        Run complete post-processing pipeline (Steps 1, 4, 5, 6, 7).
        Combines post-retrieval + response validation in single call.
        """
        start = time.time()
        ctx = PipelineContext(query=query, language=language, debug=debug)
        ctx.settings = settings or await self._load_settings()
        ctx.raw_results = search_results
        ctx.llm_response = llm_response

        # Steps 1 -> 4 -> 5 -> 6
        ctx = await self.query_analyzer.execute(ctx)
        ctx.reranked_results = search_results
        ctx = await self.domain_filter.execute(ctx)
        ctx = await self.source_ranker.execute(ctx)
        ctx = await self.evidence_gate.execute(ctx)

        # Step 7
        ctx = await self.response_validator.execute(ctx)

        ctx.timings["total_pipeline_ms"] = (time.time() - start) * 1000

        return {
            "success": True,
            "query_analysis": {
                "domain": ctx.query_domain,
                "article_query": ctx.article_query,
                "is_rate_question": ctx.is_rate_question,
            },
            "ranked_results": ctx.ranked_results,
            "validated_response": ctx.final_response,
            "passes_evidence_gate": ctx.passes_evidence_gate,
            "changes": {
                "escape_contradiction_detected": ctx.escape_contradiction,
                "invalid_citations_fixed": ctx.invalid_citations,
                "summary_citation_added": ctx.summary_citation_added,
            },
            "stats": {
                "input_count": len(search_results),
                "after_domain_filter": len(ctx.filtered_results),
                "after_ranking": len(ctx.ranked_results),
            },
            "timings": {k: round(v, 2) for k, v in ctx.timings.items()},
        }

    async def _load_settings(self) -> Dict[str, Any]:
        """Load RAG settings from database."""
        try:
            pool = await get_db()
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT key, value FROM settings WHERE key LIKE 'ragSettings.%'"
                )
                settings = {}
                for row in rows:
                    key = row["key"].replace("ragSettings.", "")
                    settings[key] = row["value"]
                return settings
        except Exception as e:
            logger.error(f"[RAGPipeline] Failed to load settings: {e}")
            return {}


# ═══════════════════════════════════════════════════════════════════════════
# SINGLETON
# ═══════════════════════════════════════════════════════════════════════════

rag_pipeline = RAGPipeline()
