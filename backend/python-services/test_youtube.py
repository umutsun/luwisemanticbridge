"""
Test script for YouTube transcription features
"""

import asyncio
import sys
from services.youtube_service import get_youtube_service

# ANSI colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"


def print_test(name: str):
    """Print test name"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST: {name}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")


def print_pass(message: str):
    """Print pass message"""
    print(f"{GREEN}[PASS] {message}{RESET}")


def print_fail(message: str):
    """Print fail message"""
    print(f"{RED}[FAIL] {message}{RESET}")


def print_info(message: str):
    """Print info message"""
    print(f"{YELLOW}[INFO] {message}{RESET}")


async def test_youtube_service_creation():
    """Test that YouTube service can be created"""
    print_test("YouTube Service Creation")

    try:
        service = get_youtube_service()
        print_pass("YouTube service created successfully")
        return True
    except Exception as e:
        print_fail(f"Failed to create YouTube service: {e}")
        return False


async def test_video_info():
    """Test getting video info without download"""
    print_test("YouTube Video Info Extraction")

    try:
        service = get_youtube_service()

        # Use a short, known public video (Rick Astley - Never Gonna Give You Up)
        test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

        print_info(f"Getting info for: {test_url}")
        info = await service.get_video_info(test_url)

        if info.get("success"):
            print_pass("Video info retrieved successfully")
            print_info(f"Title: {info.get('title', 'N/A')}")
            print_info(f"Duration: {info.get('duration', 0)} seconds")
            print_info(f"Author: {info.get('author', 'N/A')}")
            return True
        else:
            print_fail(f"Failed to get video info: {info.get('error')}")
            return False

    except Exception as e:
        print_fail(f"Video info test failed: {e}")
        return False


async def test_subtitle_check():
    """Test checking for subtitles"""
    print_test("YouTube Subtitle Detection")

    try:
        service = get_youtube_service()

        # Same video - this one has subtitles
        test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

        print_info(f"Checking for English subtitles...")
        subtitles = await service.get_subtitles(test_url, language='en')

        if subtitles:
            print_pass(f"Subtitles found ({len(subtitles)} chars)")
            print_info(f"First 100 chars: {subtitles[:100]}...")
            return True
        else:
            print_info("No subtitles found (this is OK - not all videos have them)")
            return True

    except Exception as e:
        print_fail(f"Subtitle check failed: {e}")
        return False


async def test_language_prompts():
    """Test that language-specific prompts are available"""
    print_test("Language-Specific Prompts")

    try:
        from routers.whisper_router import LANGUAGE_PROMPTS

        expected_languages = ["tr", "en", "de", "fr", "es", "it"]

        all_present = all(lang in LANGUAGE_PROMPTS for lang in expected_languages)

        if all_present:
            print_pass(f"All expected language prompts present ({len(LANGUAGE_PROMPTS)} total)")
            print_info(f"Languages: {', '.join(sorted(LANGUAGE_PROMPTS.keys()))}")

            # Show Turkish prompt (wrap in try-except for Windows console encoding issues)
            try:
                print_info(f"\nTurkish prompt: {LANGUAGE_PROMPTS['tr']}")
            except UnicodeEncodeError:
                print_info("\nTurkish prompt: [Contains Turkish characters - console encoding limited]")
            return True
        else:
            missing = [lang for lang in expected_languages if lang not in LANGUAGE_PROMPTS]
            print_fail(f"Missing language prompts: {missing}")
            return False

    except Exception as e:
        print_fail(f"Language prompts test failed: {e}")
        return False


async def test_endpoint_imports():
    """Test that all new endpoints are properly imported"""
    print_test("Endpoint Imports and Definitions")

    try:
        from routers.whisper_router import router

        # Check that router has the expected endpoints
        routes = [route.path for route in router.routes]

        expected_endpoints = [
            "/whisper/transcribe",
            "/whisper/transcribe-youtube",
            "/whisper/transcribe-turkish",
            "/whisper/transcribe-batch",
            "/whisper/transcribe-with-timestamps",
            "/whisper/model-info",
            "/whisper/supported-languages",
            "/whisper/health"
        ]

        all_present = all(endpoint in routes for endpoint in expected_endpoints)

        if all_present:
            print_pass(f"All {len(expected_endpoints)} expected endpoints present")
            for endpoint in expected_endpoints:
                print_info(f"  - {endpoint}")
            return True
        else:
            missing = [ep for ep in expected_endpoints if ep not in routes]
            print_fail(f"Missing endpoints: {missing}")
            print_info(f"Available endpoints: {routes}")
            return False

    except Exception as e:
        print_fail(f"Endpoint imports test failed: {e}")
        return False


async def test_supported_formats():
    """Test that all audio formats are supported"""
    print_test("Supported Audio Formats")

    try:
        from routers.whisper_router import SUPPORTED_FORMATS

        expected_formats = {".mp3", ".wav", ".m4a", ".webm", ".ogg", ".flac"}

        if expected_formats.issubset(SUPPORTED_FORMATS):
            print_pass(f"All expected formats supported ({len(SUPPORTED_FORMATS)} total)")
            print_info(f"Formats: {', '.join(sorted(SUPPORTED_FORMATS))}")
            return True
        else:
            missing = expected_formats - SUPPORTED_FORMATS
            print_fail(f"Missing formats: {missing}")
            return False

    except Exception as e:
        print_fail(f"Supported formats test failed: {e}")
        return False


async def main():
    """Run all tests"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}YouTube Integration Test Suite{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")

    results = []

    # Run tests
    results.append(await test_youtube_service_creation())
    results.append(await test_video_info())
    results.append(await test_subtitle_check())
    results.append(await test_language_prompts())
    results.append(await test_endpoint_imports())
    results.append(await test_supported_formats())

    # Summary
    print(f"\n{BLUE}{'='*60}{RESET}")
    passed = sum(results)
    total = len(results)

    if passed == total:
        print(f"{GREEN}All tests passed: {passed}/{total}{RESET}")
        print(f"{BLUE}{'='*60}{RESET}\n")
        sys.exit(0)
    else:
        print(f"{RED}Some tests failed: {passed}/{total} passed{RESET}")
        print(f"{BLUE}{'='*60}{RESET}\n")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
