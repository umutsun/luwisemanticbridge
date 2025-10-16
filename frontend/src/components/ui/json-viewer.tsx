'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Search,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface JsonViewerProps {
  data: any;
  title?: string;
  className?: string;
}

interface JsonNodeProps {
  data: any;
  keyName?: string;
  level: number;
  isLast: boolean;
  expandable: boolean;
}

const JsonNode: React.FC<JsonNodeProps> = ({ data, keyName, level, isLast, expandable = true }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const { toast } = useToast();

  const getType = (value: any) => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  const type = getType(data);
  const isExpandable = type === 'object' || type === 'array';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "JSON path copied to clipboard"
    });
  };

  const renderValue = () => {
    switch (type) {
      case 'string':
        return <span className="text-green-600 dark:text-green-400">"{data}"</span>;
      case 'number':
        return <span className="text-blue-600 dark:text-blue-400">{data}</span>;
      case 'boolean':
        return <span className="text-purple-600 dark:text-purple-400">{data.toString()}</span>;
      case 'null':
        return <span className="text-gray-500 dark:text-gray-400">null</span>;
      case 'undefined':
        return <span className="text-gray-500 dark:text-gray-400">undefined</span>;
      default:
        return null;
    }
  };

  const renderChildren = () => {
    if (!isExpandable || !isExpanded) return null;

    const entries = type === 'array'
      ? data.map((item: any, index: number) => ({ key: index, value: item }))
      : Object.entries(data).map(([key, value]) => ({ key, value }));

    return (
      <div className="ml-4 border-l border-border/30">
        {entries.map((entry, index) => (
          <JsonNode
            key={entry.key}
            data={entry.value}
            keyName={entry.key.toString()}
            level={level + 1}
            isLast={index === entries.length - 1}
          />
        ))}
      </div>
    );
  };

  return (
    <div className={`select-text ${!isLast ? 'border-b border-border/10 pb-1 mb-1' : ''}`}>
      <div className="flex items-start gap-2">
        {isExpandable && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 hover:bg-muted/50 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}

        {!isExpandable && <div className="w-4" />}

        {keyName !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-gray-600 dark:text-gray-400 font-medium">
              {keyName}:
            </span>
          </div>
        )}

        <div className="flex-1">
          {isExpandable ? (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400">
                {type === 'array' ? '[' : '{'}
              </span>
              {!isExpanded && (
                <>
                  <span className="text-muted-foreground text-sm">
                    {type === 'array' ? `${data.length} items` : `${Object.keys(data).length} keys`}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {type === 'array' ? ']' : '}'}
                  </span>
                </>
              )}
              {isExpanded && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {type === 'array' ? `${data.length} items` : `${Object.keys(data).length} keys`}
                  </Badge>
                  <button
                    onClick={() => copyToClipboard(keyName || 'root')}
                    className="p-1 hover:bg-muted/50 rounded"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            renderValue()
          )}
        </div>
      </div>

      {renderChildren()}

      {isExpandable && isExpanded && (
        <div className="ml-4 text-gray-500 dark:text-gray-400">
          {type === 'array' ? ']' : '}'}
        </div>
      )}
    </div>
  );
};

export default function JsonViewer({ data, title = "JSON Data", className = "" }: JsonViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRaw, setIsRaw] = useState(false);

  const formattedJson = JSON.stringify(data, null, 2);

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <h3 className="font-medium text-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsRaw(!isRaw)}
            className="text-xs"
          >
            {isRaw ? 'Tree View' : 'Raw JSON'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-8 w-8"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <ScrollArea className={`flex-1 ${isFullscreen ? 'fixed inset-0 z-50 bg-background border-0' : ''}`}>
        <div className="p-4">
          {isRaw ? (
            <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap">
              {formattedJson}
            </pre>
          ) : (
            <JsonNode
              data={data}
              level={0}
              isLast={true}
              expandable={true}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}