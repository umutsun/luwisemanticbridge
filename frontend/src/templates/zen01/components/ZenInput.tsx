'use client';

import React, { useRef, useState, useMemo, ChangeEvent } from 'react';
import { Send, Paperclip, X, FileText, Mic, Square, Loader2, Command } from 'lucide-react';
import { useVoiceRecording } from '@/lib/hooks/use-voice-recording';
import type { ZenInputProps, SlashCommand, SlashCommandSubmenuItem } from '../types';
import { SlashCommandAutocomplete } from './SlashCommandAutocomplete';
import { SLASH_COMMANDS, filterCommands } from '../config/slashCommands';

/**
 * Zen01 Input Component
 * Floating input area with textarea, PDF upload, voice input, and send button
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
  voiceSettings,
  onSlashCommand,
  historyPanel,
  suggestPanel,
  recentConversations,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Slash command autocomplete state
  const [showSlashAutocomplete, setShowSlashAutocomplete] = useState(false);
  const [slashSearchText, setSlashSearchText] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Build commands with dynamic submenu for /suggest
  const commandsWithDynamicSubmenu = useMemo(() => {
    return SLASH_COMMANDS.map(cmd => {
      if (cmd.hasDynamicSubmenu && cmd.id === 'suggest' && recentConversations) {
        return {
          ...cmd,
          submenuItems: recentConversations.slice(0, 12).map(conv => ({
            id: conv.id,
            label: conv.title,
            conversationId: conv.id
          }))
        };
      }
      return cmd;
    });
  }, [recentConversations]);

  // Get filtered commands based on search
  const filteredCommands = useMemo(() => {
    if (!slashSearchText) return commandsWithDynamicSubmenu;
    const search = slashSearchText.toLowerCase();
    return commandsWithDynamicSubmenu.filter(cmd =>
      cmd.trigger.toLowerCase().includes('/' + search) ||
      cmd.trigger.toLowerCase().slice(1).startsWith(search) ||
      cmd.label.toLowerCase().includes(search)
    );
  }, [slashSearchText, commandsWithDynamicSubmenu]);

  // Voice recording hook
  const {
    isRecording,
    isTranscribing,
    recordingDuration,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    maxDurationSeconds: voiceSettings?.maxRecordingSeconds || 60,
    onTranscription: (text) => {
      if (text) {
        onChange(value ? `${value} ${text}` : text);
      }
    },
    onError: (error) => {
      console.error('[ZenInput] Voice recording error:', error);
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle slash command autocomplete navigation
    if (showSlashAutocomplete && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(prev =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommandSelect(filteredCommands[selectedCommandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashAutocomplete(false);
        onChange('');
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        handleCommandSelect(filteredCommands[selectedCommandIndex]);
        return;
      }
    }

    // Normal enter handling
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle input change with slash command detection
  const handleInputChange = (newValue: string) => {
    onChange(newValue);

    // Check if input starts with "/" for slash commands
    if (newValue.startsWith('/')) {
      setShowSlashAutocomplete(true);
      setSlashSearchText(newValue.slice(1)); // Text after "/"
      setSelectedCommandIndex(0);
    } else {
      setShowSlashAutocomplete(false);
      setSlashSearchText('');
    }
  };

  // Handle command selection (with optional submenu item)
  const handleCommandSelect = (command: SlashCommand, submenuItem?: SlashCommandSubmenuItem) => {
    setShowSlashAutocomplete(false);
    setSlashSearchText('');
    onChange(''); // Clear input

    if (onSlashCommand) {
      // If submenu item selected, create a modified command with targetLanguage
      if (submenuItem) {
        const modifiedCommand: SlashCommand = {
          ...command,
          targetLanguage: submenuItem.targetLanguage,
          id: `${command.id}-${submenuItem.id}`
        };
        onSlashCommand(modifiedCommand);
      } else {
        onSlashCommand(command);
      }
    }
  };

  // Open slash command menu via button
  const handleSlashButtonClick = () => {
    setShowSlashAutocomplete(true);
    setSlashSearchText('');
    setSelectedCommandIndex(0);
    onChange('/');
    textareaRef?.current?.focus();
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
            <div className="zen01-pdf-chip inline-flex items-center gap-2 px-3 py-2 rounded-lg">
              <FileText className="h-4 w-4" />
              <span className="text-sm max-w-[200px] truncate font-medium">
                {pdfFile.name}
              </span>
              <span className="text-xs opacity-70">
                ({formatFileSize(pdfFile.size)})
              </span>
              <button
                onClick={handleRemovePdf}
                className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
                title="PDF'i kaldır"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="zen01-input flex items-end gap-3 p-3 relative">
          {/* History Panel - renders above input */}
          {historyPanel}

          {/* Suggest Panel - renders above input */}
          {suggestPanel}

          {/* Slash Command Autocomplete */}
          <SlashCommandAutocomplete
            isOpen={showSlashAutocomplete}
            commands={filteredCommands}
            selectedIndex={selectedCommandIndex}
            onSelect={handleCommandSelect}
            onClose={() => setShowSlashAutocomplete(false)}
          />

          {/* Paperclip button - only visible when PDF upload is enabled */}
          {pdfSettings?.enabled && (
            <button
              onClick={handlePaperclipClick}
              disabled={isLoading || !!pdfFile || isRecording}
              className={`p-2 rounded-lg transition-colors ${
                pdfFile
                  ? 'text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/20 cursor-not-allowed'
                  : 'text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10'
              } disabled:opacity-50`}
              title={pdfFile ? 'PDF eklendi' : 'PDF ekle'}
            >
              <Paperclip className="h-5 w-5" />
            </button>
          )}

          {/* Slash command button */}
          <button
            onClick={handleSlashButtonClick}
            disabled={isLoading || isRecording}
            className={`p-2 rounded-lg transition-colors ${
              showSlashAutocomplete
                ? 'text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/20'
                : 'text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10'
            } disabled:opacity-50`}
            title="Komutlar"
          >
            <Command className="h-5 w-5" />
          </button>

          {/* Mic button - only visible when voice input is enabled */}
          {voiceSettings?.enableVoiceInput && (
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading || isTranscribing}
              className={`p-2 rounded-lg transition-colors ${
                isRecording
                  ? 'text-rose-500 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/20 animate-pulse'
                  : isTranscribing
                    ? 'text-cyan-500 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/20'
                    : 'text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10'
              } disabled:opacity-50`}
              title={
                isRecording
                  ? `Kaydı durdur (${recordingDuration}s)`
                  : isTranscribing
                    ? 'Metne çevriliyor...'
                    : 'Sesle mesaj gönder'
              }
            >
              {isRecording ? (
                <Square className="h-5 w-5" />
              ) : isTranscribing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRecording
                ? `Kayıt yapılıyor... (${recordingDuration}s)`
                : isTranscribing
                  ? 'Metne çevriliyor...'
                  : pdfFile
                    ? 'Bu PDF hakkında sorunuzu yazın...'
                    : (placeholder || 'Ask anything...')
            }
            rows={1}
            disabled={isRecording || isTranscribing}
            className="flex-1 bg-transparent border-none text-slate-800 dark:text-cyan-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none focus:outline-none focus:ring-0 py-2 px-3 text-sm disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={(!value.trim() && !pdfFile) || isLoading || isRecording}
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
