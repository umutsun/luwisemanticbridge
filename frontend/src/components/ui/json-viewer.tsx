'use client';

import React, { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface JsonViewerProps {
  data: any;
  title?: string;
  className?: string;
  selectedFields?: Set<string>;
  onFieldToggle?: (path: string) => void;
  highlightPath?: string;
  editMode?: boolean;
  onValueChange?: (path: string, newValue: any) => void;
  toolbar?: React.ReactNode;
}

interface JsonNodeProps {
  data: any;
  keyName?: string;
  level: number;
  isLast: boolean;
  path?: string;
  selectedFields?: Set<string>;
  onFieldToggle?: (path: string) => void;
  highlightPath?: string;
  editMode?: boolean;
  onValueChange?: (path: string, newValue: any) => void;
}

const JsonNode: React.FC<JsonNodeProps> = ({
  data,
  keyName,
  level,
  isLast,
  path = '',
  selectedFields,
  onFieldToggle,
  highlightPath,
  editMode,
  onValueChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const currentPath = path ? `${path}.${keyName}` : keyName || 'root';
  const isHighlighted = highlightPath === currentPath;
  const isSelected = selectedFields?.has(currentPath);

  const getType = (value: any) => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  const type = getType(data);
  const isExpandable = type === 'object' || type === 'array';
  const isLeafNode = !isExpandable;

  // Hide internal fields that start with underscore except _textExcerpt and _contentHash
  const shouldHideField = keyName?.startsWith('_') && keyName !== '_textExcerpt' && keyName !== '_contentHash';

  const handleCheckboxChange = (checked: boolean) => {
    onFieldToggle?.(currentPath);
  };

  const handleEdit = () => {
    if (!editMode || !isLeafNode) return;
    setIsEditing(true);
    setEditValue(JSON.stringify(data));
  };

  const handleSaveEdit = () => {
    try {
      const parsed = JSON.parse(editValue);
      onValueChange?.(currentPath, parsed);
      setIsEditing(false);
    } catch (error) {
      // Invalid JSON, try as string
      onValueChange?.(currentPath, editValue);
      setIsEditing(false);
    }
  };

  const renderValue = () => {
    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') setIsEditing(false);
          }}
          className="flex-1 px-2 py-0.5 text-xs bg-background border border-primary rounded focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
      );
    }

    switch (type) {
      case 'string':
        return <span className="text-green-600 dark:text-green-400 text-xs" onDoubleClick={handleEdit}>"{data}"</span>;
      case 'number':
        return <span className="text-blue-600 dark:text-blue-400 text-xs" onDoubleClick={handleEdit}>{data}</span>;
      case 'boolean':
        return <span className="text-purple-600 dark:text-purple-400 text-xs" onDoubleClick={handleEdit}>{data.toString()}</span>;
      case 'null':
        return <span className="text-gray-500 dark:text-gray-400 text-xs">null</span>;
      case 'undefined':
        return <span className="text-gray-500 dark:text-gray-400 text-xs">undefined</span>;
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
      <div className="ml-6 border-l border-border/30 pl-2">
        {entries.map((entry, index) => (
          <JsonNode
            key={entry.key}
            data={entry.value}
            keyName={entry.key.toString()}
            level={level + 1}
            isLast={index === entries.length - 1}
            path={currentPath}
            selectedFields={selectedFields}
            onFieldToggle={onFieldToggle}
            highlightPath={highlightPath}
            editMode={editMode}
            onValueChange={onValueChange}
          />
        ))}
      </div>
    );
  };

  // Don't render hidden internal fields
  if (shouldHideField) {
    return null;
  }

  return (
    <div
      id={`json-node-${currentPath.replace(/\./g, '-')}`}
      className={`py-1 ${
        isHighlighted ? 'bg-yellow-100 dark:bg-yellow-900/30 rounded px-2' : ''
      } ${
        isSelected ? 'bg-blue-100 dark:bg-blue-900/40 rounded px-2 border-l-2 border-blue-500' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox for all nodes (both parent and leaf) */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
          className="mt-0.5"
        />

        {/* Expand/collapse button */}
        {isExpandable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
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

        {/* Key name */}
        {keyName !== undefined && (
          <span className="text-gray-700 dark:text-gray-300 font-medium text-xs">
            {keyName}:
          </span>
        )}

        {/* Value */}
        <div className="flex-1 flex items-center gap-2">
          {isExpandable ? (
            <>
              <span className="text-gray-500 dark:text-gray-400">
                {type === 'array' ? '[' : '{'}
              </span>
              {!isExpanded && (
                <>
                  <span className="text-muted-foreground text-xs">
                    {type === 'array' ? `${data.length} items` : `${Object.keys(data).length} keys`}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {type === 'array' ? ']' : '}'}
                  </span>
                </>
              )}
              {isExpanded && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {type === 'array' ? `${data.length} items` : `${Object.keys(data).length} keys`}
                </Badge>
              )}
            </>
          ) : (
            renderValue()
          )}
        </div>
      </div>

      {renderChildren()}

      {isExpandable && isExpanded && (
        <div className="ml-6 text-gray-500 dark:text-gray-400 text-xs">
          {type === 'array' ? ']' : '}'}
        </div>
      )}
    </div>
  );
};

export default function JsonViewer({
  data,
  title = "",
  className = "",
  selectedFields,
  onFieldToggle,
  highlightPath,
  editMode = false,
  onValueChange,
  toolbar
}: JsonViewerProps) {
  // Scroll to highlighted element when highlightPath changes
  useEffect(() => {
    if (highlightPath) {
      const elementId = `json-node-${highlightPath.replace(/\./g, '-')}`;
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightPath]);

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {(title || toolbar || selectedFields) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-background/50">
          <div className="flex items-center gap-2">
            {title && <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{title}</h3>}
            {selectedFields && (
              <Badge variant="secondary" className="text-[9px] h-3.5 px-1">
                {selectedFields.size} selected
              </Badge>
            )}
          </div>
          {toolbar}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4">
          <JsonNode
            data={data}
            level={0}
            isLast={true}
            path=""
            selectedFields={selectedFields}
            onFieldToggle={onFieldToggle}
            highlightPath={highlightPath}
            editMode={editMode}
            onValueChange={onValueChange}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
