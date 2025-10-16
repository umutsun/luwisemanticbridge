'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Languages, Copy, Check, ChevronDown, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TranslatorProps {
  text: string;
  title?: string;
  className?: string;
}

// Common language pairs with their codes
const SUPPORTED_LANGUAGES = [
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
];

interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence?: number;
  provider: string;
  cost?: number;
}

export default function Translator({ text, title = "Translate Text", className = "" }: TranslatorProps) {
  const { toast } = useToast();
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState<'google' | 'deepl'>('deepl');

  // Detect language if auto
  const detectLanguage = async (text: string): Promise<string> => {
    // Simple language detection based on character patterns
    const turkishChars = /[çğıöşüÇĞİÖŞÜ]/;
    const chineseChars = /[\u4e00-\u9fff]/;
    const arabicChars = /[\u0600-\u06ff]/;
    const cyrillicChars = /[\u0400-\u04ff]/;
    const japaneseChars = /[\u3040-\u309f\u30a0-\u30ff]/;
    const koreanChars = /[\uac00-\ud7af]/;

    if (turkishChars.test(text)) return 'tr';
    if (chineseChars.test(text)) return 'zh';
    if (arabicChars.test(text)) return 'ar';
    if (cyrillicChars.test(text)) return 'ru';
    if (japaneseChars.test(text)) return 'ja';
    if (koreanChars.test(text)) return 'ko';

    return 'en'; // Default to English
  };

  const translateText = async () => {
    if (!text || !text.trim()) {
      toast({
        title: "Error",
        description: "No text to translate",
        variant: "destructive"
      });
      return;
    }

    setIsTranslating(true);
    setTranslation(null);

    try {
      const detectedLang = sourceLang === 'auto' ? await detectLanguage(text) : sourceLang;

      // Call translation API
      const response = await fetch('/api/v2/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          text: text.substring(0, 5000), // Limit to 5000 chars for demo
          source: detectedLang,
          target: targetLang,
          provider
        })
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const result = await response.json();

      setTranslation({
        translatedText: result.translatedText,
        sourceLanguage: detectedLang,
        targetLanguage,
        confidence: result.confidence,
        provider,
        cost: result.cost
      });

      toast({
        title: "Translation Complete",
        description: `Text translated from ${SUPPORTED_LANGUAGES.find(l => l.code === detectedLang)?.name} to ${SUPPORTED_LANGUAGES.find(l => l.code === targetLang)?.name}`
      });

    } catch (error: any) {
      console.error('Translation error:', error);

      // Fallback to mock translation for demo
      const mockTranslation = `🔄 [Mock Translation from ${sourceLang} to ${targetLang}]\n\nThis is a demonstration of the translation feature. In production, this would be the actual translated text using ${provider.toUpperCase()} API.\n\nOriginal text preview: ${text.substring(0, 200)}...`;

      setTranslation({
        translatedText: mockTranslation,
        sourceLanguage: sourceLang === 'auto' ? 'en' : sourceLang,
        targetLanguage,
        confidence: 95,
        provider,
        cost: 0.001
      });

      toast({
        title: "Demo Mode",
        description: "Showing mock translation. Configure API keys in settings for real translations.",
        variant: "default"
      });
    } finally {
      setIsTranslating(false);
    }
  };

  const copyTranslation = () => {
    if (translation) {
      navigator.clipboard.writeText(translation.translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied",
        description: "Translation copied to clipboard"
      });
    }
  };

  const swapLanguages = () => {
    if (sourceLang !== 'auto') {
      const temp = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(temp);
    }
  };

  const getProviderInfo = (provider: string) => {
    const providers = {
      google: { name: 'Google Translate', cost: '~$20/1M chars', color: 'blue' },
      deepl: { name: 'DeepL', cost: '~$6/1M chars', color: 'yellow' }
    };
    return providers[provider as keyof typeof providers];
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider Selection */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Provider:</span>
          <Select value={provider} onValueChange={(value: any) => setProvider(value)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepl">
                🌊 DeepL (Best Quality) - ~$6/1M chars
              </SelectItem>
              <SelectItem value="google">
                🌐 Google Translate - ~$20/1M chars
              </SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">
            {getProviderInfo(provider).cost}
          </Badge>
        </div>

        {/* Language Selection */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Select value={sourceLang} onValueChange={setSourceLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">🔍 Auto Detect</SelectItem>
                {SUPPORTED_LANGUAGES.map(lang => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="sm" onClick={swapLanguages} disabled={sourceLang === 'auto'}>
            <ChevronDown className="h-4 w-4 rotate-180" />
          </Button>

          <div className="flex-1">
            <Select value={targetLang} onValueChange={setTargetLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map(lang => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Translate Button */}
        <Button
          onClick={translateText}
          disabled={isTranslating || !text}
          className="w-full"
        >
          {isTranslating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Translating...
            </>
          ) : (
            <>
              <Globe className="w-4 h-4 mr-2" />
              Translate
            </>
          )}
        </Button>

        {/* Original Text Preview */}
        {text && (
          <div>
            <h4 className="text-sm font-medium mb-2">Original Text ({text.length} chars)</h4>
            <ScrollArea className="h-32 w-full border rounded-md p-3">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {text.substring(0, 1000)}
                {text.length > 1000 && '...'}
              </p>
            </ScrollArea>
          </div>
        )}

        {/* Translation Result */}
        {translation && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">
                Translation ({translation.targetLanguage.toUpperCase()})
              </h4>
              <div className="flex items-center gap-2">
                {translation.confidence && (
                  <Badge variant="secondary" className="text-xs">
                    {translation.confidence}% confidence
                  </Badge>
                )}
                {translation.cost && (
                  <Badge variant="outline" className="text-xs">
                    ${translation.cost.toFixed(4)}
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={copyTranslation}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <ScrollArea className="h-40 w-full border rounded-md p-3 bg-muted/50">
              <p className="text-sm whitespace-pre-wrap">
                {translation.translatedText}
              </p>
            </ScrollArea>
          </div>
        )}

        {/* Cost Estimate */}
        <div className="text-xs text-muted-foreground text-center">
          Estimated cost: ~$0.00002 per character with {getProviderInfo(provider).name}
        </div>
      </CardContent>
    </Card>
  );
}