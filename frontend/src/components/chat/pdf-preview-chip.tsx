'use client';

import { FileText, X, Loader2 } from 'lucide-react';

interface PdfPreviewChipProps {
  filename: string;
  size: number;
  status?: 'ready' | 'uploading' | 'processing';
  onRemove: () => void;
}

export function PdfPreviewChip({ filename, size, status = 'ready', onRemove }: PdfPreviewChipProps) {
  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Truncate filename if too long
  const displayName = filename.length > 25
    ? filename.substring(0, 22) + '...'
    : filename;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20
                    border border-blue-200 dark:border-blue-800 rounded-lg max-w-full sm:max-w-[300px]
                    transition-all duration-200 hover:bg-blue-100 dark:hover:bg-blue-900/30">
      {/* PDF Icon or Loading */}
      {status === 'uploading' || status === 'processing' ? (
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
      ) : (
        <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
      )}

      {/* Filename */}
      <span
        className="text-sm text-blue-700 dark:text-blue-300 truncate"
        title={filename}
      >
        {displayName}
      </span>

      {/* File size */}
      <span className="text-xs text-blue-500 dark:text-blue-400 flex-shrink-0 hidden sm:inline">
        ({formatSize(size)})
      </span>

      {/* Status indicator */}
      {status === 'uploading' && (
        <span className="text-xs text-blue-400 dark:text-blue-500 flex-shrink-0">
          Yukleniyor...
        </span>
      )}
      {status === 'processing' && (
        <span className="text-xs text-blue-400 dark:text-blue-500 flex-shrink-0">
          Isleniyor...
        </span>
      )}

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-700 rounded transition-colors
                   flex-shrink-0 ml-1"
        title="Dosyayi kaldir"
        disabled={status === 'uploading' || status === 'processing'}
      >
        <X className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
      </button>
    </div>
  );
}
