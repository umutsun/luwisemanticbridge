'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Database,
  Check,
  Copy,
  Edit,
  Trash2,
  Star,
  Crown,
  Lock,
  MoreVertical,
  Sparkles
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface UnifiedSchema {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  industry_code?: string;
  industry_name?: string;
  industry_icon?: string;
  fields: any[];
  templates: {
    analyze: string;
    citation: string;
    questions: string[];
  };
  llm_guide?: string;
  llm_config?: Record<string, string>;
  is_active: boolean;
  is_default: boolean;
  is_system?: boolean;
  source_preset_id?: string;
  user_id?: string;
  tier?: 'free' | 'pro' | 'enterprise';
  created_at?: string;
  updated_at?: string;
}

interface SchemaCardProps {
  schema: UnifiedSchema;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onSetActive: () => void;
  onEdit: () => void;
  onClone?: () => void;
  onDelete?: () => void;
}

const TIER_CONFIG = {
  free: {
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: null,
    label: 'Free'
  },
  pro: {
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: Star,
    label: 'Pro'
  },
  enterprise: {
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    icon: Crown,
    label: 'Enterprise'
  }
};

export default function SchemaCard({
  schema,
  isActive,
  isSelected,
  onSelect,
  onSetActive,
  onEdit,
  onClone,
  onDelete
}: SchemaCardProps) {
  const tierConfig = schema.tier ? TIER_CONFIG[schema.tier] : null;
  const hasLLMConfig = schema.llm_config && Object.keys(schema.llm_config).length > 0;

  return (
    <Card
      className={cn(
        'relative cursor-pointer transition-all duration-200 hover:shadow-md group',
        isSelected && 'ring-2 ring-primary shadow-md',
        isActive && 'border-emerald-500 dark:border-emerald-600',
        !isSelected && !isActive && 'hover:border-primary/50'
      )}
      onClick={onSelect}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-t-lg" />
      )}

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Icon and title */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={cn(
              'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg',
              isActive
                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                : 'bg-muted'
            )}>
              {schema.industry_icon || '📄'}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-sm truncate">
                  {schema.display_name}
                </h3>

                {/* Badges */}
                <div className="flex items-center gap-1">
                  {isActive && (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5 h-5">
                      <Check className="w-3 h-3 mr-0.5" />
                      Aktif
                    </Badge>
                  )}

                  {schema.is_system && (
                    <Badge variant="outline" className="text-[10px] px-1.5 h-5">
                      <Lock className="w-2.5 h-2.5 mr-0.5" />
                      Sistem
                    </Badge>
                  )}

                  {tierConfig && schema.tier !== 'free' && (
                    <Badge className={cn('text-[10px] px-1.5 h-5', tierConfig.color)}>
                      {tierConfig.icon && <tierConfig.icon className="w-2.5 h-2.5 mr-0.5" />}
                      {tierConfig.label}
                    </Badge>
                  )}

                  {hasLLMConfig && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 h-5">
                      <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                      LLM
                    </Badge>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {schema.description || schema.name}
              </p>

              {/* Meta info */}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  {schema.fields?.length || 0} alan
                </span>
                {schema.industry_name && (
                  <span>{schema.industry_name}</span>
                )}
              </div>
            </div>
          </div>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {!isActive && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSetActive(); }}>
                  <Check className="w-4 h-4 mr-2" />
                  Aktif Yap
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit className="w-4 h-4 mr-2" />
                {schema.is_system ? 'Görüntüle' : 'Düzenle'}
              </DropdownMenuItem>

              {onClone && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClone(); }}>
                  <Copy className="w-4 h-4 mr-2" />
                  Klonla
                </DropdownMenuItem>
              )}

              {!schema.is_system && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Sil
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Quick activate button (shown when not active and selected) */}
        {!isActive && isSelected && (
          <Button
            size="sm"
            className="w-full mt-3 h-8"
            onClick={(e) => { e.stopPropagation(); onSetActive(); }}
          >
            <Check className="w-3 h-3 mr-1" />
            Bu Şemayı Aktif Yap
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
