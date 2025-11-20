'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Search,
  RotateCw,
  Maximize2,
  Minimize2,
  FileText,
  Loader2,
  Eye,
  EyeOff,
  Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PDFPage {
  page: number;
  text: string;
  extracted?: string;
  confidence?: number;
}

interface PDFViewerProps {
  data: string;
  title?: string;
  className?: string;
  metadata?: {
    ocr_processed?: boolean;
    totalPages?: number;
    extractionMethod?: string;
  };
}

export default function PDFViewer({ data, title = "PDF Document", className = "", metadata }: PDFViewerProps) {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExtracted, setShowExtracted] = useState(false);
  const [isRotated, setIsRotated] = useState(false);
  const [searchResults, setSearchResults] = useState<{ page: number; index: number }[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  // Parse PDF text from backend
  const { pages, totalPages } = useMemo(() => {
    if (!data) return { pages: [], totalPages: 0 };

    // Try to parse structured PDF output from contextual processor
    const pageMatches = data.match(/\[Page (\d+)\]([\s\S]*?)(?=\[Page \d+\]|$)/g);

    if (pageMatches) {
      const pages = pageMatches.map((match, index) => {
        const pageNum = index + 1;
        const text = match.replace(/\[Page \d+\]/, '').trim();

        // Check if this page has OCR extracted content
        const ocrMatch = text.match(/OCR Extracted:[\s\S]*?Confidence: (\d+\.?\d*)%/);
        const extracted = ocrMatch ? text.match(/OCR Extracted:([\s\S]*?)(?=Confidence:|$)/)?.[1]?.trim() : null;
        const confidence = ocrMatch ? parseFloat(ocrMatch[1]) : null;

        return {
          page: pageNum,
          text: extracted ? text.replace(/OCR Extracted:[\s\S]*?Confidence: \d+\.?\d*%/, '').trim() : text,
          extracted,
          confidence
        };
      });

      return { pages, totalPages: pages.length };
    }

    // Fallback: split by page breaks
    const fallbackPages = data.split(/\n{3,}/).filter(p => p.trim());
    return {
      pages: fallbackPages.map((text, index) => ({
        page: index + 1,
        text: text.trim()
      })),
      totalPages: fallbackPages.length
    };
  }, [data]);

  // Search functionality
  useEffect(() => {
    if (!searchTerm) {
      setSearchResults([]);
      return;
    }

    const results: { page: number; index: number }[] = [];
    pages.forEach((page, pageIndex) => {
      const text = showExtracted && page.extracted ? page.extracted : page.text;
      const regex = new RegExp(searchTerm, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        results.push({ page: pageIndex + 1, index: match.index });
      }
    });

    setSearchResults(results);
    setCurrentSearchIndex(0);
  }, [searchTerm, pages, showExtracted]);

  const goToSearchResult = (index: number) => {
    if (index < 0 || index >= searchResults.length) return;

    const result = searchResults[index];
    setCurrentPage(result.page);
    setCurrentSearchIndex(index);
  };

  const nextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  const prevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  
  const copyPageText = () => {
    const page = pages[currentPage - 1];
    const text = showExtracted && page.extracted ? page.extracted : page.text;

    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `Page ${currentPage} text copied to clipboard`
    });
  };

  if (totalPages === 0) {
    return (
      <div className={`p-6 text-center text-muted-foreground ${className}`}>
        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No PDF content available</p>
      </div>
    );
  }

  const currentPageData = pages[currentPage - 1];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
          </h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{totalPages} pages</span>
            {metadata?.ocr_processed && (
              <Badge variant="secondary">OCR Processed</Badge>
            )}
            {currentPageData?.confidence && (
              <Badge variant="outline">
                Confidence: {currentPageData.confidence.toFixed(1)}%
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExtracted(!showExtracted)}
            disabled={!currentPageData?.extracted}
          >
            {showExtracted ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showExtracted ? 'Original' : 'OCR'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsRotated(!isRotated)}
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search in document..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Search Navigation */}
        {searchResults.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToSearchResult(currentSearchIndex - 1)}
              disabled={currentSearchIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              {currentSearchIndex + 1} / {searchResults.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToSearchResult(currentSearchIndex + 1)}
              disabled={currentSearchIndex === searchResults.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Zoom Control */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(prev => Math.max(50, prev - 25))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-12 text-center">{zoom}%</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(prev => Math.min(200, prev + 25))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Page Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={prevPage}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Input
            type="number"
            min="1"
            max={totalPages}
            value={currentPage}
            onChange={(e) => {
              const page = parseInt(e.target.value);
              if (page >= 1 && page <= totalPages) {
                setCurrentPage(page);
              }
            }}
            className="w-16 text-center"
          />
        </div>
        <Button
          variant="outline"
          onClick={nextPage}
          disabled={currentPage === totalPages}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {/* Content Area */}
      <div className={`border rounded-lg ${isFullscreen ? 'fixed inset-4 z-50 bg-background' : ''}`}>
        <ScrollArea className={isFullscreen ? 'h-[calc(100vh-12rem)]' : 'h-[60vh]'}>
          <div
            className="p-6 whitespace-pre-wrap font-mono text-sm leading-relaxed"
            style={{
              transform: `scale(${zoom / 100}) ${isRotated ? 'rotate(90deg)' : ''}`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s'
            }}
          >
            {showExtracted && currentPageData?.extracted ? (
              <div className="space-y-4">
                {currentPageData.confidence && (
                  <div className="text-xs text-muted-foreground border-b pb-2">
                    OCR Extracted (Confidence: {currentPageData.confidence.toFixed(1)}%)
                  </div>
                )}
                <div>{currentPageData.extracted}</div>
              </div>
            ) : (
              <div>{currentPageData?.text || 'No content available'}</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {currentPageData?.extracted && (
            <span>OCR Available • </span>
          )}
          <span>
            ~{currentPageData?.text?.length || 0} characters
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyPageText}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Text
          </Button>
        </div>
      </div>
    </div>
  );
}