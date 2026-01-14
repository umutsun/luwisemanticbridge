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

/**
 * Clean citation/source title from database formatting issues
 * Fixes: "T.C.D A N I Ş T A Y" -> "T.C. DANIŞTAY"
 * Fixes: "DAİREEsas No:" -> "DAİRE Esas No:"
 */
function cleanCitationTitle(title: string): string {
  if (!title) return '';

  return title
    // Fix spaced letters like "D A N I Ş T A Y" -> "DANIŞTAY"
    .replace(/([A-ZÇĞİÖŞÜ])\s+(?=[A-ZÇĞİÖŞÜ]\s*[A-ZÇĞİÖŞÜ])/g, '$1')
    .replace(/([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])/g, '$1$2$3$4$5$6$7$8')
    .replace(/([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])/g, '$1$2$3$4$5$6$7')
    .replace(/([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])/g, '$1$2$3$4$5$6')
    .replace(/([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])/g, '$1$2$3$4$5')
    // Fix "T.C.D" -> "T.C. D" (add space after T.C.)
    .replace(/T\.C\.D/g, 'T.C. D')
    // Fix merged words: "DAİREEsas" -> "DAİRE Esas"
    .replace(/DAİRE([A-Z])/g, 'DAİRE $1')
    .replace(/DAIRE([A-Z])/g, 'DAİRE $1')
    // Fix "Esas No:2018" -> "Esas No: 2018"
    .replace(/No:(\d)/g, 'No: $1')
    // Fix "2018/280Karar" -> "2018/280 Karar"
    .replace(/(\d{4}\/\d+)([A-ZÇĞİÖŞÜ])/g, '$1 $2')
    // Fix "TEMYİZ EDEN" spacing
    .replace(/(\d+)TEMYİZ/g, '$1 TEMYİZ')
    .replace(/(\d+)TEMYIZ/g, '$1 TEMYİZ')
    // Fix "(DAVALI):" spacing
    .replace(/\(DAVALI\):/g, '(DAVALI): ')
    .replace(/\(DAVACI\):/g, '(DAVACI): ')
    // Fix "Tarih:" spacing
    .replace(/DAİRETarih:/g, 'DAİRE Tarih:')
    .replace(/DAIRETarih:/g, 'DAİRE Tarih:')
    // Clean multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

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
 * Parse backend-formatted response content into sections
 * Uses schema's backendLabel to dynamically parse sections
 *
 * Backend format (dynamic based on schema):
 *   SECTION_LABEL:
 *   content
 */
function parseContentBySections(content: string, schema: ResponseSchema): ParsedContent {
  const parsed: ParsedContent = {};

  // Get sections with backendLabels, sorted by order
  const sectionsWithLabels = schema.sections
    .filter(s => s.backendLabel)
    .sort((a, b) => a.order - b.order);

  if (sectionsWithLabels.length === 0) {
    // No schema labels defined, return content as-is for first text section
    const textSection = schema.sections.find(s => s.style === 'text');
    if (textSection) {
      parsed[textSection.id] = cleanLLMSectionHeaders(content);
    }
    return parsed;
  }

  // Build list of all backend labels for lookahead pattern
  const allLabels = sectionsWithLabels
    .map(s => escapeRegex(s.backendLabel!.replace(':', '')))
    .join('|');

  // Check if content has any of the schema's backend labels
  const hasSchemaFormat = sectionsWithLabels.some(s =>
    new RegExp(`\\n?${escapeRegex(s.backendLabel!)}`, 'm').test(content)
  );

  if (hasSchemaFormat) {
    // Parse each section dynamically using schema's backendLabels
    for (let i = 0; i < sectionsWithLabels.length; i++) {
      const section = sectionsWithLabels[i];
      const label = escapeRegex(section.backendLabel!.replace(':', ''));

      // Build lookahead for next sections
      const nextLabels = sectionsWithLabels
        .slice(i + 1)
        .map(s => escapeRegex(s.backendLabel!.replace(':', '')))
        .join('|');

      // Create pattern: LABEL:\s*\n?(content)(?=\nNEXT_LABEL:|$)
      const lookahead = nextLabels ? `(?=\\n(?:${nextLabels}):)` : '$';
      const pattern = new RegExp(`${label}:\\s*\\n?([\\s\\S]*?)${lookahead}`);

      const match = content.match(pattern);
      if (match?.[1]?.trim()) {
        let sectionContent = match[1].trim();
        // Clean LLM headers from assessment/text sections
        if (section.style === 'text') {
          sectionContent = cleanLLMSectionHeaders(sectionContent);
        }
        parsed[section.id] = sectionContent;
      }
    }
  } else {
    // Check for legacy formats (numbered or markdown headers)
    const hasLegacyFormat = /\d\)\s*(?:SORUNUN\s*KONUSU|KONU|DEĞERLENDİRME)/i.test(content) ||
                           /##\s*(?:Konu|Değerlendirme)/i.test(content);

    if (hasLegacyFormat) {
      // Try legacy numbered format
      const legacyKonu = content.match(/1\)\s*(?:SORUNUN\s*)?KONU[SU]?[:\s]*([\s\S]*?)(?=2\)|3\)|4\)|##|$)/i);
      const legacyDegerlendirme = content.match(/4\)\s*(?:VERGİLEX\s*)?DEĞERLENDİRME[Sİ]?[:\s]*([\s\S]*?)(?=5\)|SON\s*BÖLÜM|DİPNOTLAR|$)/i);

      if (legacyKonu?.[1]) parsed['konu'] = legacyKonu[1].trim();
      if (legacyDegerlendirme?.[1]) {
        parsed['degerlendirme'] = cleanLLMSectionHeaders(legacyDegerlendirme[1].trim());
      }

      // Try markdown format if no degerlendirme found
      if (!parsed['degerlendirme']) {
        const mdDegerlendirme = content.match(/##\s*Değerlendirme\s*\n([\s\S]*?)(?=##|$)/i);
        if (mdDegerlendirme?.[1]) {
          parsed['degerlendirme'] = cleanLLMSectionHeaders(mdDegerlendirme[1].trim());
        }
      }
    }

    // Final fallback: use entire content as main text section (usually degerlendirme)
    if (Object.keys(parsed).length === 0) {
      const mainTextSection = schema.sections.find(s => s.style === 'text' && s.required);
      const sectionId = mainTextSection?.id || 'degerlendirme';
      parsed[sectionId] = cleanLLMSectionHeaders(cleanSectionHeaders(content));
    }
  }

  return parsed;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Clean LLM-generated section headers that may have leaked through
 * Removes numbered headers (1) SORUNUN KONUSU), markdown headers (## Konu), etc.
 */
function cleanLLMSectionHeaders(content: string): string {
  return content
    // Remove numbered section headers from LLM
    .replace(/1\)\s*SORUNUN\s*KONUSU[:\s]*/gi, '')
    .replace(/2\)\s*ANAHTAR\s*KELİMELER[:\s]*[^\n]*\n?/gi, '')
    .replace(/3\)\s*(?:İLGİLİ\s*)?YASAL\s*DÜZENLEMELER[^\n]*[\s\S]*?(?=4\)|$)/gi, '')
    .replace(/4\)\s*(?:VERGİLEX\s*)?DEĞERLENDİRME[Sİ]?[:\s]*/gi, '')
    .replace(/5\)\s*DİPNOTLAR[\s\S]*$/gi, '')
    // Remove markdown section headers
    .replace(/##\s*Konu\s*\n/gi, '')
    .replace(/##\s*Değerlendirme\s*\n/gi, '')
    .replace(/##\s*Anahtar\s*(?:Terim|Kelime)[^\n]*[\s\S]*?(?=##|\n\n\n|$)/gi, '')
    .replace(/##\s*Dayanaklar[^\n]*[\s\S]*?(?=##|\n\n\n|$)/gi, '')
    .replace(/##\s*Dipnotlar[\s\S]*$/gi, '')
    // Remove SON BÖLÜM: DİPNOTLAR
    .replace(/SON\s*BÖLÜM[:\s]*DİPNOTLAR[\s\S]*$/gi, '')
    // Remove **CEVAP** **ALINTI** style headers
    .replace(/\*\*CEVAP\*\*\s*\n?/gi, '')
    .replace(/\*\*ALINTI\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/gi, '')
    // Clean multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
        // Get content based on source and section type
        let sectionContent: string | string[] | null = null;

        // First check parsed content (backend includes these in the response)
        if (parsedContent[section.id]) {
          const parsed = parsedContent[section.id];
          // Convert string to array for tags/citation styles
          if (section.style === 'tags' && typeof parsed === 'string') {
            sectionContent = parsed.split(',').map(s => s.trim()).filter(Boolean);
          } else if (section.style === 'citation' && typeof parsed === 'string') {
            sectionContent = parsed.split('\n').map(s => s.trim()).filter(Boolean);
          } else {
            sectionContent = parsed;
          }
        }
        // Fallback to props if not in parsed content
        else if (section.source === 'backend') {
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
        // Skip empty arrays
        if (Array.isArray(sectionContent) && sectionContent.length === 0) {
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
      // Marker colors - like different highlighter pens (matching ZenMessage)
      const MARKER_COLORS = [
        'zen01-marker-yellow',  // Yellow highlighter
        'zen01-marker-green',   // Green highlighter
        'zen01-marker-pink',    // Pink highlighter
        'zen01-marker-blue',    // Blue highlighter
      ];
      return (
        <div className="mb-4">
          {/* Hide label for keywords - show tags directly */}
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, idx) => (
              <span
                key={idx}
                className={`zen01-marker ${MARKER_COLORS[idx % MARKER_COLORS.length]}`}
              >
                <span className="text-xs font-medium">{tag}</span>
              </span>
            ))}
          </div>
        </div>
      );

    case 'citation':
      const rawCitations = Array.isArray(content) ? content : content.split('\n').filter(Boolean);
      // Filter out generic/meaningless citations
      const GENERIC_TERMS = ['belge', 'kaynak', 'document', 'source', 'dosya', 'file', 'döküman', 'doküman'];
      const citations = rawCitations.filter(cite => {
        const cleaned = cite.trim().toLowerCase();
        // Skip if citation is just a generic term or too short to be meaningful (min 10 chars for legal refs)
        if (cleaned.length < 10) return false;
        if (GENERIC_TERMS.some(term => cleaned === term || cleaned.includes(term) && cleaned.length < 15)) return false;
        return true;
      });
      // Don't render section if no meaningful citations
      if (citations.length === 0) return null;
      return (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-cyan-600/70 dark:text-cyan-400/70 mb-3">
            {section.label}
          </h4>
          {/* Academic citation style - hanging indent */}
          <div className="space-y-2 text-xs border-l-2 border-cyan-400/30 dark:border-cyan-500/30 pl-3">
            {citations.map((cite, idx) => (
              <div key={idx} className="flex items-start gap-2 py-1">
                <span className="flex-shrink-0 text-cyan-600 dark:text-cyan-400 font-semibold min-w-[24px]">
                  [{idx + 1}]
                </span>
                <span className="text-slate-600 dark:text-slate-300 italic leading-relaxed">
                  {cleanCitationTitle(cite)}
                </span>
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
          {/* Hide section label - show content directly */}
          <div className="prose prose-sm max-w-none dark:prose-invert text-slate-700 dark:text-slate-100
                          prose-headings:text-cyan-700 dark:prose-headings:text-cyan-300
                          prose-h1:text-lg prose-h1:font-bold prose-h1:mt-4 prose-h1:mb-2
                          prose-h2:text-base prose-h2:font-semibold prose-h2:mt-3 prose-h2:mb-2
                          prose-h3:text-sm prose-h3:font-semibold prose-h3:mt-2 prose-h3:mb-1
                          prose-p:my-2 prose-p:leading-relaxed
                          prose-ul:my-2 prose-ul:ml-4 prose-ul:list-disc
                          prose-ol:my-2 prose-ol:ml-4 prose-ol:list-decimal
                          prose-li:my-1 prose-li:pl-1
                          prose-strong:text-cyan-700 dark:prose-strong:text-cyan-300
                          prose-blockquote:border-l-4 prose-blockquote:border-cyan-500/50 prose-blockquote:pl-4 prose-blockquote:italic">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {typeof content === 'string' ? content : content.join('\n\n')}
            </ReactMarkdown>
          </div>
        </div>
      );
  }
};

export default SchemaRenderer;
