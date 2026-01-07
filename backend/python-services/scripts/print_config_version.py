#!/usr/bin/env python3
"""Print semantic analyzer config version for CI tracking"""

import sys
from pathlib import Path

# Add parent directory for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.semantic_analyzer_service import SemanticAnalyzerService

def main():
    svc = SemanticAnalyzerService()
    print(f"verdict_patterns: {len(svc.verdict_patterns)}")
    print(f"forbidden_patterns: {len(svc.forbidden_patterns)}")
    print(f"system_message_patterns: {len(svc.system_message_patterns)}")
    print(f"source_indicators: {len(svc.SOURCE_INDICATORS)}")
    print(f"modality_patterns: {len(svc.modality_question_patterns)}")

if __name__ == "__main__":
    main()
