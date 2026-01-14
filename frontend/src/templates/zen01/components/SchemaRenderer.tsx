'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ResponseSchema,
  ResponseSection,
  defaultResponseSchema,
  getActiveSchema
} from '@/types/chatbot-features';

interface ParsedContent {
  [sectionId: string]: string;
}

interface SchemaRendererProps {
  content: string;
  schemaId?: string;
  schema?: ResponseSchema;
  keywords?: string[];
  dayanaklar?: string[];
  className?: string;
}

/**
 * Parse LLM response content into sections based on schema
 */
function parseContentBySections(content: string, schema: ResponseSchema): ParsedContent {
  const parsed: ParsedContent = {};

  // Get LLM sections that we need to parse
  const llmSections = schema.sections
    .filter(s => s.source === 'llm' && s.visible)
    .sort((a, b) => a.order - b.order);

  if (llmSections.length === 0) {
    // No structured sections, use entire content as main
    parsed['main'] = content;
    return parsed;
  }

  // Try to parse numbered format: 1) KONU, 4) DEĞERLENDİRME
  // Build regex patterns for each section
  let remainingContent = content;

  for (let i = 0; i < llmSections.length; i++) {
    const section = llmSections[i];
    const nextSection = llmSections[i + 1];

    // Build pattern based on section label
    const labelVariants = getSectionLabelVariants(section);
    const pattern = buildSectionPattern(labelVariants, nextSection ? getSectionLabelVariants(nextSection) : null);

    const match = remainingContent.match(pattern);
    if (match && match[1]) {
      parsed[section.id] = match[1].trim();
    }
  }

  // If no sections were parsed, put everything in degerlendirme (or first text section)
  if (Object.keys(parsed).length === 0) {
    const mainSection = llmSections.find(s => s.style === 'text') || llmSections[0];
    if (mainSection) {
      // Clean any remaining section headers
      parsed[mainSection.id] = cleanSectionHeaders(content);
    } else {
      parsed['main'] = content;
    }
  }

  return parsed;
}

/**
 * Get label variants for a section (Turkish character variations)
 */
function getSectionLabelVariants(section: ResponseSection): string[] {
  const label = section.label.toUpperCase();
  const variants = [label];

  // Add common variations
  switch (section.id) {
    case 'konu':
      variants.push('SORUNUN KONUSU', 'KONU');
      break;
    case 'degerlendirme':
      variants.push('DEĞERLENDİRME', 'DEGERLENDIRME', 'VERGİLEX DEĞERLENDİRMESİ', 'VERGILEX DEGERLENDIRMESI');
      break;
    case 'ozet':
      variants.push('ÖZET', 'OZET', 'SUMMARY');
      break;
    case 'sonuc':
      variants.push('SONUÇ', 'SONUC', 'RESULT');
      break;
    case 'analiz':
      variants.push('ANALİZ', 'ANALIZ', 'ANALYSIS');
      break;
    case 'oneriler':
      variants.push('ÖNERİLER', 'ONERILER', 'TAVSİYELER', 'TAVSIYELER');
      break;
  }

  return variants;
}

/**
 * Build regex pattern to extract section content
 */
function buildSectionPattern(currentLabels: string[], nextLabels: string[] | null): RegExp {
  const currentPattern = currentLabels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  let endPattern = '$';
  if (nextLabels) {
    const nextPattern = nextLabels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    endPattern = `(?=\\d\\)\\s*(?:${nextPattern})|##\\s*(?:${nextPattern})|\\*\\*(?:${nextPattern})\\*\\*|$)`;
  }

  // Match: 1) LABEL or ## LABEL or **LABEL**
  return new RegExp(
    `(?:\\d\\)\\s*(?:${currentPattern})[:\\s]*|##\\s*(?:${currentPattern})[:\\s]*\\n|\\*\\*(?:${currentPattern}):?\\*\\*[:\\s]*)([\\s\\S]*?)${endPattern}`,
    'i'
  );
}

/**
 * Clean remaining section headers from content
 */
function cleanSectionHeaders(content: string): string {
  return content
    .replace(/\d\)\s*[A-ZÇĞİÖŞÜa-zçğıöşü\s]+[:\s]*/g, '')
    .replace(/##\s*[A-ZÇĞİÖŞÜa-zçğıöşü\s]+\n/g, '')
    .replace(/\*\*[A-ZÇĞİÖŞÜa-zçğıöşü\s]+:?\*\*[:\s]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Schema-based Response Renderer
 * Renders LLM response according to configured schema sections
 */
export const SchemaRenderer: React.FC<SchemaRendererProps> = ({
  content,
  schemaId,
  schema: customSchema,
  keywords = [],
  dayanaklar = [],
  className = ''
}) => {
  // Get schema - prefer custom, then by ID, then default
  const schema = customSchema || getActiveSchema(schemaId);

  // Parse content into sections
  const parsedContent = React.useMemo(() =>
    parseContentBySections(content, schema),
    [content, schema]
  );

  // Get visible sections in order
  const visibleSections = schema.sections
    .filter(s => s.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <div className={`schema-response ${className}`}>
      {visibleSections.map(section => {
        // Get content based on source
        let sectionContent: string | string[] | null = null;

        if (section.source === 'llm') {
          sectionContent = parsedContent[section.id] || null;
        } else if (section.source === 'backend') {
          // Use backend-provided data
          if (section.id === 'anahtar_terimler' && keywords.length > 0) {
            sectionContent = keywords;
          } else if (section.id === 'dayanaklar' && dayanaklar.length > 0) {
            sectionContent = dayanaklar;
          }
        }

        // Skip empty sections (unless required)
        if (!sectionContent && !section.required) {
          return null;
        }

        return (
          <SectionRenderer
            key={section.id}
            section={section}
            content={sectionContent}
          />
        );
      })}

      {/* Fallback: If no sections rendered, show raw content */}
      {visibleSections.length === 0 && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

/**
 * Individual Section Renderer
 */
interface SectionRendererProps {
  section: ResponseSection;
  content: string | string[] | null;
}

const SectionRenderer: React.FC<SectionRendererProps> = ({ section, content }) => {
  if (!content) return null;

  switch (section.style) {
    case 'heading':
      return (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 mb-1">
            {section.label}
          </h3>
          <p className="text-slate-700 dark:text-slate-100 text-base font-medium">
            {typeof content === 'string' ? content : content.join(' ')}
          </p>
        </div>
      );

    case 'tags':
      const tags = Array.isArray(content) ? content : content.split(',').map(s => s.trim());
      return (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-cyan-600/70 dark:text-cyan-400/70 mb-2">
            {section.label}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-0.5 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      );

    case 'citation':
      const citations = Array.isArray(content) ? content : content.split('\n').filter(Boolean);
      return (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-cyan-600/70 dark:text-cyan-400/70 mb-2">
            {section.label}
          </h4>
          <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {citations.map((cite, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-cyan-500 dark:text-cyan-400 font-medium">[{idx + 1}]</span>
                <span>{cite}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'list':
      const items = Array.isArray(content) ? content : content.split('\n').filter(Boolean);
      return (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-cyan-600/70 dark:text-cyan-400/70 mb-2">
            {section.label}
          </h4>
          <ul className="list-disc list-outside ml-4 space-y-1 text-sm text-slate-700 dark:text-slate-100">
            {items.map((item, idx) => (
              <li key={idx}>{item.replace(/^[-•*]\s*/, '')}</li>
            ))}
          </ul>
        </div>
      );

    case 'text':
    default:
      return (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-cyan-600/70 dark:text-cyan-400/70 mb-2">
            {section.label}
          </h4>
          <div className="prose prose-sm max-w-none dark:prose-invert text-slate-700 dark:text-slate-100">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {typeof content === 'string' ? content : content.join('\n\n')}
            </ReactMarkdown>
          </div>
        </div>
      );
  }
};

export default SchemaRenderer;
