import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from 'react-i18next';
import { ChatbotFeatures } from '@/types/chatbot-features';
import { Eye, Zap, BarChart3, Layout, FileText } from 'lucide-react';

interface FeatureTogglesProps {
  features: ChatbotFeatures;
  onChange: (key: keyof ChatbotFeatures, value: boolean | string) => void;
}

interface FeatureGroup {
  title: string;
  icon: React.ReactNode;
  features: Array<{
    key: keyof ChatbotFeatures;
    label: string;
    description: string;
  }>;
}

export const FeatureToggles: React.FC<FeatureTogglesProps> = ({ features, onChange }) => {
  const { t } = useTranslation();

  const featureGroups: FeatureGroup[] = [
    {
      title: t('settings.features.display', 'Display Options'),
      icon: <Eye className="w-4 h-4" />,
      features: [
        {
          key: 'enableSourcesSection',
          label: t('settings.features.sources', 'Source Citations'),
          description: t('settings.features.sourcesDesc', 'Show relevant sources and references')
        },
        {
          key: 'enableKeywordHighlighting',
          label: t('settings.features.keywords', 'Keyword Highlighting'),
          description: t('settings.features.keywordsDesc', 'Highlight important terms and matches')
        },
        {
          key: 'enableSourceExpansion',
          label: t('settings.features.expansion', 'Source Expansion'),
          description: t('settings.features.expansionDesc', 'Show more/less sources button')
        },
        {
          key: 'enableWelcomeMessage',
          label: t('settings.features.welcome', 'Welcome Message'),
          description: t('settings.features.welcomeDesc', 'Display greeting on first load')
        },
        {
          key: 'enableSuggestions',
          label: t('settings.features.suggestions', 'Question Suggestions'),
          description: t('settings.features.suggestionsDesc', 'Show suggested questions')
        }
      ]
    },
    {
      title: t('settings.features.interaction', 'Interaction Features'),
      icon: <Zap className="w-4 h-4" />,
      features: [
        {
          key: 'enableFollowUpQuestions',
          label: t('settings.features.followup', 'Follow-up Questions'),
          description: t('settings.features.followupDesc', 'Suggest related questions after response')
        },
        {
          key: 'enableActionButtons',
          label: t('settings.features.actions', 'Action Buttons'),
          description: t('settings.features.actionsDesc', 'Like, copy, refresh buttons')
        },
        {
          key: 'enableSourceClick',
          label: t('settings.features.sourceClick', 'Clickable Sources'),
          description: t('settings.features.sourceClickDesc', 'Click sources for deep research')
        },
        {
          key: 'enableAutoScroll',
          label: t('settings.features.autoscroll', 'Auto Scroll'),
          description: t('settings.features.autoscrollDesc', 'Automatically scroll to latest message')
        }
      ]
    },
    {
      title: t('settings.features.metadata', 'Response Metadata'),
      icon: <BarChart3 className="w-4 h-4" />,
      features: [
        {
          key: 'enableResponseTime',
          label: t('settings.features.time', 'Response Time'),
          description: t('settings.features.timeDesc', 'Display response generation time')
        },
        {
          key: 'enableTokenCount',
          label: t('settings.features.tokens', 'Token Count'),
          description: t('settings.features.tokensDesc', 'Show tokens used in response')
        },
        {
          key: 'enableConfidenceScore',
          label: t('settings.features.confidence', 'Confidence Scores'),
          description: t('settings.features.confidenceDesc', 'Display source confidence percentages')
        }
      ]
    },
    {
      title: t('settings.features.advanced', 'Advanced Settings'),
      icon: <Layout className="w-4 h-4" />,
      features: [
        {
          key: 'enableStreaming',
          label: t('settings.features.streaming', 'Streaming Responses'),
          description: t('settings.features.streamingDesc', 'Stream responses word-by-word')
        },
        {
          key: 'enableTypingIndicator',
          label: t('settings.features.typing', 'Typing Indicator'),
          description: t('settings.features.typingDesc', 'Show animated typing indicator')
        }
      ]
    },
    {
      title: t('settings.features.pdfUpload', 'PDF Upload'),
      icon: <FileText className="w-4 h-4" />,
      features: [
        {
          key: 'enablePdfUpload',
          label: t('settings.features.pdfUploadToggle', 'Chat PDF Upload'),
          description: t('settings.features.pdfUploadDesc', 'Allow users to upload and analyze PDF documents in chat')
        }
      ]
    }
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          {t('settings.features.title', 'Feature Configuration')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('settings.features.subtitle', 'Customize which features are enabled in your chatbot')}
        </p>
      </div>

      <div className="space-y-3">
        {featureGroups.map((group, groupIdx) => (
          <Card key={groupIdx} className="p-4">
            {/* Group Header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                {group.icon}
              </div>
              <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
            </div>

            <Separator className="mb-3" />

            {/* Features */}
            <div className="space-y-3">
              {group.features.map((feature, featureIdx) => (
                <div
                  key={featureIdx}
                  className="flex items-start justify-between gap-4 py-1"
                >
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={feature.key}
                      className="text-sm font-medium text-foreground cursor-pointer"
                    >
                      {feature.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  <Switch
                    id={feature.key}
                    checked={features[feature.key] as boolean}
                    onCheckedChange={(checked) => onChange(feature.key, checked)}
                  />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Style Options */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-primary/10 text-primary">
            <Layout className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">
            {t('settings.features.styleOptions', 'Style Options')}
          </h4>
        </div>

        <Separator className="mb-3" />

        <div className="space-y-3">
          {/* Source Display Style */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t('settings.features.sourceStyle', 'Source Display Style')}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChange('sourceDisplayStyle', 'detailed')}
                className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                  features.sourceDisplayStyle === 'detailed'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                }`}
              >
                {t('settings.features.detailed', 'Detailed')}
              </button>
              <button
                onClick={() => onChange('sourceDisplayStyle', 'minimal')}
                className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                  features.sourceDisplayStyle === 'minimal'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                }`}
              >
                {t('settings.features.minimal', 'Minimal')}
              </button>
            </div>
          </div>

          {/* Input Style */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t('settings.features.inputStyle', 'Input Position')}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChange('inputStyle', 'inline')}
                className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                  features.inputStyle === 'inline'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                }`}
              >
                {t('settings.features.inline', 'Inline')}
              </button>
              <button
                onClick={() => onChange('inputStyle', 'floating')}
                className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                  features.inputStyle === 'floating'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                }`}
              >
                {t('settings.features.floating', 'Floating')}
              </button>
            </div>
          </div>

          {/* Message Style */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t('settings.features.messageStyle', 'Message Style')}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onChange('messageStyle', 'card')}
                className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                  features.messageStyle === 'card'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                }`}
              >
                {t('settings.features.card', 'Card')}
              </button>
              <button
                onClick={() => onChange('messageStyle', 'bubble')}
                className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                  features.messageStyle === 'bubble'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                }`}
              >
                {t('settings.features.bubble', 'Bubble')}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Info Note */}
      <div className="p-3 rounded-lg bg-muted/50 border">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">
            {t('settings.features.note', 'Note:')}
          </span>{' '}
          {t(
            'settings.features.noteText',
            'Feature changes apply immediately. Some features may require specific templates to work properly.'
          )}
        </p>
      </div>
    </div>
  );
};
