'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Quote,
  MessageSquare,
  Plus,
  Trash2,
  Save,
  Download,
  Upload,
  RefreshCw,
  Edit,
  X
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

interface TransformPrompt {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  targetFields: string[];
  examples?: Array<{ input: string; output: any }>;
  temperature?: number;
  priority?: number;
}

interface QuestionPattern {
  id: string;
  name: string;
  pattern: string;
  keywords: string[];
  priority?: number;
  enabled: boolean;
}

interface CitationPattern {
  id: string;
  name: string;
  format: string;
  fields: string[];
}

type PatternType = 'transforms' | 'questions' | 'citations';

export default function PatternManagement({ schemaId }: { schemaId?: string }) {
  const [transformPrompts, setTransformPrompts] = useState<TransformPrompt[]>([]);
  const [questionPatterns, setQuestionPatterns] = useState<QuestionPattern[]>([]);
  const [citationPatterns, setCitationPatterns] = useState<CitationPattern[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit states for each section
  const [editingTransform, setEditingTransform] = useState<string | 'new' | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<string | 'new' | null>(null);
  const [editingCitation, setEditingCitation] = useState<string | 'new' | null>(null);

  // Form data
  const [transformForm, setTransformForm] = useState<Partial<TransformPrompt>>({});
  const [questionForm, setQuestionForm] = useState<Partial<QuestionPattern>>({});
  const [citationForm, setCitationForm] = useState<Partial<CitationPattern>>({});

  useEffect(() => {
    if (schemaId) {
      loadAllPatterns();
    }
  }, [schemaId]);

  const loadAllPatterns = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadPatterns('questions'),
        loadPatterns('citations'),
        loadPatterns('transforms')
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadPatterns = async (type: PatternType) => {
    if (!schemaId) return;

    try {
      const response = await apiClient.get(`/api/v2/patterns/${type}?schemaId=${schemaId}`);
      if (response.data.success) {
        switch (type) {
          case 'transforms':
            setTransformPrompts(response.data.prompts || []);
            break;
          case 'questions':
            setQuestionPatterns(response.data.patterns || []);
            break;
          case 'citations':
            setCitationPatterns(response.data.patterns || []);
            break;
        }
      }
    } catch (error: any) {
      console.error(`Failed to load ${type}:`, error);
      toast.error(`Failed to load ${type}`);
    }
  };

  // Transform Prompts handlers
  const handleSaveTransform = async () => {
    if (!schemaId) return;

    try {
      if (editingTransform === 'new') {
        const newItem = { ...transformForm, id: `${Date.now()}` };
        const updatedItems = [...transformPrompts, newItem as TransformPrompt];
        await apiClient.post(`/api/v2/patterns/transforms/import`, {
          schemaId,
          prompts: updatedItems
        });
      } else {
        await apiClient.put(`/api/v2/patterns/transforms/${editingTransform}`, {
          schemaId,
          prompt: transformForm
        });
      }

      toast.success('Transform prompt saved');
      await loadPatterns('transforms');
      setEditingTransform(null);
      setTransformForm({});
    } catch (error) {
      toast.error('Failed to save transform prompt');
    }
  };

  const handleDeleteTransform = async (id: string) => {
    if (!schemaId || !confirm('Delete this transform prompt?')) return;

    try {
      await apiClient.delete(`/api/v2/patterns/transforms/${id}?schemaId=${schemaId}`);
      toast.success('Transform prompt deleted');
      await loadPatterns('transforms');
    } catch (error) {
      toast.error('Failed to delete transform prompt');
    }
  };

  // Question Patterns handlers
  const handleSaveQuestion = async () => {
    if (!schemaId) return;

    try {
      if (editingQuestion === 'new') {
        const newItem = { ...questionForm, id: `${Date.now()}`, enabled: questionForm.enabled !== false };
        const updatedItems = [...questionPatterns, newItem as QuestionPattern];
        await apiClient.post(`/api/v2/patterns/questions/import`, {
          schemaId,
          patterns: updatedItems
        });
      } else {
        await apiClient.put(`/api/v2/patterns/questions/${editingQuestion}`, {
          schemaId,
          pattern: questionForm
        });
      }

      toast.success('Question pattern saved');
      await loadPatterns('questions');
      setEditingQuestion(null);
      setQuestionForm({});
    } catch (error) {
      toast.error('Failed to save question pattern');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!schemaId || !confirm('Delete this question pattern?')) return;

    try {
      await apiClient.delete(`/api/v2/patterns/questions/${id}?schemaId=${schemaId}`);
      toast.success('Question pattern deleted');
      await loadPatterns('questions');
    } catch (error) {
      toast.error('Failed to delete question pattern');
    }
  };

  // Citation Patterns handlers
  const handleSaveCitation = async () => {
    if (!schemaId) return;

    try {
      if (editingCitation === 'new') {
        const newItem = { ...citationForm, id: `${Date.now()}` };
        const updatedItems = [...citationPatterns, newItem as CitationPattern];
        await apiClient.post(`/api/v2/patterns/citations/import`, {
          schemaId,
          patterns: updatedItems
        });
      } else {
        await apiClient.put(`/api/v2/patterns/citations/${editingCitation}`, {
          schemaId,
          pattern: citationForm
        });
      }

      toast.success('Citation pattern saved');
      await loadPatterns('citations');
      setEditingCitation(null);
      setCitationForm({});
    } catch (error) {
      toast.error('Failed to save citation pattern');
    }
  };

  const handleDeleteCitation = async (id: string) => {
    if (!schemaId || !confirm('Delete this citation pattern?')) return;

    try {
      await apiClient.delete(`/api/v2/patterns/citations/${id}?schemaId=${schemaId}`);
      toast.success('Citation pattern deleted');
      await loadPatterns('citations');
    } catch (error) {
      toast.error('Failed to delete citation pattern');
    }
  };

  // Import/Export handlers
  const handleExport = async (type: PatternType) => {
    if (!schemaId) return;

    try {
      const response = await apiClient.get(`/api/v2/patterns/${type}/export?schemaId=${schemaId}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}-patterns-${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Patterns exported');
    } catch (error) {
      toast.error('Failed to export patterns');
    }
  };

  const handleImport = async (type: PatternType, event: React.ChangeEvent<HTMLInputElement>) => {
    if (!schemaId) return;

    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        toast.error('Invalid JSON format');
        return;
      }

      await apiClient.post(`/api/v2/patterns/${type}/import`, {
        schemaId,
        [type === 'transforms' ? 'prompts' : 'patterns']: data
      });

      toast.success(`Imported ${data.length} patterns`);
      await loadPatterns(type);
    } catch (error) {
      toast.error('Failed to import patterns');
    }

    // Reset file input
    event.target.value = '';
  };

  if (!schemaId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Select a schema to manage patterns</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Question Patterns Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <span>Question Generation Patterns</span>
              <Badge variant="secondary">{questionPatterns.length}</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('import-questions')?.click()}
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('questions')}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingQuestion('new');
                  setQuestionForm({ enabled: true, priority: 1 });
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            id="import-questions"
            type="file"
            accept=".json"
            onChange={(e) => handleImport('questions', e)}
            className="hidden"
          />

          {/* Existing patterns */}
          {questionPatterns.map((pattern) => (
            <div key={pattern.id}>
              {editingQuestion === pattern.id ? (
                <div className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900/20">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Pattern Name</Label>
                      <Input
                        value={questionForm.name || ''}
                        onChange={(e) => setQuestionForm({ ...questionForm, name: e.target.value })}
                        placeholder="e.g., Price Inquiry"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Priority</Label>
                      <Input
                        type="number"
                        value={questionForm.priority || 1}
                        onChange={(e) => setQuestionForm({ ...questionForm, priority: parseInt(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Question Pattern Template</Label>
                    <Textarea
                      value={questionForm.pattern || ''}
                      onChange={(e) => setQuestionForm({ ...questionForm, pattern: e.target.value })}
                      placeholder="Template with {field} placeholders"
                      rows={2}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Keywords (comma-separated)</Label>
                    <Input
                      value={questionForm.keywords?.join(', ') || ''}
                      onChange={(e) => setQuestionForm({ ...questionForm, keywords: e.target.value.split(',').map(k => k.trim()) })}
                      placeholder="keyword1, keyword2, keyword3"
                      className="mt-1"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={questionForm.enabled !== false}
                      onChange={(e) => setQuestionForm({ ...questionForm, enabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label className="text-xs">Enabled</Label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleSaveQuestion}>
                      <Save className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingQuestion(null);
                        setQuestionForm({});
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg p-3 hover:border-primary/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{pattern.name}</span>
                        {!pattern.enabled && <Badge variant="secondary" className="text-xs">Disabled</Badge>}
                        <Badge variant="outline" className="text-xs">Priority: {pattern.priority || 1}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {pattern.pattern}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {pattern.keywords?.slice(0, 3).map((kw, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {kw}
                          </Badge>
                        ))}
                        {pattern.keywords?.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{pattern.keywords.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingQuestion(pattern.id);
                          setQuestionForm(pattern);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteQuestion(pattern.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* New pattern form */}
          {editingQuestion === 'new' && (
            <div className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900/20">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Pattern Name</Label>
                  <Input
                    value={questionForm.name || ''}
                    onChange={(e) => setQuestionForm({ ...questionForm, name: e.target.value })}
                    placeholder="e.g., Price Inquiry"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Input
                    type="number"
                    value={questionForm.priority || 1}
                    onChange={(e) => setQuestionForm({ ...questionForm, priority: parseInt(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Question Pattern Template</Label>
                <Textarea
                  value={questionForm.pattern || ''}
                  onChange={(e) => setQuestionForm({ ...questionForm, pattern: e.target.value })}
                  placeholder="Template with {field} placeholders"
                  rows={2}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Keywords (comma-separated)</Label>
                <Input
                  value={questionForm.keywords?.join(', ') || ''}
                  onChange={(e) => setQuestionForm({ ...questionForm, keywords: e.target.value.split(',').map(k => k.trim()) })}
                  placeholder="keyword1, keyword2, keyword3"
                  className="mt-1"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={questionForm.enabled !== false}
                  onChange={(e) => setQuestionForm({ ...questionForm, enabled: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label className="text-xs">Enabled</Label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSaveQuestion}>
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingQuestion(null);
                    setQuestionForm({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {questionPatterns.length === 0 && editingQuestion !== 'new' && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No question patterns yet. Click "Add" to create one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Citation Patterns Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Quote className="h-5 w-5" />
              <span>Citation Patterns</span>
              <Badge variant="secondary">{citationPatterns.length}</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('import-citations')?.click()}
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('citations')}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingCitation('new');
                  setCitationForm({});
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            id="import-citations"
            type="file"
            accept=".json"
            onChange={(e) => handleImport('citations', e)}
            className="hidden"
          />

          {/* Existing patterns */}
          {citationPatterns.map((pattern) => (
            <div key={pattern.id}>
              {editingCitation === pattern.id ? (
                <div className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900/20">
                  <div>
                    <Label className="text-xs">Pattern Name</Label>
                    <Input
                      value={citationForm.name || ''}
                      onChange={(e) => setCitationForm({ ...citationForm, name: e.target.value })}
                      placeholder="e.g., APA Style"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Citation Format</Label>
                    <Textarea
                      value={citationForm.format || ''}
                      onChange={(e) => setCitationForm({ ...citationForm, format: e.target.value })}
                      placeholder="Format template with {field} placeholders"
                      rows={3}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Fields (comma-separated)</Label>
                    <Input
                      value={citationForm.fields?.join(', ') || ''}
                      onChange={(e) => setCitationForm({ ...citationForm, fields: e.target.value.split(',').map(f => f.trim()) })}
                      placeholder="author, title, year, source"
                      className="mt-1"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleSaveCitation}>
                      <Save className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingCitation(null);
                        setCitationForm({});
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg p-3 hover:border-primary/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{pattern.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {pattern.format}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {pattern.fields?.map((field, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingCitation(pattern.id);
                          setCitationForm(pattern);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCitation(pattern.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* New pattern form */}
          {editingCitation === 'new' && (
            <div className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900/20">
              <div>
                <Label className="text-xs">Pattern Name</Label>
                <Input
                  value={citationForm.name || ''}
                  onChange={(e) => setCitationForm({ ...citationForm, name: e.target.value })}
                  placeholder="e.g., APA Style"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Citation Format</Label>
                <Textarea
                  value={citationForm.format || ''}
                  onChange={(e) => setCitationForm({ ...citationForm, format: e.target.value })}
                  placeholder="Format template with {field} placeholders"
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Fields (comma-separated)</Label>
                <Input
                  value={citationForm.fields?.join(', ') || ''}
                  onChange={(e) => setCitationForm({ ...citationForm, fields: e.target.value.split(',').map(f => f.trim()) })}
                  placeholder="author, title, year, source"
                  className="mt-1"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSaveCitation}>
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingCitation(null);
                    setCitationForm({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {citationPatterns.length === 0 && editingCitation !== 'new' && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No citation patterns yet. Click "Add" to create one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transform Prompts Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <span>Transform Prompts</span>
              <Badge variant="secondary">{transformPrompts.length}</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('import-transforms')?.click()}
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('transforms')}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingTransform('new');
                  setTransformForm({ temperature: 0.1, priority: 1 });
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            id="import-transforms"
            type="file"
            accept=".json"
            onChange={(e) => handleImport('transforms', e)}
            className="hidden"
          />

          {/* Existing prompts */}
          {transformPrompts.map((prompt) => (
            <div key={prompt.id}>
              {editingTransform === prompt.id ? (
                <div className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900/20">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Prompt Name</Label>
                      <Input
                        value={transformForm.name || ''}
                        onChange={(e) => setTransformForm({ ...transformForm, name: e.target.value })}
                        placeholder="e.g., Invoice Analysis"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Description</Label>
                      <Input
                        value={transformForm.description || ''}
                        onChange={(e) => setTransformForm({ ...transformForm, description: e.target.value })}
                        placeholder="Brief description"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">System Prompt</Label>
                    <Textarea
                      value={transformForm.systemPrompt || ''}
                      onChange={(e) => setTransformForm({ ...transformForm, systemPrompt: e.target.value })}
                      placeholder="LLM system prompt for transformation"
                      rows={4}
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Target Fields</Label>
                      <Input
                        value={transformForm.targetFields?.join(', ') || ''}
                        onChange={(e) => setTransformForm({ ...transformForm, targetFields: e.target.value.split(',').map(f => f.trim()) })}
                        placeholder="field1, field2"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Temperature</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={transformForm.temperature || 0.1}
                        onChange={(e) => setTransformForm({ ...transformForm, temperature: parseFloat(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Priority</Label>
                      <Input
                        type="number"
                        value={transformForm.priority || 1}
                        onChange={(e) => setTransformForm({ ...transformForm, priority: parseInt(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleSaveTransform}>
                      <Save className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingTransform(null);
                        setTransformForm({});
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg p-3 hover:border-primary/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{prompt.name}</span>
                        <Badge variant="outline" className="text-xs">Priority: {prompt.priority || 1}</Badge>
                        <Badge variant="outline" className="text-xs">Temp: {prompt.temperature || 0.1}</Badge>
                      </div>
                      {prompt.description && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {prompt.description}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {prompt.systemPrompt}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {prompt.targetFields?.map((field, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTransform(prompt.id);
                          setTransformForm(prompt);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTransform(prompt.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* New prompt form */}
          {editingTransform === 'new' && (
            <div className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900/20">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Prompt Name</Label>
                  <Input
                    value={transformForm.name || ''}
                    onChange={(e) => setTransformForm({ ...transformForm, name: e.target.value })}
                    placeholder="e.g., Invoice Analysis"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Input
                    value={transformForm.description || ''}
                    onChange={(e) => setTransformForm({ ...transformForm, description: e.target.value })}
                    placeholder="Brief description"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">System Prompt</Label>
                <Textarea
                  value={transformForm.systemPrompt || ''}
                  onChange={(e) => setTransformForm({ ...transformForm, systemPrompt: e.target.value })}
                  placeholder="LLM system prompt for transformation"
                  rows={4}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Target Fields</Label>
                  <Input
                    value={transformForm.targetFields?.join(', ') || ''}
                    onChange={(e) => setTransformForm({ ...transformForm, targetFields: e.target.value.split(',').map(f => f.trim()) })}
                    placeholder="field1, field2"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Temperature</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={transformForm.temperature || 0.1}
                    onChange={(e) => setTransformForm({ ...transformForm, temperature: parseFloat(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Input
                    type="number"
                    value={transformForm.priority || 1}
                    onChange={(e) => setTransformForm({ ...transformForm, priority: parseInt(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSaveTransform}>
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingTransform(null);
                    setTransformForm({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {transformPrompts.length === 0 && editingTransform !== 'new' && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No transform prompts yet. Click "Add" to create one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Refresh all button */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={loadAllPatterns}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh All Patterns
        </Button>
      </div>
    </div>
  );
}
