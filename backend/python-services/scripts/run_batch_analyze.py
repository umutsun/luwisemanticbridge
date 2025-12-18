"""
Standalone script to run batch analyze
Usage: python3 scripts/run_batch_analyze.py --batch-size 10 --limit 0
"""
import asyncio
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.document_analyzer_service import document_analyzer
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run_batch_analyze(batch_size: int = 10, limit: int = 0):
    """Run batch analyze process"""
    try:
        logger.info(f"🚀 Starting batch analyze - batch_size={batch_size}, limit={limit}")

        # Start batch analyze
        result = await document_analyzer.start_batch_analyze(batch_size=batch_size, limit=limit)
        logger.info(f"✅ Started: {result}")

        # Monitor progress
        while True:
            try:
                status = await document_analyzer.get_status()

                if not status.get('is_running'):
                    logger.info("🏁 Batch analyze completed!")
                    break

                current_job = status.get('current_job', {})
                logger.info(f"⏳ Progress: {current_job.get('processed', 0)}/{current_job.get('total', 0)} documents")

                await asyncio.sleep(30)  # Check every 30 seconds

            except AttributeError:
                # get_status might not exist, just run without monitoring
                logger.info("📊 Running in background mode (no status monitoring)")
                break

    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Run batch document analysis')
    parser.add_argument('--batch-size', type=int, default=10, help='Batch size (default: 10)')
    parser.add_argument('--limit', type=int, default=0, help='Max documents to process (0 = no limit)')

    args = parser.parse_args()

    asyncio.run(run_batch_analyze(batch_size=args.batch_size, limit=args.limit))
