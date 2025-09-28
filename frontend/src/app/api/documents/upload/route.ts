import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // File size validation (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = Date.now();
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${originalName}`;
    
    // Define upload directory
    const uploadDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, fileName);

    // Ensure upload directory exists
    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir(uploadDir, { recursive: true });

    // Save file
    await writeFile(filePath, buffer);

    // Process file based on type
    const fileContent = buffer.toString('utf-8');
    const fileType = file.name.split('.').pop()?.toLowerCase() || 'txt';

    // Create document record
    const document = {
      id: `doc_${timestamp}`,
      title: file.name,
      content: fileContent.substring(0, 1000), // Store first 1000 chars as preview
      type: fileType,
      size: file.size,
      path: filePath,
      createdAt: new Date().toISOString(),
      metadata: {
        fileName: file.name,
        mimeType: file.type,
        chunks: 0,
        embeddings: false
      }
    };

    // Here you would typically:
    // 1. Save document to database
    // 2. Generate embeddings if needed
    // 3. Process content (chunking, etc.)
    
    // For now, we'll return the document info
    return NextResponse.json({
      success: true,
      document: document,
      message: 'File uploaded successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};