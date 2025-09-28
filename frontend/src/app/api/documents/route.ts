import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

// In-memory storage for demo (should use database in production)
let documents: any[] = [];

export async function GET(request: NextRequest) {
  try {
    // Read documents from uploads directory
    const uploadDir = path.join(process.cwd(), 'uploads');
    let realDocuments: any[] = [];
    
    try {
      const { readdir, stat } = await import('fs/promises');
      const files = await readdir(uploadDir);
      const docPromises = files.map(async (fileName) => {
        const filePath = path.join(uploadDir, fileName);
        const stats = await stat(filePath);
        const fileType = fileName.split('.').pop()?.toLowerCase() || 'txt';
        
        return {
          id: `doc_${fileName}`,
          title: fileName.replace(/^\d+_/, ''), // Remove timestamp prefix
          type: fileType,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
          metadata: {
            chunks: Math.ceil(stats.size / 1000),
            embeddings: false,
            path: filePath
          }
        };
      });
      
      realDocuments = await Promise.all(docPromises);
    } catch (error) {
      // If uploads directory doesn't exist, create it
      console.log('Uploads directory not found, creating it');
      const { mkdir } = await import('fs/promises');
      await mkdir(uploadDir, { recursive: true });
    }

    // Combine with in-memory documents (newly added via form)
    const allDocuments = [...realDocuments, ...documents];

    return NextResponse.json({
      success: true,
      documents: allDocuments,
      count: allDocuments.length
    });

  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const newDocument = {
      id: `doc_${Date.now()}`,
      title: body.title,
      content: body.content,
      type: body.type || 'text',
      size: new Blob([body.content]).size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        chunks: Math.ceil(body.content.length / 1000),
        embeddings: false
      }
    };

    documents.push(newDocument);

    return NextResponse.json({
      success: true,
      document: newDocument,
      message: 'Document created successfully'
    });

  } catch (error) {
    console.error('Error creating document:', error);
    return NextResponse.json(
      { error: 'Failed to create document' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Document ID required' },
        { status: 400 }
      );
    }

    // Check if it's a file-based document
    if (id.startsWith('doc_')) {
      const fileName = id.replace('doc_', '');
      const uploadDir = path.join(process.cwd(), 'uploads');
      const filePath = path.join(uploadDir, fileName);
      
      try {
        const { unlink } = await import('fs/promises');
        await unlink(filePath);
        console.log('Deleted file:', filePath);
      } catch (error) {
        console.log('File not found or already deleted:', filePath);
      }
    }

    // Also remove from in-memory storage
    documents = documents.filter(doc => doc.id !== id);

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}