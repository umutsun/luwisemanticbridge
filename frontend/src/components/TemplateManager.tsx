'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Save,
  X,
  Plus,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  Edit,
  Copy,
} from 'lucide-react';

interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  focus_keywords: string[];
  target_fields: string[];
  extraction_prompt: string;
  created_at?: string;
  updated_at?: string;
}

interface TemplateManagerProps {
  open: boolean;
  onClose: () => void;
}

export default function TemplateManager({ open, onClose }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<AnalysisTemplate | null>(null);
  const [editingJson, setEditingJson] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [jsonError, setJsonError] = useState('');

  // Fetch templates
  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
      const response = await fetch(`${baseUrl}/api/v2/pdf/analysis-templates`);

      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      setTemplates(data.templates || []);

      // Select first template by default
      if (data.templates && data.templates.length > 0 && !selectedTemplate) {
        setSelectedTemplate(data.templates[0]);
        setEditingJson(JSON.stringify(data.templates[0], null, 2));
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  // Save template
  const handleSaveTemplate = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    setJsonError('');

    try {
      // Validate JSON
      let parsedTemplate: AnalysisTemplate;
      try {
        parsedTemplate = JSON.parse(editingJson);
      } catch (e) {
        setJsonError('Invalid JSON format');
        setSaving(false);
        return;
      }

      // Validate required fields
      if (!parsedTemplate.name || !parsedTemplate.category) {
        setJsonError('Template must have "name" and "category" fields');
        setSaving(false);
        return;
      }

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
      const response = await fetch(`${baseUrl}/api/v2/pdf/analysis-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: editingJson,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save template');
      }

      setSuccess('Template saved successfully!');
      await fetchTemplates();

      // Update selected template
      setSelectedTemplate(parsedTemplate);
    } catch (error: any) {
      console.error('Failed to save template:', error);
      setError(error.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  // Select template
  const handleSelectTemplate = (template: AnalysisTemplate) => {
    setSelectedTemplate(template);
    setEditingJson(JSON.stringify(template, null, 2));
    setJsonError('');
    setError('');
    setSuccess('');
  };

  // Create new template
  const handleCreateNew = () => {
    const newTemplate: AnalysisTemplate = {
      id: '',
      name: 'New Template',
      description: 'Template description',
      category: 'General',
      icon: '📄',
      focus_keywords: [],
      target_fields: [],
      extraction_prompt: 'Extraction instructions...',
    };

    setSelectedTemplate(newTemplate);
    setEditingJson(JSON.stringify(newTemplate, null, 2));
    setJsonError('');
    setError('');
    setSuccess('');
  };

  // Duplicate template
  const handleDuplicate = () => {
    if (!selectedTemplate) return;

    const duplicated: AnalysisTemplate = {
      ...selectedTemplate,
      id: '',
      name: `${selectedTemplate.name} (Copy)`,
    };

    setSelectedTemplate(duplicated);
    setEditingJson(JSON.stringify(duplicated, null, 2));
    setJsonError('');
    setError('');
    setSuccess('');
  };

  // Validate JSON on change
  const handleJsonChange = (value: string) => {
    setEditingJson(value);
    setJsonError('');

    try {
      JSON.parse(value);
    } catch (e) {
      setJsonError('Invalid JSON format');
    }
  };

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Analysis Template Manager
          </DialogTitle>
          <DialogDescription>
            Edit and manage document analysis templates for metadata extraction
          </DialogDescription>
        </DialogHeader>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-3 gap-4 flex-1 overflow-hidden">
          {/* Template List */}
          <div className="col-span-1 border rounded-lg p-3 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Templates</h3>
              <Button size="sm" variant="outline" onClick={handleCreateNew}>
                <Plus className="h-3 w-3 mr-1" />
                New
              </Button>
            </div>

            <ScrollArea className="flex-1">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-1">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className={`p-2 rounded cursor-pointer hover:bg-accent transition-colors ${
                        selectedTemplate?.id === template.id ? 'bg-accent' : ''
                      }`}
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{template.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{template.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {template.category}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* JSON Editor */}
          <div className="col-span-2 border rounded-lg p-3 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">Template JSON</h3>
                {selectedTemplate && (
                  <Badge variant="outline">
                    {selectedTemplate.id || 'New'}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleDuplicate} disabled={!selectedTemplate}>
                  <Copy className="h-3 w-3 mr-1" />
                  Duplicate
                </Button>
                <Button size="sm" onClick={handleSaveTemplate} disabled={saving || !!jsonError}>
                  {saving ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3 mr-1" />
                  )}
                  Save
                </Button>
              </div>
            </div>

            {jsonError && (
              <Alert variant="destructive" className="mb-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{jsonError}</AlertDescription>
              </Alert>
            )}

            <ScrollArea className="flex-1 border rounded p-2 bg-muted/30">
              <Textarea
                value={editingJson}
                onChange={(e) => handleJsonChange(e.target.value)}
                className="font-mono text-xs min-h-[500px] resize-none border-0 bg-transparent focus-visible:ring-0"
                placeholder="Select or create a template..."
              />
            </ScrollArea>

            {/* Template Info */}
            {selectedTemplate && (
              <div className="mt-3 p-3 bg-muted/50 rounded text-xs space-y-1">
                <p><strong>Focus Keywords:</strong> {selectedTemplate.focus_keywords?.join(', ') || 'None'}</p>
                <p><strong>Target Fields:</strong> {selectedTemplate.target_fields?.join(', ') || 'None'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Help Text */}
        <div className="text-xs text-muted-foreground border-t pt-3">
          <p><strong>Tip:</strong> Templates define how documents are analyzed. Modify <code>target_fields</code> to extract specific metadata,
          and <code>focus_keywords</code> to improve AI accuracy.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
