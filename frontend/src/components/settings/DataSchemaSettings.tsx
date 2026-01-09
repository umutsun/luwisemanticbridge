'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Database, Plus, Check, Save, RefreshCw, Search, Copy, MoreVertical, Download, Upload
} from 'lucide-react';
import { DataSchema, SchemaField } from '@/types/data-schema';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

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

  useEffect(() => { loadData(); }, []);

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
        <CardContent className="px-4 pb-4 space-y-4 max-h-[600px] overflow-y-auto">
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

              {/* LLM Konfigürasyonu - Sadece veri analizi ve citation için */}
              <div className="border-t pt-4 space-y-3">
                <h3 className="text-sm font-medium">LLM Konfigürasyonu</h3>

                {/* Analyze Prompt */}
                <div>
                  <Label className="text-xs">Analyze Prompt</Label>
                  <Textarea
                    value={editedSchema.templates.analyze || ''}
                    onChange={e => setEditedSchema({
                      ...editedSchema,
                      templates: { ...editedSchema.templates, analyze: e.target.value }
                    })}
                    placeholder="Belgeyi analiz et ve önemli bilgileri çıkar..."
                    rows={3}
                    className="mt-1 text-sm font-mono"
                  />
                </div>

                {/* Citation Template */}
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

                {/* Chatbot Context */}
                <div>
                  <Label className="text-xs">Chatbot Context</Label>
                  <Textarea
                    value={editedSchema.llmConfig?.chatbotContext || ''}
                    onChange={e => setEditedSchema({
                      ...editedSchema,
                      llmConfig: { ...editedSchema.llmConfig, chatbotContext: e.target.value }
                    })}
                    placeholder="Domain uzmanı olarak yanıt ver..."
                    rows={3}
                    className="mt-1 text-sm font-mono"
                  />
                </div>

              </div>

              {/* Domain Configuration - Simplified */}
              <div className="border-t pt-4 space-y-4">
                <h3 className="text-sm font-medium">Domain Konfigürasyonu</h3>

                {/* Key Terms - Tag style display */}
                <div>
                  <Label className="text-xs mb-2 block">Anahtar Terimler</Label>
                  <div className="flex flex-wrap gap-1 mb-2 p-2 bg-muted/30 rounded min-h-[40px]">
                    {(editedSchema.llmConfig?.keyTerms || []).map((term, i) => (
                      <Badge key={i} variant="secondary" className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => {
                          const newTerms = [...(editedSchema.llmConfig?.keyTerms || [])];
                          newTerms.splice(i, 1);
                          setEditedSchema({ ...editedSchema, llmConfig: { ...editedSchema.llmConfig, keyTerms: newTerms } });
                        }}>
                        {term} ×
                      </Badge>
                    ))}
                    {!(editedSchema.llmConfig?.keyTerms || []).length && <span className="text-xs text-muted-foreground">Terim yok</span>}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="newKeyTerm"
                      placeholder="Yeni terim ekle..."
                      className="h-8 text-sm flex-1"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const input = e.target as HTMLInputElement;
                          const val = input.value.trim();
                          if (val && !(editedSchema.llmConfig?.keyTerms || []).includes(val)) {
                            setEditedSchema({
                              ...editedSchema,
                              llmConfig: { ...editedSchema.llmConfig, keyTerms: [...(editedSchema.llmConfig?.keyTerms || []), val] }
                            });
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <Button size="sm" variant="outline" className="h-8"
                      onClick={() => {
                        const input = document.getElementById('newKeyTerm') as HTMLInputElement;
                        const val = input?.value.trim();
                        if (val && !(editedSchema.llmConfig?.keyTerms || []).includes(val)) {
                          setEditedSchema({
                            ...editedSchema,
                            llmConfig: { ...editedSchema.llmConfig, keyTerms: [...(editedSchema.llmConfig?.keyTerms || []), val] }
                          });
                          input.value = '';
                        }
                      }}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Authority Levels - Simple key=value format */}
                <div>
                  <Label className="text-xs mb-2 block">Kaynak Öncelikleri (yüksek=güvenilir)</Label>
                  <Textarea
                    value={Object.entries(editedSchema.llmConfig?.authorityLevels || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                    onChange={e => {
                      const lines = e.target.value.split('\n').filter(l => l.trim());
                      const levels: Record<string, number> = {};
                      lines.forEach(line => {
                        const [key, val] = line.split('=').map(s => s.trim());
                        if (key && val && !isNaN(Number(val))) {
                          levels[key] = Number(val);
                        }
                      });
                      setEditedSchema({ ...editedSchema, llmConfig: { ...editedSchema.llmConfig, authorityLevels: levels } });
                    }}
                    placeholder="kanun=100&#10;teblig=90&#10;ozelge=75&#10;makale=50"
                    rows={4}
                    className="mt-1 text-sm font-mono"
                  />
                </div>

                {/* Topic Entities - Simplified */}
                <div>
                  <Label className="text-xs mb-2 block">Konu Eşleşmeleri (gelişmiş)</Label>
                  <Textarea
                    value={(editedSchema.llmConfig?.topicEntities || []).map(e =>
                      `${e.pattern} → ${e.synonyms?.join(', ') || ''}`
                    ).join('\n')}
                    onChange={e => {
                      const lines = e.target.value.split('\n').filter(l => l.trim());
                      const entities = lines.map(line => {
                        const [pattern, syns] = line.split('→').map(s => s.trim());
                        return {
                          pattern: pattern || '',
                          entity: pattern || '',
                          synonyms: syns ? syns.split(',').map(s => s.trim()).filter(s => s) : []
                        };
                      }).filter(e => e.pattern);
                      setEditedSchema({ ...editedSchema, llmConfig: { ...editedSchema.llmConfig, topicEntities: entities } });
                    }}
                    placeholder="vergi levhası → levha, asma zorunluluğu&#10;kdv → katma değer vergisi&#10;stopaj → kesinti, tevkifat"
                    rows={4}
                    className="mt-1 text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Format: pattern → synonym1, synonym2</p>
                </div>
              </div>

              {/* Veri Alanları - JSON format */}
              <div className="border-t pt-4">
                <Label className="text-xs">Veri Alanları (Opsiyonel)</Label>
                <p className="text-xs text-muted-foreground mb-2">Citation formatı için metadata alanları</p>
                <Textarea
                  value={JSON.stringify(editedSchema.fields || [], null, 2)}
                  onChange={e => {
                    try {
                      const fields = JSON.parse(e.target.value);
                      if (Array.isArray(fields)) {
                        setEditedSchema({ ...editedSchema, fields });
                      }
                    } catch {
                      // Invalid JSON
                    }
                  }}
                  placeholder={`[{"key": "kanun_no", "label": "Kanun No", "type": "reference"}]`}
                  rows={4}
                  className="mt-1 text-xs font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editedSchema.fields.length} alan
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Düzenlemek için şema seçin</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
