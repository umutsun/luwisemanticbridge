'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileSearch,
  MessageSquare,
  Binary,
  ArrowRightLeft,
  HelpCircle,
  Search,
  Save,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';
import { LLMConfig, DEFAULT_LLM_CONFIG, LLM_CONFIG_TABS } from '@/types/data-schema';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface LLMConfigEditorProps {
  config: LLMConfig;
  onChange: (config: LLMConfig) => void;
  onSave?: () => void;
  disabled?: boolean;
  saving?: boolean;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileSearch,
  MessageSquare,
  Binary,
  ArrowRightLeft,
  HelpCircle,
  Search
};

export default function LLMConfigEditor({
  config,
  onChange,
  onSave,
  disabled = false,
  saving = false
}: LLMConfigEditorProps) {
  const [activeTab, setActiveTab] = useState<string>('analyze');
  const [hasChanges, setHasChanges] = useState(false);

  const handleFieldChange = (field: keyof LLMConfig, value: string) => {
    onChange({ ...config, [field]: value });
    setHasChanges(true);
  };

  const handleResetField = (field: keyof LLMConfig) => {
    onChange({ ...config, [field]: DEFAULT_LLM_CONFIG[field] });
    setHasChanges(true);
  };

  const handleSave = () => {
    if (onSave) {
      onSave();
      setHasChanges(false);
    }
  };

  const getFieldValue = (field: keyof LLMConfig): string => {
    return config[field] || DEFAULT_LLM_CONFIG[field] || '';
  };

  const isFieldModified = (field: keyof LLMConfig): boolean => {
    const current = config[field];
    const defaultVal = DEFAULT_LLM_CONFIG[field];
    return current !== undefined && current !== defaultVal && current !== '';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>LLM Konfigürasyonu</span>
          </div>
          {onSave && hasChanges && (
            <Button size="sm" onClick={handleSave} disabled={saving || disabled}>
              <Save className="w-3 h-3 mr-1" />
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 h-auto p-1">
            {LLM_CONFIG_TABS.map((tab) => {
              const IconComponent = ICON_MAP[tab.icon];
              const isModified = isFieldModified(tab.field);

              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2 px-1 data-[state=active]:bg-background relative',
                    isModified && 'data-[state=inactive]:bg-primary/5'
                  )}
                >
                  <div className="relative">
                    {IconComponent && <IconComponent className="w-4 h-4" />}
                    {isModified && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                    )}
                  </div>
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {LLM_CONFIG_TABS.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-4 space-y-4">
              {/* Description */}
              <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p>{tab.description}</p>
                </div>
              </div>

              {/* Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {tab.label} Prompt
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => handleResetField(tab.field)}
                          disabled={disabled}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Varsayılan
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Varsayılan değere sıfırla
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <Textarea
                  value={getFieldValue(tab.field)}
                  onChange={(e) => handleFieldChange(tab.field, e.target.value)}
                  placeholder={DEFAULT_LLM_CONFIG[tab.field]}
                  rows={6}
                  className="font-mono text-sm"
                  disabled={disabled}
                />

                {/* Variables */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Değişkenler:</span>
                  {tab.variables.map((variable) => (
                    <Badge
                      key={variable}
                      variant="secondary"
                      className="text-xs font-mono cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => {
                        // Insert variable at cursor or append
                        const currentValue = getFieldValue(tab.field);
                        handleFieldChange(tab.field, currentValue + ' ' + variable);
                      }}
                    >
                      {variable}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Preview (for citation template) */}
              {tab.id === 'analyze' && (
                <div className="p-3 border rounded-lg bg-muted/30">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Örnek Çıktı:
                  </Label>
                  <p className="text-sm text-muted-foreground italic">
                    Bu prompt, doküman yüklendiğinde otomatik olarak çalışır ve belge içeriğini analiz eder.
                  </p>
                </div>
              )}

              {tab.id === 'chatbot' && (
                <div className="p-3 border rounded-lg bg-muted/30">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Nasıl Kullanılır:
                  </Label>
                  <p className="text-sm text-muted-foreground italic">
                    Bu bağlam, chatbot ile sohbet sırasında sistem prompt'una eklenir ve yanıtları şekillendirmek için kullanılır.
                  </p>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
