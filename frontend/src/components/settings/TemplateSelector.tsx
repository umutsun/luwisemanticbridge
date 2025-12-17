import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Brain, Sparkles, Zap, Grid3x3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  preview: string;
  features: string[];
  recommended?: boolean;
}

interface TemplateSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  const templates: Template[] = [
    {
      id: 'base',
      name: t('settings.template.base.name', 'Classic'),
      description: t('settings.template.base.desc', 'Traditional clean design with full features'),
      icon: <Brain className="w-5 h-5" />,
      preview: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
      features: [
        t('settings.template.base.feature1', 'Detailed source citations'),
        t('settings.template.base.feature2', 'Keyword highlighting'),
        t('settings.template.base.feature3', 'Response metrics')
      ]
    },
    {
      id: 'modern',
      name: t('settings.template.modern.name', 'Modern'),
      description: t('settings.template.modern.desc', 'Minimalist zen-style with glassmorphism'),
      icon: <Zap className="w-5 h-5" />,
      preview: 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800',
      features: [
        t('settings.template.modern.feature1', 'Floating input design'),
        t('settings.template.modern.feature2', 'Glassmorphism effects'),
        t('settings.template.modern.feature3', 'Dark mode optimized')
      ],
      recommended: true
    },
    {
      id: 'spark',
      name: t('settings.template.spark.name', 'Spark'),
      description: t('settings.template.spark.desc', 'AI-inspired design with interactive elements'),
      icon: <Sparkles className="w-5 h-5" />,
      preview: 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800',
      features: [
        t('settings.template.spark.feature1', 'Follow-up questions'),
        t('settings.template.spark.feature2', 'Action buttons'),
        t('settings.template.spark.feature3', 'Gradient branding')
      ]
    },
    {
      id: 'unified',
      name: t('settings.template.unified.name', 'Unified'),
      description: t('settings.template.unified.desc', 'Modular system with full customization'),
      icon: <Grid3x3 className="w-5 h-5" />,
      preview: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
      features: [
        t('settings.template.unified.feature1', 'Component-based'),
        t('settings.template.unified.feature2', 'Feature toggles'),
        t('settings.template.unified.feature3', 'Settings-driven UI')
      ]
    }
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          {t('settings.template.title', 'Chat Interface Template')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('settings.template.subtitle', 'Choose the visual style and interaction pattern for your chatbot')}
        </p>
      </div>

      <RadioGroup value={value} onValueChange={onChange}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((template) => (
            <Label
              key={template.id}
              htmlFor={template.id}
              className="cursor-pointer"
            >
              <Card
                className={`relative p-4 transition-all duration-200 hover:shadow-md ${
                  value === template.id
                    ? 'ring-2 ring-primary shadow-md'
                    : 'hover:border-primary/50'
                }`}
              >
                {/* Recommended Badge */}
                {template.recommended && (
                  <div className="absolute top-2 right-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                      {t('settings.template.recommended', 'Recommended')}
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* Radio Button */}
                  <RadioGroupItem
                    value={template.id}
                    id={template.id}
                    className="mt-1"
                  />

                  {/* Icon */}
                  <div className={`p-2 rounded-lg ${template.preview}`}>
                    {template.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground mb-1">
                      {template.name}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {template.description}
                    </p>

                    {/* Features */}
                    <div className="space-y-0.5">
                      {template.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-primary/60" />
                          <span className="text-[11px] text-muted-foreground">
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </Label>
          ))}
        </div>
      </RadioGroup>

      {/* Template Info */}
      <div className="p-3 rounded-lg bg-muted/50 border">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">
            {t('settings.template.note', 'Note:')}
          </span>{' '}
          {t(
            'settings.template.noteText',
            'Template changes will apply immediately. All features and data will be preserved.'
          )}
        </p>
      </div>
    </div>
  );
};
