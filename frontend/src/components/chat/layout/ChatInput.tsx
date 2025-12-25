'use client';

import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, Paperclip, Mic, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { PdfPreviewChip } from '@/components/chat/pdf-preview-chip';
import { useVoiceRecording } from '@/lib/hooks/use-voice-recording';

interface VoiceSettings {
  enableVoiceInput: boolean;
  enableVoiceOutput: boolean;
  maxRecordingSeconds: number;
}

interface PdfSettings {
  enabled: boolean;
  maxSizeMB: number;
  maxPages: number;
}

interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  isLoading: boolean;
  placeholder: string;
  messagesCount: number;
  onSendMessage: (pdfFile?: File) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  setInputText,
  isLoading,
  placeholder,
  messagesCount,
  onSendMessage,
  textareaRef
}) => {
  const { t } = useTranslation();

  // PDF upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfSettings, setPdfSettings] = useState<PdfSettings>({ enabled: false, maxSizeMB: 10, maxPages: 30 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice settings state
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    enableVoiceInput: false,
    enableVoiceOutput: false,
    maxRecordingSeconds: 60
  });

  // API URL
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

  // Voice recording hook
  const {
    isRecording,
    isTranscribing,
    recordingDuration,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    maxDurationSeconds: voiceSettings.maxRecordingSeconds,
    onTranscription: (text) => {
      if (text) {
        setInputText(inputText ? `${inputText} ${text}` : text);
      }
    },
    onError: (error) => {
      console.error('[ChatInput] Voice recording error:', error);
    }
  });

  // Fetch PDF settings
  useEffect(() => {
    fetchWithAuth(`${apiUrl}/api/v2/chat/pdf-settings`)
      .then(res => res.json())
      .then(data => {
        setPdfSettings({
          enabled: data.enabled || false,
          maxSizeMB: data.maxSizeMB || 10,
          maxPages: data.maxPages || 30
        });
        console.log('[ChatInput] PDF settings loaded:', data);
      })
      .catch(err => {
        console.error('[ChatInput] Failed to fetch PDF settings:', err);
      });
  }, [apiUrl]);

  // Fetch Voice settings
  useEffect(() => {
    fetchWithAuth(`${apiUrl}/api/v2/chat/voice-settings`)
      .then(res => res.json())
      .then(data => {
        setVoiceSettings({
          enableVoiceInput: data.enableVoiceInput || false,
          enableVoiceOutput: data.enableVoiceOutput || false,
          maxRecordingSeconds: data.maxRecordingSeconds || 60
        });
        console.log('[ChatInput] Voice settings loaded:', data);
      })
      .catch(err => {
        console.error('[ChatInput] Failed to fetch voice settings:', err);
      });
  }, [apiUrl]);

  // Handle file selection
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      alert(t('chatInput.pdfOnlyError', 'Sadece PDF dosyalari desteklenir'));
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > pdfSettings.maxSizeMB) {
      alert(t('chatInput.fileTooLarge', `Dosya boyutu ${pdfSettings.maxSizeMB} MB'i gecemez`));
      return;
    }

    setPdfFile(file);
    console.log('[ChatInput] PDF selected:', file.name, `(${fileSizeMB.toFixed(2)} MB)`);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle Paperclip click
  const handlePaperclipClick = () => {
    if (pdfSettings.enabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle remove PDF
  const handleRemovePdf = () => {
    setPdfFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (inputText.trim() && !isLoading) {
      onSendMessage(pdfFile || undefined);
      setPdfFile(null);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t">
      <div className="max-w-4xl mx-auto w-[95%] md:w-full px-2 md:px-4 py-3 md:py-4">
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
          <div className="mb-3">
            <PdfPreviewChip
              filename={pdfFile.name}
              size={pdfFile.size}
              status="ready"
              onRemove={handleRemovePdf}
            />
          </div>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={pdfFile ? t('chatInput.askAboutPdf', 'Bu PDF hakkinda sorunuzu yazin...') : placeholder}
              className="min-h-[60px] max-h-[120px] resize-none pr-20"
              disabled={isLoading || isRecording}
            />

            {/* Action buttons inside textarea area */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              {/* Paperclip button - only visible when PDF upload is enabled */}
              {pdfSettings.enabled && (
                <button
                  onClick={handlePaperclipClick}
                  disabled={isLoading || !!pdfFile || isRecording}
                  className="p-1.5 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={pdfFile ? t('chatInput.pdfAttached', 'PDF eklendi') : t('chatInput.attachPdf', 'PDF ekle')}
                >
                  <Paperclip className="w-4 h-4" />
                </button>
              )}

              {/* Mic button - only visible when voice input is enabled */}
              {voiceSettings.enableVoiceInput && (
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isLoading || isTranscribing}
                  className={`p-1.5 transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                    isRecording
                      ? 'text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-900/20 animate-pulse'
                      : isTranscribing
                        ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title={
                    isRecording
                      ? `${t('chatInput.stopRecording', 'Kaydi durdur')} (${recordingDuration}s)`
                      : isTranscribing
                        ? t('chatInput.transcribing', 'Metne cevriliyor...')
                        : t('chatInput.startRecording', 'Sesle mesaj gonder')
                  }
                >
                  {isRecording ? (
                    <Square className="w-4 h-4" />
                  ) : isTranscribing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>

          <Button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading || isRecording}
            size="lg"
            className="px-8"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            {t('chat.input.help', 'Enter ile gönder, Shift+Enter ile yeni satır')}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{`${messagesCount} ${t('chat.messagesLabel', 'mesaj')}`}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
