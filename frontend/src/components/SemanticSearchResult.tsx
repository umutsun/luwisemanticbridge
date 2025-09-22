import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight,
  MessageSquare,
  Search,
  Brain,
  Lightbulb,
  TrendingUp,
  FileText,
  Settings
} from 'lucide-react';
import { SearchResult, SearchContext } from '@/utils/semantic-search-prompt';
import {
  generateContextualQuestion,
  generateQuestionOptionsForResult,
  searchResultsToPrompt,
  generateRefinedPrompt
} from '@/utils/semantic-search-prompt';
import { completeExcerpt } from '@/utils/excerpt-completion';

interface SemanticSearchResultProps {
  result: SearchResult;
  context: SearchContext;
  index: number;
  onQuestionSelect: (question: string) => void;
  onTagClick: (tag: string) => void;
  showScore?: boolean;
}

const SemanticSearchResult: React.FC<SemanticSearchResultProps> = ({
  result,
  context,
  index,
  onQuestionSelect,
  onTagClick,
  showScore = true
}) => {
  const [showQuestions, setShowQuestions] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  const { title, content, excerpt, category, sourceTable, score, keywords = [] } = result;

  // Generate contextual questions
  const questionOptions = generateQuestionOptionsForResult(result, context, 3);

  // Format excerpt with intelligent completion
  const formattedExcerpt = completeExcerpt(excerpt || content, {
    maxLength: 160,
    preserveSentences: true,
    preserveKeywords: true
  });

  // Get confidence level
  const getConfidenceLevel = (score: number) => {
    if (score >= 80) return { label: 'Yüksek', color: 'bg-green-500' };
    if (score >= 60) return { label: 'Orta', color: 'bg-yellow-500' };
    return { label: 'Düşük', color: 'bg-red-500' };
  };

  const confidence = getConfidenceLevel(score);

  // Handle question selection
  const handleQuestionSelect = (question: string) => {
    setSelectedQuestion(question);
    onQuestionSelect(question);
    setShowQuestions(false);
  };

  // Generate refined prompt from tags
  const handleTagClick = (tag: string) => {
    const basePrompt = generateContextualQuestion(result, context);
    const refinedPrompt = generateRefinedPrompt(basePrompt, [tag], context);
    onTagClick(tag);
    onQuestionSelect(refinedPrompt);
  };

  // Context-aware keywords extraction
  const getContextualKeywords = () => {
    const baseKeywords = keywords.slice(0, 4);

    // Add intent-specific keywords
    if (context.intent === 'procedural') {
      baseKeywords.push('Prosedür');
    } else if (context.intent === 'analytical') {
      baseKeywords.push('Analiz');
    }

    // Add theme if not general
    if (context.theme !== 'general') {
      baseKeywords.push(context.theme.charAt(0).toUpperCase() + context.theme.slice(1));
    }

    return baseKeywords.slice(0, 5);
  };

  const contextualKeywords = getContextualKeywords();

  return (
    <Card className="group relative p-4 hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-transparent hover:border-l-blue-500">
      {/* Result Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          {/* Score Badge */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-400">
                {index + 1}
              </span>
            </div>
            {showScore && (
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${confidence.color}`} />
                <span className="text-xs font-medium text-gray-500">
                  {Math.round(score)}%
                </span>
              </div>
            )}
          </div>

          {/* Title and Meta */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">
              {title.replace(/^(sorucevap|ozelgeler) -\s*/, '').replace(/ - ID: \d+$/, '')}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {category}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {sourceTable}
              </Badge>
              {confidence.label !== 'Orta' && (
                <Badge
                  variant={confidence.label === 'Yüksek' ? 'default' : 'destructive'}
                  className="text-xs"
                >
                  {confidence.label} Eşleşme
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQuestions(!showQuestions)}
            title="Soru seçeneklerini göster"
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content/Excerpt */}
      <div className="mb-3 pl-11">
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {formattedExcerpt}
        </p>
      </div>

      {/* Contextual Keywords */}
      <div className="flex flex-wrap gap-1.5 mb-3 pl-11">
        {contextualKeywords.map((keyword, idx) => (
          <button
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              handleTagClick(keyword);
            }}
            className="text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors duration-150 hover:scale-105"
            title={`"${keyword}" ile ilgili detaylı araştırma yap`}
          >
            {keyword}
          </button>
        ))}
      </div>

      {/* Question Options */}
      {showQuestions && (
        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Bu içerikle ilgili sorular:
            </span>
          </div>
          <div className="space-y-2">
            {questionOptions.map((question, idx) => (
              <button
                key={idx}
                onClick={() => handleQuestionSelect(question)}
                className="w-full text-left p-2 rounded bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-700 dark:hover:text-blue-300 transition-colors duration-150"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3 h-3 flex-shrink-0" />
                  <span className="line-clamp-2">{question}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Brain className="w-3 h-3" />
            <span>Anlamsal Arama</span>
          </div>
          {result.similarity_score && (
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>Benzerlik: {(result.similarity_score * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => {
            const prompt = searchResultsToPrompt(context);
            onQuestionSelect(prompt);
          }}
        >
          <Search className="w-3 h-3 mr-1" />
          Tümünü Araştır
        </Button>
      </div>

      {/* Selected Question Indicator */}
      {selectedQuestion && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
          ✓ Seçildi
        </div>
      )}
    </Card>
  );
};

export default SemanticSearchResult;