'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Copy,
  FileText,
  Code,
  Type,
  Eye,
  EyeOff,
  WrapText,
  Scissors,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface StructuredTextViewerProps {
  data: string;
  title?: string;
  className?: string;
  fileType?: 'md' | 'doc' | 'docx' | 'txt' | 'rtf';
  metadata?: {
    wordCount?: number;
    charCount?: number;
    lineCount?: number;
    language?: string;
    encoding?: string;
  };
}

export default function StructuredTextViewer({
  data,
  title = "Text Document",
  className = "",
  fileType = 'txt',
  metadata
}: StructuredTextViewerProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw' | 'preview'>('formatted');
  const [lineWrap, setLineWrap] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  // Parse and structure the content
  const { structuredContent, stats } = useMemo(() => {
    if (!data) return { structuredContent: null, stats: null };

    const lines = data.split('\n');
    const words = data.split(/\s+/).filter(w => w.length > 0);
    const characters = data.length;

    // Detect structure based on file type
    let structure = null;

    if (fileType === 'md') {
      structure = parseMarkdown(data);
    } else if (fileType === 'txt' || fileType === 'rtf') {
      structure = parsePlainText(data);
    } else if (fileType === 'doc' || fileType === 'docx') {
      structure = parseDocument(data);
    }

    return {
      structuredContent: structure,
      stats: {
        wordCount: words.length,
        charCount: characters,
        lineCount: lines.length,
        ...metadata
      }
    };
  }, [data, fileType, metadata]);

  const parseMarkdown = (text: string) => {
    const lines = text.split('\n');
    const sections = [];
    let currentSection = null;
    let currentList = null;

    lines.forEach((line, index) => {
      // Headers
      if (line.startsWith('#')) {
        if (currentSection) {
          sections.push(currentSection);
        }
        const level = line.match(/^#+/)?.[0].length || 1;
        currentSection = {
          type: 'header',
          level,
          content: line.replace(/^#+\s*/, ''),
          lines: [index]
        };
        currentList = null;
      }
      // Code blocks
      else if (line.startsWith('```')) {
        if (currentSection && currentSection.type !== 'code') {
          sections.push(currentSection);
        }
        currentSection = {
          type: 'code',
          language: line.replace('```', '').trim() || 'text',
          content: '',
          lines: [index]
        };
      }
      // Lists
      else if (line.match(/^(\s*[-*+]\s+|\s*\d+\.\s+)/)) {
        if (!currentList) {
          currentList = {
            type: 'list',
            items: [],
            lines: []
          };
          if (currentSection && currentSection.type !== 'list') {
            sections.push(currentSection);
            currentSection = currentList;
          }
        }
        currentList.items.push(line);
        currentList.lines.push(index);
      }
      // Regular text
      else if (line.trim()) {
        if (!currentSection || currentSection.type === 'code') {
          if (currentSection) sections.push(currentSection);
          currentSection = {
            type: 'paragraph',
            content: line,
            lines: [index]
          };
        } else if (currentSection.type === 'paragraph') {
          currentSection.content += ' ' + line;
          currentSection.lines.push(index);
        } else if (currentSection.type === 'code') {
          currentSection.content += line + '\n';
          currentSection.lines.push(index);
        }
      }
      // Empty line
      else {
        if (currentSection && currentSection.type === 'paragraph') {
          sections.push(currentSection);
          currentSection = null;
        }
        currentList = null;
      }
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  };

  const parsePlainText = (text: string) => {
    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs.map((paragraph, index) => ({
      type: 'paragraph',
      content: paragraph.replace(/\n/g, ' ').trim(),
      lines: [index]
    }));
  };

  const parseDocument = (text: string) => {
    // Simple document parsing - can be enhanced
    const sections = [];
    const paragraphs = text.split(/\n\s*\n/);

    paragraphs.forEach((paragraph, index) => {
      if (paragraph.trim()) {
        sections.push({
          type: 'paragraph',
          content: paragraph.trim(),
          lines: [index]
        });
      }
    });

    return sections;
  };

  // Search functionality
  const { searchResults, highlightedContent } = useMemo(() => {
    if (!searchTerm) {
      return { searchResults: [], highlightedContent: data };
    }

    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const matches = [];
    let match;

    while ((match = regex.exec(data)) !== null) {
      matches.push({
        index: match.index,
        text: match[0],
        line: data.substring(0, match.index).split('\n').length
      });
    }

    const highlighted = data.replace(regex, '<mark>$1</mark>');

    return { searchResults: matches, highlightedContent: highlighted };
  }, [data, searchTerm]);

  const copyContent = () => {
    navigator.clipboard.writeText(data);
    toast({
      title: "Copied",
      description: "Document content copied to clipboard"
    });
  };

  
  if (!data) {
    return (
      <div className={`p-6 text-center text-muted-foreground ${className}`}>
        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No content available</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
          </h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{stats?.wordCount?.toLocaleString()} words</span>
            <span>•</span>
            <span>{stats?.charCount?.toLocaleString()} characters</span>
            <span>•</span>
            <span>{stats?.lineCount} lines</span>
            <Badge variant="outline" className="ml-2">
              {fileType.toUpperCase()}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
          >
            <Type className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLineWrap(!lineWrap)}
          >
            <WrapText className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search in document..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          {searchResults.length > 0 && (
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground">
              {searchResults.length} matches
            </span>
          )}
        </div>
        <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="formatted">Formatted</SelectItem>
            <SelectItem value="raw">Raw</SelectItem>
            {fileType === 'md' && <SelectItem value="preview">Preview</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className={`border rounded-lg ${isFullscreen ? 'fixed inset-4 z-50 bg-background' : ''}`}>
        <ScrollArea className={isFullscreen ? 'h-[calc(100vh-12rem)]' : 'h-[60vh]'}>
          <div className="p-6">
            {viewMode === 'formatted' && structuredContent && (
              <div className={`space-y-4 ${!lineWrap ? 'whitespace-pre overflow-x-auto' : ''}`}>
                {structuredContent.map((section: any, index: number) => {
                  if (section.type === 'header') {
                    const HeaderTag = `h${Math.min(section.level + 1, 6)}` as keyof JSX.IntrinsicElements;
                    return (
                      <HeaderTag key={index} className="font-semibold scroll-m-4">
                        {section.content}
                      </HeaderTag>
                    );
                  }
                  if (section.type === 'code') {
                    return (
                      <div key={index} className="bg-muted p-4 rounded-lg overflow-x-auto">
                        <div className="text-xs text-muted-foreground mb-2">
                          {section.language}
                        </div>
                        <pre className="text-sm font-mono">
                          <code>{section.content}</code>
                        </pre>
                      </div>
                    );
                  }
                  if (section.type === 'list') {
                    return (
                      <ul key={index} className="list-disc list-inside space-y-1">
                        {section.items.map((item: string, itemIndex: number) => (
                          <li key={itemIndex}>{item.replace(/^[-*+\d.]\s+/, '')}</li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p key={index} className="leading-relaxed">
                      {section.content}
                    </p>
                  );
                })}
              </div>
            )}

            {viewMode === 'raw' && (
              <div className="relative">
                {showLineNumbers && (
                  <div className="absolute left-0 top-0 bottom-0 w-12 text-xs text-muted-foreground text-right pr-4 select-none border-r">
                    {data.split('\n').map((_, i) => (
                      <div key={i} className="leading-6">{i + 1}</div>
                    ))}
                  </div>
                )}
                <pre className={`text-sm font-mono ${showLineNumbers ? 'ml-16' : ''} ${!lineWrap ? 'whitespace-pre overflow-x-auto' : 'whitespace-pre-wrap'}`}>
                  <code>{data}</code>
                </pre>
              </div>
            )}

            {viewMode === 'preview' && fileType === 'md' && (
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: highlightedContent }}
              />
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {searchResults.length > 0 && (
            <span>Found {searchResults.length} matches</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyContent}>
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
        </div>
      </div>
    </div>
  );
}