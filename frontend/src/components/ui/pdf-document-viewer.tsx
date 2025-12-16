'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  FileText,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface PDFDocumentViewerProps {
  /** Modal open state */
  isOpen: boolean;
  /** Callback to close modal */
  onClose: () => void;
  /** Document ID to fetch PDF from backend */
  documentId: string;
  /** Optional title */
  title?: string;
  /** Optional filename for download */
  filename?: string;
  /** API base URL */
  apiBaseUrl?: string;
}

export default function PDFDocumentViewer({
  isOpen,
  onClose,
  documentId,
  title,
  filename,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3002'
}: PDFDocumentViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Construct PDF URL
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const pdfUrl = `${apiBaseUrl}/api/v2/documents/pdf/${documentId}?token=${token}`;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = filename || 'document.pdf';
    link.click();
  };

  const handleExternalLink = () => {
    window.open(pdfUrl, '_blank');
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50));
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load PDF');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`
          ${isFullscreen ? 'max-w-[95vw] h-[95vh]' : 'max-w-5xl max-h-[85vh]'}
          overflow-hidden flex flex-col p-0
        `}
      >
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-red-600 dark:text-red-400" />
              <div>
                <DialogTitle className="text-xl font-semibold">
                  {title || filename || 'PDF Viewer'}
                </DialogTitle>
                {filename && title !== filename && (
                  <p className="text-sm text-muted-foreground mt-1">{filename}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 border rounded-md px-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                  className="h-7 w-7 p-0"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Badge variant="outline" className="text-xs px-2">
                  {zoom}%
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomIn}
                  disabled={zoom >= 200}
                  className="h-7 w-7 p-0"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>

              {/* Fullscreen Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>

              {/* External Link */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExternalLink}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open
              </Button>

              {/* Download Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* PDF Viewer */}
        <div className="flex-1 min-h-0 bg-gray-100 dark:bg-gray-900 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading PDF...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            </div>
          )}

          <iframe
            src={`${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1&zoom=${zoom}`}
            className="w-full h-full border-0"
            title={title || filename || 'PDF Document'}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
