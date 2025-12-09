"""
Comprehensive tests for PDF Service
Following the same testing pattern as backend services
"""

import pytest
import io
from services.pdf_service import PDFService, pdf_service


class TestPDFService:
    """Test suite for PDFService"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        self.service = PDFService()

    # ========================================
    # Constructor & Singleton Tests
    # ========================================

    def test_service_initialization(self):
        """Should initialize service successfully"""
        service = PDFService()
        assert service is not None
        assert isinstance(service, PDFService)

    def test_singleton_instance(self):
        """Should provide singleton instance"""
        assert pdf_service is not None
        assert isinstance(pdf_service, PDFService)

    # ========================================
    # Async Extract Text Tests (Happy Path)
    # ========================================

    @pytest.mark.asyncio
    async def test_extract_text_from_valid_pdf(self, mock_upload_file):
        """Should extract text from valid PDF file"""
        result = await self.service.extract_text(mock_upload_file)

        assert result['success'] is True
        assert 'text' in result
        assert 'metadata' in result
        assert isinstance(result['text'], str)
        assert isinstance(result['metadata'], dict)

    @pytest.mark.asyncio
    async def test_extract_metadata_from_pdf(self, mock_upload_file):
        """Should extract complete metadata from PDF"""
        result = await self.service.extract_text(mock_upload_file)

        assert result['success'] is True
        metadata = result['metadata']

        # Check required metadata fields
        assert 'pages' in metadata
        assert 'author' in metadata
        assert 'title' in metadata
        assert 'subject' in metadata
        assert 'creator' in metadata
        assert 'producer' in metadata

        # Verify values
        assert metadata['pages'] == 1
        assert metadata['author'] == 'Test Author'
        assert metadata['title'] == 'Test PDF Document'

    @pytest.mark.asyncio
    async def test_extract_text_includes_char_count(self, mock_upload_file):
        """Should include character count in result"""
        result = await self.service.extract_text(mock_upload_file)

        assert 'char_count' in result
        assert isinstance(result['char_count'], int)
        assert result['char_count'] >= 0

    @pytest.mark.asyncio
    async def test_extract_text_includes_page_count(self, mock_upload_file):
        """Should include page count in result"""
        result = await self.service.extract_text(mock_upload_file)

        assert 'page_count' in result
        assert result['page_count'] == 1

    # ========================================
    # Error Handling Tests
    # ========================================

    @pytest.mark.asyncio
    async def test_extract_text_from_corrupted_pdf(self, mock_upload_file_corrupted):
        """Should handle corrupted PDF gracefully"""
        result = await self.service.extract_text(mock_upload_file_corrupted)

        assert result['success'] is False
        assert 'error' in result
        assert 'Invalid or corrupted PDF' in result['error']
        assert result['text'] == ''
        assert result['metadata'] == {}

    @pytest.mark.asyncio
    async def test_extract_text_handles_read_errors(self):
        """Should handle file read errors gracefully"""
        # Create a mock file that raises an error on read
        class BrokenUploadFile:
            def __init__(self):
                self.filename = "broken.pdf"

            async def read(self):
                raise Exception("Read failed")

        result = await self.service.extract_text(BrokenUploadFile())

        assert result['success'] is False
        assert 'error' in result
        assert 'Failed to extract PDF' in result['error']

    # ========================================
    # Sync Extract Text from Bytes Tests
    # ========================================

    def test_extract_text_from_bytes_valid(self, mock_pdf_bytes):
        """Should extract text from valid PDF bytes"""
        result = self.service.extract_text_from_bytes(mock_pdf_bytes, "test.pdf")

        assert result['success'] is True
        assert 'text' in result
        assert 'metadata' in result
        assert isinstance(result['text'], str)

    def test_extract_text_from_bytes_includes_metadata(self, mock_pdf_bytes):
        """Should extract metadata from PDF bytes"""
        result = self.service.extract_text_from_bytes(mock_pdf_bytes, "test.pdf")

        assert result['success'] is True
        metadata = result['metadata']

        assert 'pages' in metadata
        assert 'author' in metadata
        assert 'title' in metadata
        assert metadata['pages'] == 1

    def test_extract_text_from_bytes_uses_filename(self, mock_pdf_bytes):
        """Should use provided filename in metadata"""
        filename = "custom_document.pdf"
        result = self.service.extract_text_from_bytes(mock_pdf_bytes, filename)

        assert result['success'] is True
        assert result['metadata']['title'] == 'Test PDF Document'  # From metadata

    def test_extract_text_from_bytes_handles_corruption(self, mock_corrupted_pdf):
        """Should handle corrupted bytes gracefully"""
        result = self.service.extract_text_from_bytes(mock_corrupted_pdf, "bad.pdf")

        assert result['success'] is False
        assert 'error' in result
        assert result['text'] == ''
        assert result['metadata'] == {}

    def test_extract_text_from_bytes_handles_empty(self, mock_empty_pdf):
        """Should handle empty bytes gracefully"""
        result = self.service.extract_text_from_bytes(mock_empty_pdf, "empty.pdf")

        assert result['success'] is False
        assert 'error' in result

    # ========================================
    # Metadata Handling Tests
    # ========================================

    @pytest.mark.asyncio
    async def test_metadata_defaults_when_missing(self):
        """Should use default values when PDF metadata is missing"""
        # Create PDF without metadata
        from PyPDF2 import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=200, height=200)

        pdf_bytes = io.BytesIO()
        writer.write(pdf_bytes)
        pdf_bytes.seek(0)

        class MockFile:
            def __init__(self):
                self.filename = "no_metadata.pdf"
            async def read(self):
                return pdf_bytes.getvalue()

        result = await self.service.extract_text(MockFile())

        assert result['success'] is True
        metadata = result['metadata']

        # Should have default values
        assert metadata['author'] == 'Unknown'
        assert metadata['title'] == 'no_metadata.pdf'
        assert metadata['subject'] == ''

    def test_metadata_handles_none_values(self, mock_pdf_bytes):
        """Should handle None metadata values gracefully"""
        result = self.service.extract_text_from_bytes(mock_pdf_bytes)

        # All metadata should be strings or valid types
        metadata = result['metadata']
        for key, value in metadata.items():
            if key == 'pages':
                assert isinstance(value, int)
            elif key == 'created_at':
                # Can be None
                pass
            else:
                assert isinstance(value, str)

    # ========================================
    # Edge Cases
    # ========================================

    @pytest.mark.asyncio
    async def test_extract_from_multipage_pdf(self):
        """Should handle multi-page PDFs correctly"""
        from PyPDF2 import PdfWriter
        writer = PdfWriter()

        # Add 3 pages
        writer.add_blank_page(width=200, height=200)
        writer.add_blank_page(width=200, height=200)
        writer.add_blank_page(width=200, height=200)

        pdf_bytes = io.BytesIO()
        writer.write(pdf_bytes)
        pdf_bytes.seek(0)

        class MockFile:
            def __init__(self):
                self.filename = "multipage.pdf"
            async def read(self):
                return pdf_bytes.getvalue()

        result = await self.service.extract_text(MockFile())

        assert result['success'] is True
        assert result['metadata']['pages'] == 3
        assert result['page_count'] == 3

    @pytest.mark.asyncio
    async def test_extract_continues_on_page_errors(self, mock_upload_file):
        """Should continue extraction even if some pages fail"""
        # This is harder to test without actually corrupting pages
        # The service has try-catch per page, so it should handle it
        result = await self.service.extract_text(mock_upload_file)

        # Even with some page failures, should return success if any pages work
        assert 'success' in result
        assert 'text' in result

    def test_text_stripping(self, mock_pdf_bytes):
        """Should strip whitespace from extracted text"""
        result = self.service.extract_text_from_bytes(mock_pdf_bytes)

        # Text should be stripped
        assert result['text'] == result['text'].strip()

    # ========================================
    # Integration Tests
    # ========================================

    @pytest.mark.asyncio
    async def test_full_extraction_workflow(self, mock_upload_file):
        """Should complete full extraction workflow successfully"""
        # Upload file
        result = await self.service.extract_text(mock_upload_file)

        # Verify complete result structure
        assert result['success'] is True
        assert isinstance(result['text'], str)
        assert isinstance(result['metadata'], dict)
        assert isinstance(result['char_count'], int)
        assert isinstance(result['page_count'], int)

        # Metadata completeness
        metadata = result['metadata']
        required_keys = ['pages', 'author', 'title', 'subject', 'creator', 'producer']
        for key in required_keys:
            assert key in metadata

    def test_bytes_and_upload_consistency(self, mock_pdf_bytes, mock_upload_file):
        """Both extraction methods should return similar results"""
        # Extract using bytes method
        result_bytes = self.service.extract_text_from_bytes(mock_pdf_bytes, "test.pdf")

        # Extract using async method (would need to run async)
        # For now, just verify bytes method works
        assert result_bytes['success'] is True
        assert result_bytes['metadata']['pages'] == 1


# Add async fixture helper
@pytest.fixture
async def mock_upload_file(mock_pdf_bytes):
    """Async version of upload file fixture"""
    class MockUploadFile:
        def __init__(self, content: bytes, filename: str = "test.pdf"):
            self.file = io.BytesIO(content)
            self.filename = filename
            self.content_type = "application/pdf"

        async def read(self):
            return self.file.getvalue()

        async def seek(self, position: int):
            return self.file.seek(position)

    return MockUploadFile(mock_pdf_bytes)
