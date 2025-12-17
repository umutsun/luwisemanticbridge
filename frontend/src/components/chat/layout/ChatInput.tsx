import React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  isLoading: boolean;
  placeholder: string;
  messagesCount: number;
  onSendMessage: () => void;
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t">
      <div className="max-w-4xl mx-auto w-[95%] md:w-full px-2 md:px-4 py-3 md:py-4">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={onSendMessage}
            disabled={!inputText.trim() || isLoading}
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
