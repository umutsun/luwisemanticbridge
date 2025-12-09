"""
Pytest configuration and fixtures
"""

import pytest
import io
from PyPDF2 import PdfWriter


@pytest.fixture
def mock_pdf_bytes():
    """Create a simple valid PDF file in bytes"""
    # Create a minimal PDF with PyPDF2
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)

    # Add metadata
    writer.add_metadata({
        '/Author': 'Test Author',
        '/Title': 'Test PDF Document',
        '/Subject': 'Testing',
        '/Creator': 'PyPDF2 Test',
        '/Producer': 'Test Producer'
    })

    # Write to bytes
    pdf_bytes = io.BytesIO()
    writer.write(pdf_bytes)
    pdf_bytes.seek(0)

    return pdf_bytes.getvalue()


@pytest.fixture
def mock_pdf_with_text():
    """Create a PDF with some text content"""
    # Note: PyPDF2 cannot easily add text to PDFs
    # This would need reportlab for proper text addition
    # For now, we'll use a blank PDF
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)

    pdf_bytes = io.BytesIO()
    writer.write(pdf_bytes)
    pdf_bytes.seek(0)

    return pdf_bytes.getvalue()


@pytest.fixture
def mock_corrupted_pdf():
    """Create corrupted PDF bytes"""
    return b"This is not a valid PDF content"


@pytest.fixture
def mock_empty_pdf():
    """Create empty PDF bytes"""
    return b""


@pytest.fixture
def mock_upload_file(mock_pdf_bytes):
    """Mock FastAPI UploadFile object"""
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


@pytest.fixture
def mock_upload_file_corrupted(mock_corrupted_pdf):
    """Mock corrupted FastAPI UploadFile"""
    class MockUploadFile:
        def __init__(self, content: bytes, filename: str = "corrupted.pdf"):
            self.file = io.BytesIO(content)
            self.filename = filename
            self.content_type = "application/pdf"

        async def read(self):
            return self.file.getvalue()

        async def seek(self, position: int):
            return self.file.seek(position)

    return MockUploadFile(mock_corrupted_pdf)
