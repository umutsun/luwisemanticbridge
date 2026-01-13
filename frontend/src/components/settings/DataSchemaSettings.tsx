'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Database, Plus, Check, Save, RefreshCw, Search, Copy, MoreVertical, Download, Upload, Sparkles, Loader2, FileText, Trash2
} from 'lucide-react';
import { DataSchema, SchemaField } from '@/types/data-schema';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';

interface TopicEntity {
  pattern: string;      // regex pattern as string, e.g., "vergi levhası|vergi levha"
  entity: string;       // primary entity name
  synonyms: string[];   // synonyms for matching
}

interface UnifiedSchema {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  industry_code?: string;
  industry_icon?: string;
  fields: SchemaField[];
  templates: { analyze: string; citation: string; questions: string[]; example_questions?: string[] };
  llm_guide?: string;
  llm_config?: {
    analyzePrompt?: string;
    citationTemplate?: string;
    chatbotContext?: string;
    embeddingPrefix?: string;
    transformRules?: string;
    questionGenerator?: string;
    searchContext?: string;
    topicEntities?: TopicEntity[];    // Domain-specific topic entities
    keyTerms?: string[];              // Domain-specific key terms for validation
    sourceTables?: string[];          // Source tables for this schema
    authorityLevels?: Record<string, number>;  // Source type authority weights
  };
  is_active: boolean;
  is_default: boolean;
  is_system?: boolean;
  tier?: 'free' | 'pro' | 'enterprise';
}

interface EditedSchema extends DataSchema {
  llmConfig?: UnifiedSchema['llm_config'];
  isPreset?: boolean;
}

export default function DataSchemaSettings() {
  const [allSchemas, setAllSchemas] = useState<UnifiedSchema[]>([]);
  const [activeSchemaId, setActiveSchemaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [editedSchema, setEditedSchema] = useState<EditedSchema | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);

  // RAG Routing Schema state
  const [routingSchema, setRoutingSchema] = useState<string>('');
  const [routingSchemaLoading, setRoutingSchemaLoading] = useState(false);
  const [routingSchemaSaving, setRoutingSchemaSaving] = useState(false);

  // Modal state for editing
  const [editModal, setEditModal] = useState<{
    open: boolean;
    field: string;
    title: string;
    value: string;
    placeholder: string;
    format?: 'text' | 'keyvalue' | 'arrows';
  }>({ open: false, field: '', title: '', value: '', placeholder: '' });

  // LLM-powered suggestions
  const [llmSuggestions, setLlmSuggestions] = useState<string[]>([]);
  const [isLlmLoading, setIsLlmLoading] = useState(false);
  const [customTermInput, setCustomTermInput] = useState('');

  // Fetch LLM suggestions for keyTerms
  const fetchLlmSuggestions = async (query?: string) => {
    if (isLlmLoading) return;
    setIsLlmLoading(true);
    try {
      const response = await apiClient.post('/api/v2/data-schema/smart-autocomplete', {
        query: query || customTermInput || 'vergi',
        context: editedSchema?.description || '',
        field: 'keyTerms',
        maxSuggestions: 8
      });
      if (response.data?.suggestions) {
        setLlmSuggestions(response.data.suggestions);
      }
    } catch (error) {
      console.error('LLM suggestions error:', error);
    } finally {
      setIsLlmLoading(false);
    }
  };

  useEffect(() => { loadData(); loadRoutingSchema(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      console.log('🔍 [SCHEMA] Loading schemas...');

      const [schemasRes, settingsRes] = await Promise.all([
        apiClient.get('/api/v2/data-schema/all-schemas'),
        apiClient.get('/api/v2/data-schema/user/settings')
      ]);

      console.log('🔍 [SCHEMA] Schemas response:', schemasRes?.data);
      console.log('🔍 [SCHEMA] Settings response:', settingsRes?.data);

      const schemasData = schemasRes?.data?.schemas || [];
      setAllSchemas(Array.isArray(schemasData) ? schemasData : []);
      const activeId = settingsRes?.data?.settings?.active_schema_id;
      setActiveSchemaId(activeId);
      if (activeId) {
        const active = schemasData.find((s: UnifiedSchema) => s.id === activeId);
        if (active) selectSchema(active);
      }
      console.log('🔍 [SCHEMA] Loaded', schemasData.length, 'schemas');
    } catch (error: any) {
      console.error('🔍 [SCHEMA] Failed to load:', error);
      const errorMsg = error?.response?.status === 401
        ? 'Oturum süresi doldu. Lütfen tekrar giriş yapın.'
        : error?.response?.data?.error || error?.message || 'Veriler yüklenemedi';
      setLoadError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Load RAG Routing Schema from settings
  const loadRoutingSchema = async () => {
    try {
      setRoutingSchemaLoading(true);
      const res = await apiClient.get('/api/v2/settings/key/ragRoutingSchema');
      if (res?.data?.value) {
        const schema = typeof res.data.value === 'string' ? res.data.value : JSON.stringify(res.data.value, null, 2);
        setRoutingSchema(schema);
      }
    } catch (error: any) {
      // If not found, that's OK - will use defaults
      if (error?.response?.status !== 404) {
        console.error('Failed to load routing schema:', error);
      }
    } finally {
      setRoutingSchemaLoading(false);
    }
  };

  // Save RAG Routing Schema to settings
  const saveRoutingSchema = async () => {
    try {
      setRoutingSchemaSaving(true);
      // Validate JSON
      const parsed = JSON.parse(routingSchema);
      await apiClient.put('/api/v2/settings/key/ragRoutingSchema', {
        value: parsed,
        category: 'rag',
        description: 'RAG Response Routing Schema'
      });
      toast.success('Routing schema kaydedildi');
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        toast.error('Geçersiz JSON formatı');
      } else {
        toast.error('Kaydetme hatası: ' + (error?.message || 'Bilinmeyen hata'));
      }
    } finally {
      setRoutingSchemaSaving(false);
    }
  };

  // Reset routing schema to defaults
  const resetRoutingSchema = async () => {
    try {
      setRoutingSchemaLoading(true);
      const res = await apiClient.get('/api/v2/settings/rag-routing-schema/default');
      if (res?.data?.schema) {
        setRoutingSchema(JSON.stringify(res.data.schema, null, 2));
        toast.success('Varsayılan şema yüklendi');
      }
    } catch (error: any) {
      toast.error('Varsayılan şema yüklenemedi');
    } finally {
      setRoutingSchemaLoading(false);
    }
  };

  const selectSchema = (schema: UnifiedSchema) => {
    setSelectedSchemaId(schema.id);
    setEditedSchema({
      id: schema.id,
      name: schema.name,
      displayName: schema.display_name,
      description: schema.description || '',
      fields: schema.fields,
      templates: schema.templates,
      llmGuide: schema.llm_guide || '',
      llmConfig: schema.llm_config || {},
      isActive: schema.is_active,
      isDefault: schema.is_default,
      isPreset: schema.is_system,
      createdAt: '', updatedAt: ''
    });
  };

  const setActive = async (id: string) => {
    try {
      setSaving(true);
      await apiClient.post('/api/v2/data-schema/user/active-schema', { schemaId: id });
      setActiveSchemaId(id);
      toast.success('Aktif şema ayarlandı');
    } catch { toast.error('Hata'); }
    finally { setSaving(false); }
  };

  const createNew = () => {
    setSelectedSchemaId('new');
    setEditedSchema({
      id: '', name: 'yeni_sema', displayName: 'Yeni Şema', description: '',
      fields: [], templates: { analyze: '', citation: '', questions: [] },
      llmGuide: '', llmConfig: {}, isActive: true, isDefault: false, isPreset: false,
      createdAt: '', updatedAt: ''
    });
  };

  const saveSchema = async () => {
    if (!editedSchema) return;
    try {
      setSaving(true);

      // Prepare data for API
      const data: any = {
        name: editedSchema.name,
        display_name: editedSchema.displayName,
        description: editedSchema.description,
        fields: editedSchema.fields,
        templates: editedSchema.templates,
        llm_guide: editedSchema.llmGuide,
        llm_config: editedSchema.llmConfig
      };

      if (selectedSchemaId === 'new') {
        // Create new user schema
        const res = await apiClient.post('/api/v2/data-schema/schemas', data);
        const newSchema = res?.data?.schema || res?.data;
        setAllSchemas([...allSchemas, newSchema]);
        setSelectedSchemaId(newSchema.id);
        setEditedSchema({ ...editedSchema, id: newSchema.id, isPreset: false });
        toast.success('Şema oluşturuldu');
      } else if (editedSchema.isPreset) {
        // Update industry preset (admin only)
        await apiClient.put(`/api/v2/data-schema/presets/${editedSchema.id}`, data);
        setAllSchemas(allSchemas.map(s => s.id === editedSchema.id ? {
          ...s,
          ...data,
          display_name: data.display_name
        } as UnifiedSchema : s));
        toast.success('Sistem şeması güncellendi');
      } else {
        // Update user schema
        await apiClient.put(`/api/v2/data-schema/schemas/${editedSchema.id}`, data);
        setAllSchemas(allSchemas.map(s => s.id === editedSchema.id ? {
          ...s,
          ...data,
          display_name: data.display_name
        } as UnifiedSchema : s));
        toast.success('Şema güncellendi');
      }
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(error?.response?.data?.error || 'Kaydetme hatası');
    }
    finally { setSaving(false); }
  };

  const deleteSchema = async (id: string) => {
    const schema = allSchemas.find(s => s.id === id);
    if (schema?.is_system) {
      toast.error('Sistem şemaları silinemez');
      return;
    }
    if (!confirm('Silmek istediğinize emin misiniz?')) return;
    try {
      await apiClient.delete(`/api/v2/data-schema/schemas/${id}`);
      setAllSchemas(allSchemas.filter(s => s.id !== id));
      if (selectedSchemaId === id) { setSelectedSchemaId(null); setEditedSchema(null); }
      toast.success('Silindi');
    } catch { toast.error('Hata'); }
  };

  const cloneSchema = (schema: UnifiedSchema) => {
    setSelectedSchemaId('new');
    setEditedSchema({
      id: '', name: `${schema.name}_kopya`, displayName: `${schema.display_name} (Kopya)`,
      description: schema.description || '', fields: [...schema.fields],
      templates: { ...schema.templates },
      llmGuide: schema.llm_guide || '',
      llmConfig: schema.llm_config || {},
      isActive: true, isDefault: false, isPreset: false,
      createdAt: '', updatedAt: ''
    });
    toast.info('Klonlandı, kaydedin');
  };

  const exportSchema = () => {
    if (!editedSchema) return;
    const data = {
      name: editedSchema.name,
      displayName: editedSchema.displayName,
      description: editedSchema.description,
      fields: editedSchema.fields,
      templates: editedSchema.templates,
      llmConfig: editedSchema.llmConfig
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schema_${editedSchema.name}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Şema JSON olarak indirildi');
  };

  // Modal save handler
  const saveModalValue = async () => {
    const { field, value } = editModal;

    // Handle routingSchema separately (global setting, not schema-specific)
    if (field === 'routingSchema') {
      try {
        // Validate JSON
        if (value.trim()) {
          JSON.parse(value);
        }
        setRoutingSchema(value);
        setEditModal({ ...editModal, open: false });
        toast.success('Güncellendi - Kaydetmeyi unutmayın');
        return;
      } catch {
        toast.error('Geçersiz JSON formatı');
        return;
      }
    }

    if (!editedSchema) return;

    if (field === 'keyTerms') {
      const terms = value.split('\n').map(t => t.trim()).filter(t => t);
      setEditedSchema({ ...editedSchema, llmConfig: { ...editedSchema.llmConfig, keyTerms: terms } });
    } else if (field === 'authorityLevels') {
      const levels: Record<string, number> = {};
      value.split('\n').filter(l => l.trim()).forEach(line => {
        const [key, val] = line.split('=').map(s => s.trim());
        if (key && val && !isNaN(Number(val))) levels[key] = Number(val);
      });
      setEditedSchema({ ...editedSchema, llmConfig: { ...editedSchema.llmConfig, authorityLevels: levels } });
    } else if (field === 'topicEntities') {
      const entities = value.split('\n').filter(l => l.trim()).map(line => {
        const [pattern, syns] = line.split('→').map(s => s.trim());
        return { pattern: pattern || '', entity: pattern || '', synonyms: syns ? syns.split(',').map(s => s.trim()).filter(s => s) : [] };
      }).filter(e => e.pattern);
      setEditedSchema({ ...editedSchema, llmConfig: { ...editedSchema.llmConfig, topicEntities: entities } });
    } else if (field === 'analyzePrompt') {
      setEditedSchema({ ...editedSchema, templates: { ...editedSchema.templates, analyze: value } });
    } else if (field === 'chatbotContext') {
      setEditedSchema({ ...editedSchema, llmConfig: { ...editedSchema.llmConfig, chatbotContext: value } });
    } else if (field === 'fields') {
      try {
        const fields = JSON.parse(value);
        if (Array.isArray(fields)) setEditedSchema({ ...editedSchema, fields });
      } catch { toast.error('Geçersiz JSON'); return; }
    }
    setEditModal({ ...editModal, open: false });
    toast.success('Güncellendi');
  };

  const importSchema = () => {
    if (fileInputRef) fileInputRef.click();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate JSON structure
      if (!data.name || !data.fields) {
        toast.error('Geçersiz şema formatı');
        return;
      }

      setSelectedSchemaId('new');
      setEditedSchema({
        id: '',
        name: data.name || 'imported_schema',
        displayName: data.displayName || 'Imported Schema',
        description: data.description || '',
        fields: data.fields || [],
        templates: data.templates || { analyze: '', citation: '', questions: [] },
        llmGuide: '',
        llmConfig: data.llmConfig || {},
        isActive: true,
        isDefault: false,
        isPreset: false,
        createdAt: '', updatedAt: ''
      });
      toast.success('Şema JSON\'dan yüklendi, kaydedin');
    } catch (error) {
      console.error('Import error:', error);
      toast.error('JSON dosyası okunamadı');
    }

    // Reset file input
    if (e.target) e.target.value = '';
  };

  const filtered = allSchemas.filter(s =>
    !searchQuery || s.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isActive = activeSchemaId === selectedSchemaId;

  if (loading) return (
    <div className="grid grid-cols-[35%_65%] gap-6">
      {/* Sol - Skeleton Liste */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 bg-muted animate-pulse rounded" />
            <div className="flex gap-1">
              <div className="h-7 w-7 bg-muted animate-pulse rounded" />
              <div className="h-7 w-7 bg-muted animate-pulse rounded" />
              <div className="h-7 w-7 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <div className="h-8 bg-muted animate-pulse rounded" />
          <div className="space-y-1.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="p-2.5 rounded-md border">
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded mb-1.5" />
                <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {/* Sağ - Skeleton Detay */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-4 px-4">
          <div className="h-9 bg-muted animate-pulse rounded" />
          <div className="h-9 bg-muted animate-pulse rounded" />
          <div className="h-20 bg-muted animate-pulse rounded" />
          <div className="h-32 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    </div>
  );

  // Error state
  if (loadError) return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="text-center max-w-md">
        <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">Şemalar Yüklenemedi</h3>
        <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Tekrar Dene
        </Button>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-[35%_65%] gap-6">
      {/* Hidden file input for JSON import */}
      <input
        type="file"
        accept="application/json"
        ref={el => setFileInputRef(el)}
        onChange={handleFileImport}
        className="hidden"
      />

      {/* Sol - Şema Listesi */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4" /> Şemalar
            </CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={importSchema} className="h-7 px-2" title="JSON Import">
                <Upload className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={exportSchema} disabled={!editedSchema} className="h-7 px-2" title="JSON Export">
                <Download className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={createNew} className="h-7 px-2" title="Yeni Şema">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Ara..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-8 pl-8 text-sm" />
          </div>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {filtered.map(schema => (
              <div
                key={schema.id}
                onClick={() => selectSchema(schema)}
                className={`p-2.5 rounded-md border cursor-pointer transition-colors text-sm ${selectedSchemaId === schema.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${activeSchemaId === schema.id ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="font-medium truncate max-w-[150px]">{schema.display_name}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0"><MoreVertical className="w-3 h-3" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      {activeSchemaId !== schema.id && (
                        <DropdownMenuItem onClick={e => { e.stopPropagation(); setActive(schema.id); }}>
                          <Check className="w-3 h-3 mr-2" /> Aktif Yap
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); cloneSchema(schema); }}>
                        <Copy className="w-3 h-3 mr-2" /> Klonla
                      </DropdownMenuItem>
                      {!schema.is_system && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); deleteSchema(schema.id); }} className="text-destructive">
                            <Trash2 className="w-3 h-3 mr-2" /> Sil
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">{schema.fields.length} alan</p>
              </div>
            ))}
            {selectedSchemaId === 'new' && (
              <div className="p-2.5 rounded-md border-2 border-dashed border-primary bg-primary/5 text-sm">
                <span className="font-medium">Yeni Şema</span>
                <Badge variant="outline" className="ml-2 text-xs">Kaydedilmedi</Badge>
              </div>
            )}
            {!filtered.length && selectedSchemaId !== 'new' && (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Henüz şema yok</p>
                <Button size="sm" variant="outline" onClick={createNew} className="mt-3">
                  <Plus className="w-3 h-3 mr-1" />
                  İlk Şemanı Oluştur
                </Button>
              </div>
            )}
          </div>

          {/* Save button at bottom of left card - Prompts style */}
          {editedSchema && (
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={saveSchema} disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Kaydediliyor...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Kaydet
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sağ - Editör */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {editedSchema ? (
                <>
                  <span className="font-medium">{editedSchema.displayName || 'Yeni Şema'}</span>
                  {isActive && <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs"><Check className="w-2.5 h-2.5 mr-0.5" />Aktif</Badge>}
                </>
              ) : (
                <span className="text-muted-foreground">Şema seçin</span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {editedSchema ? (
            <>
              {/* Temel Bilgiler */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Şema ID</Label>
                  <Input
                    value={editedSchema.name}
                    onChange={e => setEditedSchema({ ...editedSchema, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    placeholder="vergi_mevzuati"
                    className="h-8 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Görünen Ad</Label>
                  <Input
                    value={editedSchema.displayName}
                    onChange={e => setEditedSchema({ ...editedSchema, displayName: e.target.value })}
                    placeholder="Vergi Mevzuatı"
                    className="h-8 mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Açıklama</Label>
                <Textarea
                  value={editedSchema.description}
                  onChange={e => setEditedSchema({ ...editedSchema, description: e.target.value })}
                  placeholder="Kısa açıklama..."
                  rows={2}
                  className="mt-1 text-sm"
                />
              </div>

              {/* LLM Konfigürasyonu - Click to Edit */}
              <div className="border-t pt-4 space-y-2">
                <h3 className="text-sm font-medium mb-3">LLM Konfigürasyonu</h3>

                {/* Citation Template - Inline (short) */}
                <div>
                  <Label className="text-xs">Citation Template</Label>
                  <Input
                    value={editedSchema.templates.citation || ''}
                    onChange={e => setEditedSchema({
                      ...editedSchema,
                      templates: { ...editedSchema.templates, citation: e.target.value }
                    })}
                    placeholder="{{madde_no}} - {{tarih}}"
                    className="h-8 mt-1 font-mono"
                  />
                </div>

                {/* Clickable Cards for longer fields */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {/* Analyze Prompt Card */}
                  <div
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditModal({
                      open: true,
                      field: 'analyzePrompt',
                      title: 'Analyze Prompt',
                      value: editedSchema.templates.analyze || '',
                      placeholder: 'Dokümanı analiz etmek için LLM\'e verilecek talimatlar...'
                    })}
                  >
                    <div className="text-xs font-medium mb-1">Analyze Prompt</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {editedSchema.templates.analyze?.substring(0, 60) || 'Tanımsız'}...
                    </div>
                  </div>

                  {/* Chatbot Context Card */}
                  <div
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditModal({
                      open: true,
                      field: 'chatbotContext',
                      title: 'Chatbot Context',
                      value: editedSchema.llmConfig?.chatbotContext || '',
                      placeholder: 'Chatbot\'un domain uzmanlığı ve davranış kuralları...'
                    })}
                  >
                    <div className="text-xs font-medium mb-1">Chatbot Context</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {editedSchema.llmConfig?.chatbotContext?.substring(0, 60) || 'Tanımsız'}...
                    </div>
                  </div>
                </div>
              </div>

              {/* Domain Configuration - Click to Edit */}
              <div className="border-t pt-4 space-y-2">
                <h3 className="text-sm font-medium mb-3">Domain Konfigürasyonu</h3>

                {/* Clickable Cards Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Key Terms Card */}
                  <div
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditModal({
                      open: true,
                      field: 'keyTerms',
                      title: 'Anahtar Terimler',
                      value: (editedSchema.llmConfig?.keyTerms || []).join('\n'),
                      placeholder: 'Her satıra bir terim:\nceza\nvergi\nkdv\nmuafiyet'
                    })}
                  >
                    <div className="text-xs font-medium mb-1">Anahtar Terimler</div>
                    <div className="text-lg font-bold text-primary">{(editedSchema.llmConfig?.keyTerms || []).length}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(editedSchema.llmConfig?.keyTerms || []).slice(0, 3).join(', ') || 'Tanımsız'}
                    </div>
                  </div>

                  {/* Authority Levels Card */}
                  <div
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditModal({
                      open: true,
                      field: 'authorityLevels',
                      title: 'Kaynak Öncelikleri',
                      value: Object.entries(editedSchema.llmConfig?.authorityLevels || {}).map(([k, v]) => `${k}=${v}`).join('\n'),
                      placeholder: 'Her satıra kaynak=öncelik:\nkanun=100\nteblig=90\nmakale=50'
                    })}
                  >
                    <div className="text-xs font-medium mb-1">Kaynak Öncelikleri</div>
                    <div className="text-lg font-bold text-primary">{Object.keys(editedSchema.llmConfig?.authorityLevels || {}).length}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {Object.keys(editedSchema.llmConfig?.authorityLevels || {}).slice(0, 3).join(', ') || 'Tanımsız'}
                    </div>
                  </div>

                  {/* Topic Entities Card */}
                  <div
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditModal({
                      open: true,
                      field: 'topicEntities',
                      title: 'Konu Eşleşmeleri',
                      value: (editedSchema.llmConfig?.topicEntities || []).map(e => `${e.pattern} → ${e.synonyms?.join(', ') || ''}`).join('\n'),
                      placeholder: 'Her satıra pattern → synonym1, synonym2:\nvergi levhası → levha, asma\nkdv → katma değer vergisi'
                    })}
                  >
                    <div className="text-xs font-medium mb-1">Konu Eşleşmeleri</div>
                    <div className="text-lg font-bold text-primary">{(editedSchema.llmConfig?.topicEntities || []).length}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(editedSchema.llmConfig?.topicEntities || []).slice(0, 2).map(e => e.pattern).join(', ') || 'Tanımsız'}
                    </div>
                  </div>

                  {/* Veri Alanları Card */}
                  <div
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditModal({
                      open: true,
                      field: 'fields',
                      title: 'Veri Alanları (JSON)',
                      value: JSON.stringify(editedSchema.fields || [], null, 2),
                      placeholder: '[{"key": "kanun_no", "label": "Kanun No", "type": "reference"}]'
                    })}
                  >
                    <div className="text-xs font-medium mb-1">Veri Alanları</div>
                    <div className="text-lg font-bold text-primary">{(editedSchema.fields || []).length}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(editedSchema.fields || []).slice(0, 3).map(f => f.label || f.key).join(', ') || 'Tanımsız'}
                    </div>
                  </div>
                </div>
              </div>

            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Düzenlemek için şema seçin</p>
            </div>
          )}

          {/* RAG Yanıt Format Şeması - Global Setting (Always Visible) */}
          <div className="border-t pt-4 space-y-2 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Yanıt Format Şeması</h3>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={resetRoutingSchema}
                  disabled={routingSchemaLoading}
                  title="Varsayılan şemayı yükle"
                >
                  <RefreshCw className={`w-3 h-3 ${routingSchemaLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* RAG Routing Schema Card */}
            <div
              className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setEditModal({
                open: true,
                field: 'routingSchema',
                title: 'RAG Yanıt Format Şeması',
                value: routingSchema || '',
                placeholder: '{"version": "1.0", "routes": {...}, "globalSettings": {...}}'
              })}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-xs font-medium mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    RAG Routing Schema
                  </div>
                  <div className="text-xs text-muted-foreground">
                    4 route: NEEDS_CLARIFICATION, OUT_OF_SCOPE, NOT_FOUND, FOUND
                  </div>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {routingSchema ? 'Özel' : 'Varsayılan'}
                </Badge>
              </div>
              {routingSchema && (
                <div className="mt-2 text-xs text-muted-foreground font-mono bg-muted/30 rounded px-2 py-1 line-clamp-2">
                  {routingSchema.substring(0, 80)}...
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Yanıt formatını, kaynak önceliklerini ve dipnot şablonlarını yapılandırır.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal - Different UI for keyTerms */}
      <Dialog open={editModal.open} onOpenChange={(open) => setEditModal({ ...editModal, open })}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{editModal.title}</DialogTitle>
          </DialogHeader>

          {editModal.field === 'routingSchema' ? (
            /* RAG Routing Schema Editor */
            <div className="py-2 space-y-3">
              {/* Quick Guide */}
              <div className="bg-muted/50 border rounded-lg p-3">
                <h4 className="text-xs font-medium mb-2">Format Yapısı:</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div><span className="font-medium text-foreground">NEEDS_CLARIFICATION:</span> Belirsiz sorgular - öneri sorular</div>
                  <div><span className="font-medium text-foreground">OUT_OF_SCOPE:</span> Kapsam dışı - tek satır uyarı</div>
                  <div><span className="font-medium text-foreground">NOT_FOUND:</span> Kaynak yok - kısa açıklama</div>
                  <div><span className="font-medium text-foreground">FOUND:</span> Kaynak var - 4 başlıklı mini-makale + dipnotlar</div>
                </div>
              </div>

              {/* JSON Editor */}
              <div>
                <Textarea
                  value={editModal.value}
                  onChange={(e) => setEditModal({ ...editModal, value: e.target.value })}
                  placeholder={editModal.placeholder}
                  rows={18}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Boş bırakılırsa backend varsayılan şemayı kullanır. JSON formatı gereklidir.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await apiClient.get('/api/v2/settings/rag-routing-schema/default');
                      if (res?.data?.schema) {
                        setEditModal({ ...editModal, value: JSON.stringify(res.data.schema, null, 2) });
                        toast.success('Varsayılan şema yüklendi');
                      }
                    } catch {
                      toast.error('Varsayılan şema yüklenemedi');
                    }
                  }}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Varsayılan Şemayı Yükle
                </Button>
              </div>
            </div>
          ) : editModal.field === 'keyTerms' ? (
            /* Terimler Sözlüğü - Dictionary Style UI */
            <div className="py-2 space-y-3">
              {/* Suggested Terms by Category - Marker Style */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Önerilen Terimler (tıkla ekle)</Label>
                <div className="grid grid-cols-1 gap-2 max-h-[180px] overflow-y-auto">
                  {/* Vergi/Hukuk Terms - Yellow Marker */}
                  <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(45deg, rgba(254, 240, 138, 0.7) 0%, rgba(253, 224, 71, 0.5) 100%)' }}>
                    <div className="text-xs font-semibold text-yellow-900 dark:text-yellow-100 mb-1.5">Vergi & Hukuk</div>
                    <div className="flex flex-wrap gap-1">
                      {['vergi', 'kdv', 'stopaj', 'tevkifat', 'muafiyet', 'istisna', 'beyanname', 'matrah', 'ceza', 'usulsüzlük', 'kanun', 'madde', 'tebliğ', 'özelge', 'indirim', 'mahsup'].map(term => {
                        const isAdded = editModal.value.split('\n').includes(term);
                        return (
                          <span
                            key={term}
                            className={`text-xs px-2 py-0.5 cursor-pointer transition-all font-medium ${
                              isAdded
                                ? 'bg-yellow-400 text-yellow-900 shadow-sm'
                                : 'bg-yellow-200/60 text-yellow-800 hover:bg-yellow-300'
                            }`}
                            style={{ borderRadius: '2px' }}
                            onClick={() => {
                              if (!isAdded) {
                                setEditModal({ ...editModal, value: editModal.value ? editModal.value + '\n' + term : term });
                              }
                            }}
                          >
                            {isAdded ? '✓ ' : ''}{term}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Belge/İşlem Terms - Green Marker */}
                  <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(45deg, rgba(187, 247, 208, 0.7) 0%, rgba(134, 239, 172, 0.5) 100%)' }}>
                    <div className="text-xs font-semibold text-green-900 dark:text-green-100 mb-1.5">Belge & İşlem</div>
                    <div className="flex flex-wrap gap-1">
                      {['fatura', 'belge', 'kayıt', 'defter', 'makbuz', 'dekont', 'tahakkuk', 'tahsil', 'ödeme', 'başvuru', 'bildirim', 'beyan'].map(term => {
                        const isAdded = editModal.value.split('\n').includes(term);
                        return (
                          <span
                            key={term}
                            className={`text-xs px-2 py-0.5 cursor-pointer transition-all font-medium ${
                              isAdded
                                ? 'bg-green-400 text-green-900 shadow-sm'
                                : 'bg-green-200/60 text-green-800 hover:bg-green-300'
                            }`}
                            style={{ borderRadius: '2px' }}
                            onClick={() => {
                              if (!isAdded) {
                                setEditModal({ ...editModal, value: editModal.value ? editModal.value + '\n' + term : term });
                              }
                            }}
                          >
                            {isAdded ? '✓ ' : ''}{term}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Zorunluluk/Yaptırım Terms - Pink Marker */}
                  <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(45deg, rgba(251, 207, 232, 0.7) 0%, rgba(249, 168, 212, 0.5) 100%)' }}>
                    <div className="text-xs font-semibold text-pink-900 dark:text-pink-100 mb-1.5">Zorunluluk & Yaptırım</div>
                    <div className="flex flex-wrap gap-1">
                      {['zorunlu', 'mecburi', 'gerekli', 'şart', 'yükümlü', 'sorumlu', 'yasak', 'serbest', 'muaf', 'tabi'].map(term => {
                        const isAdded = editModal.value.split('\n').includes(term);
                        return (
                          <span
                            key={term}
                            className={`text-xs px-2 py-0.5 cursor-pointer transition-all font-medium ${
                              isAdded
                                ? 'bg-pink-400 text-pink-900 shadow-sm'
                                : 'bg-pink-200/60 text-pink-800 hover:bg-pink-300'
                            }`}
                            style={{ borderRadius: '2px' }}
                            onClick={() => {
                              if (!isAdded) {
                                setEditModal({ ...editModal, value: editModal.value ? editModal.value + '\n' + term : term });
                              }
                            }}
                          >
                            {isAdded ? '✓ ' : ''}{term}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* LLM-powered suggestions - Purple/Violet Marker */}
              <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(45deg, rgba(221, 214, 254, 0.7) 0%, rgba(196, 181, 253, 0.5) 100%)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-700" />
                    <span className="text-xs font-semibold text-violet-900 dark:text-violet-100">Akıllı Öneriler (LLM)</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-violet-700 hover:text-violet-800 hover:bg-violet-200/50"
                    onClick={() => fetchLlmSuggestions()}
                    disabled={isLlmLoading}
                  >
                    {isLlmLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span className="ml-1">Yenile</span>
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {llmSuggestions.length > 0 ? (
                    llmSuggestions.map(term => {
                      const isAdded = editModal.value.split('\n').includes(term);
                      return (
                        <span
                          key={term}
                          className={`text-xs px-2 py-0.5 cursor-pointer transition-all font-medium ${
                            isAdded
                              ? 'bg-violet-400 text-violet-900 shadow-sm'
                              : 'bg-violet-200/60 text-violet-800 hover:bg-violet-300'
                          }`}
                          style={{ borderRadius: '2px' }}
                          onClick={() => {
                            if (!isAdded) {
                              setEditModal({ ...editModal, value: editModal.value ? editModal.value + '\n' + term : term });
                            }
                          }}
                        >
                          {isAdded ? '✓ ' : ''}{term}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-xs text-violet-700/70">
                      {isLlmLoading ? 'Öneriler yükleniyor...' : 'Yenile butonuna tıklayarak LLM önerileri alın'}
                    </span>
                  )}
                </div>
              </div>

              {/* Custom term input with LLM - Marker themed */}
              <div className="flex gap-2 pt-2 border-t">
                <Input
                  id="customTermInput"
                  placeholder="Terim yaz, LLM önersin..."
                  className="flex-1"
                  value={customTermInput}
                  onChange={(e) => setCustomTermInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = customTermInput.trim().toLowerCase();
                      if (val && !editModal.value.split('\n').includes(val)) {
                        setEditModal({ ...editModal, value: editModal.value ? editModal.value + '\n' + val : val });
                        setCustomTermInput('');
                      }
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-violet-700 border-violet-300 hover:bg-violet-100"
                  onClick={() => {
                    if (customTermInput.trim()) {
                      fetchLlmSuggestions(customTermInput);
                    }
                  }}
                  disabled={isLlmLoading || !customTermInput.trim()}
                  title="LLM ile akıllı öneri al"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const val = customTermInput.trim().toLowerCase();
                  if (val && !editModal.value.split('\n').includes(val)) {
                    setEditModal({ ...editModal, value: editModal.value ? editModal.value + '\n' + val : val });
                    setCustomTermInput('');
                  }
                }}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Selected Terms */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium">Seçilen Terimler ({editModal.value.split('\n').filter(t => t.trim()).length})</Label>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setEditModal({ ...editModal, value: '' })}>
                    Tümünü Sil
                  </Button>
                </div>
                <div className="border rounded-lg p-2 min-h-[80px] max-h-[120px] overflow-y-auto bg-muted/20">
                  <div className="flex flex-wrap gap-1">
                    {editModal.value.split('\n').filter(t => t.trim()).map((term, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => {
                          const terms = editModal.value.split('\n').filter(t => t.trim());
                          terms.splice(i, 1);
                          setEditModal({ ...editModal, value: terms.join('\n') });
                        }}
                      >
                        {term} ×
                      </Badge>
                    ))}
                    {!editModal.value.trim() && <span className="text-xs text-muted-foreground">Terim seçilmedi</span>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Default textarea UI for other fields */
            <div className="py-4">
              <Textarea
                value={editModal.value}
                onChange={(e) => setEditModal({ ...editModal, value: e.target.value })}
                placeholder={editModal.placeholder}
                rows={15}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {editModal.field === 'authorityLevels' && 'Format: kaynak=öncelik (örn: kanun=100)'}
                {editModal.field === 'topicEntities' && 'Format: pattern → synonym1, synonym2'}
                {editModal.field === 'fields' && 'JSON formatında alan tanımları'}
                {editModal.field === 'analyzePrompt' && 'Doküman analizi için LLM talimatları'}
                {editModal.field === 'chatbotContext' && 'Chat yanıtları için domain bağlamı'}
                {editModal.field === 'routingSchema' && 'RAG yanıt formatı ve routing kuralları'}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal({ ...editModal, open: false })}>
              İptal
            </Button>
            {editModal.field === 'routingSchema' ? (
              <Button onClick={async () => {
                try {
                  if (editModal.value.trim()) {
                    const parsed = JSON.parse(editModal.value);
                    await apiClient.put('/api/v2/settings/key/ragRoutingSchema', {
                      value: parsed,
                      category: 'rag',
                      description: 'RAG Response Routing Schema'
                    });
                  } else {
                    // Clear the routing schema
                    await apiClient.put('/api/v2/settings/key/ragRoutingSchema', {
                      value: null,
                      category: 'rag',
                      description: 'RAG Response Routing Schema'
                    });
                  }
                  setRoutingSchema(editModal.value);
                  setEditModal({ ...editModal, open: false });
                  toast.success('Routing şeması kaydedildi');
                } catch (err) {
                  if (err instanceof SyntaxError) {
                    toast.error('Geçersiz JSON formatı');
                  } else {
                    toast.error('Kaydetme hatası');
                  }
                }
              }}>
                <Save className="w-4 h-4 mr-2" />
                Kaydet
              </Button>
            ) : (
              <Button onClick={saveModalValue}>
                <Check className="w-4 h-4 mr-2" />
                Uygula
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
