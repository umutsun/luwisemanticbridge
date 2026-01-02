'use client';

import React, { useRef, ChangeEvent } from 'react';
import { Send, Paperclip, X, FileText } from 'lucide-react';
import type { ZenInputProps } from '../types';

/**
 * Zen01 Input Component
 * Floating input area with textarea, PDF upload, and send button
 */
export const ZenInput: React.FC<ZenInputProps> = ({
  value,
  onChange,
  onSend,
  placeholder,
  isLoading,
  textareaRef,
  pdfSettings,
  pdfFile,
  onPdfSelect,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (value.trim() || pdfFile) {
      onSend(pdfFile || undefined);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onPdfSelect) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      alert('Sadece PDF dosyaları desteklenir');
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (pdfSettings && fileSizeMB > pdfSettings.maxSizeMB) {
      alert(`Dosya boyutu ${pdfSettings.maxSizeMB} MB'i geçemez`);
      return;
    }

    onPdfSelect(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaperclipClick = () => {
    if (pdfSettings?.enabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemovePdf = () => {
    if (onPdfSelect) {
      onPdfSelect(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="zen01-input-container">
      <div className="max-w-4xl mx-auto">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* PDF Preview Chip */}
        {pdfFile && (
          <div className="mb-3 px-3">
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-lg">
              <FileText className="h-4 w-4 text-cyan-400" />
              <span className="text-sm text-cyan-300 max-w-[200px] truncate">
                {pdfFile.name}
              </span>
              <span className="text-xs text-cyan-400/60">
                ({formatFileSize(pdfFile.size)})
              </span>
              <button
                onClick={handleRemovePdf}
                className="p-1 hover:bg-cyan-500/30 rounded transition-colors"
                title="PDF'i kaldır"
              >
                <X className="h-3.5 w-3.5 text-cyan-400" />
              </button>
            </div>
          </div>
        )}

        <div className="zen01-input flex items-end gap-3 p-3">
          {/* Paperclip button - only visible when PDF upload is enabled */}
          {pdfSettings?.enabled && (
            <button
              onClick={handlePaperclipClick}
              disabled={isLoading || !!pdfFile}
              className={`p-2 rounded-lg transition-colors ${
                pdfFile
                  ? 'text-cyan-400 bg-cyan-500/20 cursor-not-allowed'
                  : 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
              } disabled:opacity-50`}
              title={pdfFile ? 'PDF eklendi' : 'PDF ekle'}
            >
              <Paperclip className="h-5 w-5" />
            </button>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pdfFile ? 'Bu PDF hakkında sorunuzu yazın...' : (placeholder || 'Ask anything...')}
            rows={1}
            className="flex-1 bg-transparent border-none text-cyan-100 placeholder:text-slate-500 resize-none focus:outline-none focus:ring-0 py-2 px-3 text-sm"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={(!value.trim() && !pdfFile) || isLoading}
            className="zen01-send-btn"
            aria-label="Send message"
          >
            {isLoading ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="h-4 w-4 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZenInput;
