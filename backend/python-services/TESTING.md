# Python Services Testing Documentation

This document outlines the testing strategy and implementation for the Python FastAPI services.

## Overview

- **Framework**: pytest with pytest-asyncio
- **Coverage Tool**: pytest-cov
- **Target Coverage**: 70%+
- **Test Pattern**: Fixture-based testing with comprehensive coverage

## Test Infrastructure

### Configuration Files

- **pytest.ini**: Pytest configuration with async support
- **tests/conftest.py**: Centralized fixtures for all tests
- **tests/__init__.py**: Makes tests directory a Python package

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=services --cov-report=term-missing

# Run specific test file
pytest tests/test_pdf_service.py

# Run with verbose output
pytest -v

# Run async tests only
pytest -m asyncio
```

## PDF Service Testing

### Test Suite: `tests/test_pdf_service.py`

**Status**: ✅ 20/20 tests passing (100%)
**Coverage**: 82.09% (exceeds 70% target)

### Test Categories

#### 1. Constructor & Singleton Tests (2 tests)
- Service initialization
- Singleton instance verification

#### 2. Async Extract Text Tests (4 tests)
- Valid PDF text extraction
- Metadata extraction
- Character count validation
- Page count validation

#### 3. Error Handling Tests (2 tests)
- Corrupted PDF handling
- File read error handling

#### 4. Sync Extract from Bytes Tests (5 tests)
- Valid bytes extraction
- Metadata from bytes
- Filename handling
- Corrupted bytes handling
- Empty bytes handling

#### 5. Metadata Handling Tests (2 tests)
- Default values when missing
- None value handling

#### 6. Edge Cases (3 tests)
- Multi-page PDF handling
- Page error continuation
- Text stripping

#### 7. Integration Tests (2 tests)
- Full extraction workflow
- Async/sync consistency

### Key Fixtures

```python
# Valid PDF with metadata
@pytest.fixture
def mock_pdf_bytes():
    """Create a simple valid PDF file in bytes"""

# Corrupted PDF
@pytest.fixture
def mock_corrupted_pdf():
    """Create corrupted PDF bytes"""

# Empty PDF
@pytest.fixture
def mock_empty_pdf():
    """Create empty PDF bytes"""

# Mock FastAPI UploadFile
@pytest.fixture
def mock_upload_file(mock_pdf_bytes):
    """Mock FastAPI UploadFile object"""
```

### Test Pattern Example

```python
@pytest.mark.asyncio
async def test_extract_text_from_valid_pdf(self, mock_upload_file):
    """Should extract text from valid PDF file"""
    result = await self.service.extract_text(mock_upload_file)

    assert result['success'] is True
    assert 'text' in result
    assert 'metadata' in result
    assert isinstance(result['text'], str)
    assert isinstance(result['metadata'], dict)
```

### Coverage Details

**Total**: 67 statements, 12 missed (82.09%)

**Uncovered Lines** (18%):
- Lines 55-58: Individual page extraction error handling
- Lines 84-86: Individual metadata field extraction errors
- Lines 134-136: Sync method page extraction errors
- Lines 151-152: Sync method metadata extraction errors

These lines are difficult to test without corrupting specific PDF structures. Current coverage well exceeds the 70% target.

## Dependencies

```bash
pip install pytest pytest-asyncio pytest-cov PyPDF2
```

## Best Practices

1. **Async Testing**: Use `@pytest.mark.asyncio` for async functions
2. **Fixtures**: Centralize test data in `conftest.py`
3. **Mock Objects**: Create realistic mocks that match production objects
4. **Error Cases**: Test both success and failure paths
5. **Integration**: Include end-to-end workflow tests
6. **Coverage**: Aim for 70%+ coverage minimum

## Adding New Tests

1. Create test file in `tests/` directory with `test_` prefix
2. Define test class with `Test` prefix
3. Use fixtures from `conftest.py` or create service-specific ones
4. Follow AAA pattern (Arrange, Act, Assert)
5. Run tests and verify coverage

Example:
```python
class TestNewService:
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.service = NewService()

    def test_basic_functionality(self):
        """Should perform basic operation"""
        # Arrange
        input_data = "test"

        # Act
        result = self.service.process(input_data)

        # Assert
        assert result['success'] is True
```

## CI/CD Integration

```yaml
# Example GitHub Actions workflow
- name: Run Python Tests
  run: |
    cd backend/python-services
    pip install -r requirements.txt
    pytest --cov=services --cov-report=term-missing --cov-fail-under=70
```

## Test Maintenance

- Update fixtures when service interfaces change
- Keep test coverage above 70%
- Review uncovered lines periodically
- Update tests when adding new features
- Document complex test scenarios

## Future Testing Plans

- [ ] Add tests for other services (crawlers, RAG, etc.)
- [ ] Integration tests with actual FastAPI routes
- [ ] Performance/load testing for PDF extraction
- [ ] Test with real-world PDF samples
- [ ] Add mutation testing for test quality verification
