'use client';

import { useState, KeyboardEvent, useEffect, useCallback, useRef, ChangeEvent } from 'react';
import { Send, Paperclip, Sparkles, RefreshCw, Loader2, Mic, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { PdfPreviewChip } from './pdf-preview-chip';
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
  onSend: (message: string, pdfFile?: File) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [sampleQuestions, setSampleQuestions] = useState<string[]>([]);
  const [placeholder, setPlaceholder] = useState(t('chatInput.defaultPlaceholder'));
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

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
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  // Voice recording hook
  const {
    isRecording,
    isTranscribing,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording
  } = useVoiceRecording({
    maxDurationSeconds: voiceSettings.maxRecordingSeconds,
    onTranscription: (text) => {
      if (text) {
        setMessage(prev => prev ? `${prev} ${text}` : text);
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

  // Fetch suggested questions from backend (respects RAG settings and user's active schema)
  const fetchSuggestedQuestions = useCallback(async () => {
    setIsLoadingSuggestions(true);
    try {
      const response = await fetchWithAuth(`${apiUrl}/api/v2/chat/suggestions`);
      if (response.ok) {
        const data = await response.json();
        if (data.suggestions && data.suggestions.length > 0) {
          // Backend returned schema-aware questions
          setSampleQuestions(data.suggestions.slice(0, 4));
          console.log('[ChatInput] Loaded schema-aware suggestions:', data.suggestions.length);
          return;
        }
      }
      // Fallback: use empty array if backend returns no suggestions
      console.log('[ChatInput] No schema-aware suggestions from backend');
      setSampleQuestions([]);
    } catch (err) {
      console.error('[ChatInput] Failed to fetch suggestions:', err);
      setSampleQuestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [apiUrl]);

  // Refresh questions - fetch from backend
  const refreshQuestions = useCallback(() => {
    fetchSuggestedQuestions();
  }, [fetchSuggestedQuestions]);

  useEffect(() => {
    // Fetch suggested questions from backend
    fetchSuggestedQuestions();

    // Fetch chatbot settings for placeholder
    fetch(`${apiUrl}/api/v2/chatbot/settings`)
      .then(res => res.json())
      .then(data => {
        if (data.placeholder) {
          setPlaceholder(data.placeholder);
        }
      })
      .catch(err => console.error('Failed to fetch chatbot settings:', err));
  }, [apiUrl, fetchSuggestedQuestions]);

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

  // Handle send
  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim(), pdfFile || undefined);
      setMessage('');
      setPdfFile(null);
    }
  };

  // Handle remove PDF
  const handleRemovePdf = () => {
    setPdfFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 bg-gradient-to-t from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900/50 backdrop-blur-sm">
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
          <div className="mb-3">
            <PdfPreviewChip
              filename={pdfFile.name}
              size={pdfFile.size}
              status="ready"
              onRemove={handleRemovePdf}
            />
          </div>
        )}

        {/* Suggested questions from backend (RAG settings aware) */}
        {!message && !pdfFile && (
          <div className="mb-3 flex items-center gap-2 flex-wrap min-h-[32px]">
            {isLoadingSuggestions ? (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('chatInput.loadingSuggestions', 'Oneriler yukleniyor...')}
              </span>
            ) : sampleQuestions.length > 0 ? (
              <>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {t('chatInput.exampleQuestions')}
                </span>
                {sampleQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => setMessage(q)}
                    className="text-xs px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 max-w-[300px] truncate"
                    title={q}
                  >
                    {q.length > 60 ? q.substring(0, 60) + '...' : q}
                  </button>
                ))}
                <button
                  onClick={refreshQuestions}
                  disabled={isLoadingSuggestions}
                  className="text-xs p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                  title={t('common.refresh')}
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingSuggestions ? 'animate-spin' : ''}`} />
                </button>
              </>
            ) : null}
          </div>
        )}
        <div className="flex items-end gap-2 bg-white dark:bg-gray-800 rounded-2xl p-2 sm:p-3 shadow-lg border border-gray-200/80 dark:border-gray-700/80 backdrop-blur-sm">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={pdfFile ? t('chatInput.askAboutPdf', 'Bu PDF hakkinda sorunuzu yazin...') : placeholder}
            disabled={disabled}
            className="flex-1 min-h-[40px] sm:min-h-[44px] max-h-[120px] p-2 bg-transparent resize-none focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50 transition-all duration-200 text-sm"
            rows={1}
            style={{ lineHeight: '1.5' }}
          />

          {/* Action buttons - mobile responsive, minimal */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            {/* Paperclip button - only visible when PDF upload is enabled */}
            {pdfSettings.enabled && (
              <button
                onClick={handlePaperclipClick}
                disabled={disabled || !!pdfFile || isRecording}
                className="p-1.5 sm:p-2 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={pdfFile ? t('chatInput.pdfAttached', 'PDF eklendi') : t('chatInput.attachPdf', 'PDF ekle')}
              >
                <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            {/* Mic button - only visible when voice input is enabled */}
            {voiceSettings.enableVoiceInput && (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={disabled || isTranscribing}
                className={`p-1.5 sm:p-2 transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
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
                  <Square className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : isTranscribing ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>
            )}

            <button
              onClick={handleSend}
              disabled={disabled || !message.trim() || isRecording}
              className="p-1.5 sm:p-2 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              title={t('chatInput.sendMessage')}
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 px-2 sm:px-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('chatInput.sendHint')}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            {t('chatInput.systemStatus')}
          </p>
        </div>
      </div>
    </div>
  );
}
