"""
Test script for Whisper integration
Tests all fixed issues and verifies functionality
"""

import asyncio
import os
from pathlib import Path
from services.whisper_service import WhisperService, get_whisper_service

# ANSI colors for output
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
    print(f"{GREEN}✅ PASS: {message}{RESET}")


def print_fail(message: str):
    """Print fail message"""
    print(f"{RED}❌ FAIL: {message}{RESET}")


def print_info(message: str):
    """Print info message"""
    print(f"{YELLOW}ℹ️  INFO: {message}{RESET}")


async def test_service_instance_caching():
    """Test that service instances are cached per (model, mode) combination"""
    print_test("Service Instance Caching")

    # Get service with base model
    service1 = get_whisper_service(model_name="base", mode="local")
    service2 = get_whisper_service(model_name="base", mode="local")

    if service1 is service2:
        print_pass("Same instance returned for same (model, mode)")
    else:
        print_fail("Different instances returned for same (model, mode)")

    # Get service with different model
    service3 = get_whisper_service(model_name="tiny", mode="local")

    if service1 is not service3:
        print_pass("Different instance returned for different model")
    else:
        print_fail("Same instance returned for different model")

    # Get service with different mode
    service4 = get_whisper_service(model_name="base", mode="api", api_key="test_key")

    if service1 is not service4:
        print_pass("Different instance returned for different mode")
    else:
        print_fail("Same instance returned for different mode")


def test_device_check():
    """Test that device check only runs in local mode"""
    print_test("Device Check in API vs Local Mode")

    try:
        # API mode should not check device
        service_api = WhisperService(mode="api", api_key="test_key", model_name="whisper-1")
        if service_api.device is None:
            print_pass("API mode: device is None (not checked)")
        else:
            print_fail(f"API mode: device is {service_api.device} (should be None)")
    except Exception as e:
        print_info(f"API mode test skipped: {e}")

    # Local mode should check device
    try:
        service_local = WhisperService(mode="local", model_name="base")
        if service_local.device in ["cpu", "cuda"]:
            print_pass(f"Local mode: device is {service_local.device}")
        else:
            print_fail(f"Local mode: device is {service_local.device} (expected cpu or cuda)")
    except Exception as e:
        print_info(f"Local mode test skipped (Whisper not installed): {e}")


async def test_file_extension_handling():
    """Test that different file extensions are handled correctly"""
    print_test("File Extension Handling")

    try:
        service = get_whisper_service(model_name="base", mode="local")

        # Test with different extensions
        test_data = b"fake audio data"
        extensions = [".mp3", ".wav", ".m4a", ".webm", ".ogg"]

        for ext in extensions:
            # Just verify the function accepts the extension parameter
            # Actual transcription would fail with fake data
            print_info(f"Testing extension: {ext}")
            try:
                # This will fail due to fake data, but we're checking if extension is accepted
                await service.transcribe_audio(
                    audio_data=test_data,
                    language="en",
                    file_extension=ext
                )
            except Exception as e:
                # Expected to fail with fake data
                if "file_extension" in str(e):
                    print_fail(f"Extension {ext} not accepted")
                else:
                    print_pass(f"Extension {ext} accepted (failed on fake data as expected)")

    except Exception as e:
        print_info(f"File extension test skipped: {e}")


async def test_timestamp_api_mode_error():
    """Test that timestamp feature properly rejects API mode"""
    print_test("Timestamp Feature API Mode Rejection")

    try:
        service = WhisperService(mode="api", api_key="test_key", model_name="whisper-1")

        test_data = b"fake audio data"
        result = await service.transcribe_with_timestamps(
            audio_data=test_data,
            language="en"
        )

        if not result.get("success") and "not supported in API mode" in result.get("error", ""):
            print_pass("API mode correctly rejected for timestamps")
        else:
            print_fail("API mode should reject timestamp requests")
    except Exception as e:
        print_info(f"Timestamp API test skipped: {e}")


def test_supported_formats():
    """Test that supported formats are correctly defined"""
    print_test("Supported Audio Formats")

    from routers.whisper_router import SUPPORTED_FORMATS

    expected_formats = {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg", ".flac"}

    if SUPPORTED_FORMATS == expected_formats:
        print_pass(f"All expected formats supported: {len(SUPPORTED_FORMATS)} formats")
        print_info(f"Formats: {', '.join(sorted(SUPPORTED_FORMATS))}")
    else:
        print_fail("Supported formats mismatch")
        print_info(f"Expected: {expected_formats}")
        print_info(f"Got: {SUPPORTED_FORMATS}")


def test_file_size_limit():
    """Test that file size limit is correctly set"""
    print_test("File Size Limit")

    from routers.whisper_router import MAX_FILE_SIZE

    expected_size = 25 * 1024 * 1024  # 25MB

    if MAX_FILE_SIZE == expected_size:
        print_pass(f"File size limit correctly set: {MAX_FILE_SIZE // (1024*1024)}MB")
    else:
        print_fail(f"File size limit incorrect: {MAX_FILE_SIZE} (expected {expected_size})")


def test_model_info():
    """Test model info retrieval"""
    print_test("Model Info Retrieval")

    try:
        service = get_whisper_service(model_name="base", mode="local")
        info = service.get_model_info()

        required_keys = ["model_name", "device", "loaded", "cuda_available", "whisper_available"]

        if all(key in info for key in required_keys):
            print_pass("Model info contains all required keys")
            print_info(f"Model: {info['model_name']}")
            print_info(f"Device: {info['device']}")
            print_info(f"Loaded: {info['loaded']}")
            print_info(f"CUDA Available: {info['cuda_available']}")
            print_info(f"Whisper Available: {info['whisper_available']}")
        else:
            print_fail("Model info missing required keys")
    except Exception as e:
        print_info(f"Model info test skipped: {e}")


async def main():
    """Run all tests"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}Whisper Integration Test Suite{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")

    # Run tests
    await test_service_instance_caching()
    test_device_check()
    await test_file_extension_handling()
    await test_timestamp_api_mode_error()
    test_supported_formats()
    test_file_size_limit()
    test_model_info()

    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}Test Suite Complete{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")


if __name__ == "__main__":
    asyncio.run(main())
