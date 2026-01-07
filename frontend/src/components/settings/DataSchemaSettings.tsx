'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Database, Plus, Trash2, Check, Save, RefreshCw, Search, Copy, MoreVertical, Download, Upload,
  Shield, AlertTriangle, Scale, Clock, ChevronDown, ChevronRight
} from 'lucide-react';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from '@/components/ui/collapsible';
import { DataSchema, SchemaField, FieldType, FIELD_TYPE_LABELS, EMPTY_FIELD } from '@/types/data-schema';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

interface UnifiedSchema {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  industry_code?: string;
  industry_icon?: string;
  fields: SchemaField[];
  templates: { analyze: string; citation: string; questions: string[] };
  llm_guide?: string;
  llm_config?: {
    analyzePrompt?: string;
    citationTemplate?: string;
    chatbotContext?: string;
    embeddingPrefix?: string;
    transformRules?: string;
    questionGenerator?: string;
    searchContext?: string;
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

// Semantic Analyzer Configuration Interface
interface SemanticAnalyzerConfig {
  verdictPatterns?: string[];
  forbiddenPatterns?: string[];
  actionGroups?: Record<string, string[]>;
  modalityPatterns?: Record<string, string[]>;
  temporalPatterns?: string[];
  penalties?: Record<string, number>;
  failMessages?: Record<string, string>;
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

  // Semantic Analyzer states
  const [analyzerConfig, setAnalyzerConfig] = useState<SemanticAnalyzerConfig | null>(null);
  const [analyzerExpanded, setAnalyzerExpanded] = useState(false);
  const [analyzerLoading, setAnalyzerLoading] = useState(false);
  const [analyzerSaving, setAnalyzerSaving] = useState(false);

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

      // Load Semantic Analyzer config
      loadAnalyzerConfig();
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

  const loadAnalyzerConfig = async () => {
    try {
      setAnalyzerLoading(true);
      const res = await apiClient.get('/api/settings/semantic-analyzer/config');
      if (res?.data?.config) {
        setAnalyzerConfig(res.data.config);
        console.log('🔍 [ANALYZER] Config loaded:', res.data.config);
      }
    } catch (error) {
      console.warn('🔍 [ANALYZER] Config not available:', error);
      // Not critical - analyzer config is optional
    } finally {
      setAnalyzerLoading(false);
    }
  };

  const saveAnalyzerConfig = async () => {
    if (!analyzerConfig) return;
    try {
      setAnalyzerSaving(true);
      // Save each setting
      const updates = [
        { key: 'verdictPatterns', value: analyzerConfig.verdictPatterns },
        { key: 'forbiddenPatterns', value: analyzerConfig.forbiddenPatterns },
        { key: 'penalties', value: analyzerConfig.penalties }
      ];

      for (const update of updates) {
        if (update.value !== undefined) {
          await apiClient.put(`/api/settings/semantic-analyzer/${update.key}`, { value: update.value });
        }
      }

      // Sync to Redis
      await apiClient.post('/api/settings/semantic-analyzer/sync');
      toast.success('Analiz kuralları kaydedildi ve senkronize edildi');
    } catch (error: any) {
      console.error('Save analyzer error:', error);
      toast.error('Kaydetme hatası: ' + (error?.response?.data?.error || error?.message));
    } finally {
      setAnalyzerSaving(false);
    }
  };

  const updateAnalyzerPenalty = (key: string, value: number) => {
    if (!analyzerConfig) return;
    setAnalyzerConfig({
      ...analyzerConfig,
      penalties: {
        ...analyzerConfig.penalties,
        [key]: value
      }
    });
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

  const updateField = (i: number, update: Partial<SchemaField>) => {
    if (!editedSchema) return;
    const fields = [...editedSchema.fields];
    fields[i] = { ...fields[i], ...update };
    setEditedSchema({ ...editedSchema, fields });
  };

  const addField = () => {
    if (!editedSchema) return;
    setEditedSchema({
      ...editedSchema,
      fields: [...editedSchema.fields, { ...EMPTY_FIELD, key: `field_${editedSchema.fields.length + 1}` }]
    });
  };

  const removeField = (i: number) => {
    if (!editedSchema) return;
    setEditedSchema({ ...editedSchema, fields: editedSchema.fields.filter((_, idx) => idx !== i) });
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

          {/* Semantic Analyzer Configuration - Collapsible */}
          <Collapsible open={analyzerExpanded} onOpenChange={setAnalyzerExpanded} className="border-t pt-3 mt-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between h-8 px-2 text-sm">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="font-medium">Analiz Kuralları</span>
                  {analyzerConfig && <Badge variant="secondary" className="text-xs">Aktif</Badge>}
                </div>
                {analyzerExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              {analyzerLoading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Yükleniyor...</div>
              ) : analyzerConfig ? (
                <>
                  {/* Verdict Patterns */}
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <Scale className="w-3 h-3" /> Hüküm Kalıpları
                    </Label>
                    <p className="text-[10px] text-muted-foreground mb-1">Geçerli alıntı için gerekli ifadeler</p>
                    <Textarea
                      value={analyzerConfig.verdictPatterns?.join('\n') || ''}
                      onChange={e => setAnalyzerConfig({
                        ...analyzerConfig,
                        verdictPatterns: e.target.value.split('\n').filter(Boolean)
                      })}
                      placeholder="zorunludur&#10;gerekmektedir&#10;mümkündür"
                      rows={3}
                      className="text-xs font-mono"
                    />
                  </div>

                  {/* Forbidden Patterns */}
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-destructive" /> Yasaklı Kalıplar
                    </Label>
                    <p className="text-[10px] text-muted-foreground mb-1">Alıntılanmaması gereken soru cümleleri</p>
                    <Textarea
                      value={analyzerConfig.forbiddenPatterns?.join('\n') || ''}
                      onChange={e => setAnalyzerConfig({
                        ...analyzerConfig,
                        forbiddenPatterns: e.target.value.split('\n').filter(Boolean)
                      })}
                      placeholder="sorulmaktadır&#10;mümkün olup olmadığı&#10;dilekçenizde"
                      rows={3}
                      className="text-xs font-mono"
                    />
                  </div>

                  {/* Penalties */}
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Güven Düşürme Katsayıları
                    </Label>
                    <p className="text-[10px] text-muted-foreground mb-1">Issue başına confidence penalty (0-1)</p>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {Object.entries(analyzerConfig.penalties || {}).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground truncate flex-1">{key}</span>
                          <Input
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            value={value}
                            onChange={e => updateAnalyzerPenalty(key, parseFloat(e.target.value) || 0)}
                            className="h-6 w-14 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Save Analyzer Button */}
                  <div className="flex justify-end pt-2">
                    <Button size="sm" onClick={saveAnalyzerConfig} disabled={analyzerSaving} className="h-7 text-xs">
                      {analyzerSaving ? (
                        <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Kaydediliyor</>
                      ) : (
                        <><Save className="w-3 h-3 mr-1" /> Kuralları Kaydet</>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Analiz kuralları yüklenemedi</p>
                  <Button size="sm" variant="outline" onClick={loadAnalyzerConfig} className="mt-2 h-6 text-xs">
                    <RefreshCw className="w-3 h-3 mr-1" /> Yeniden Dene
                  </Button>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
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

              {/* LLM Configuration - 6 fields (System Prompt ve Transform Rules kaldırıldı) */}
              <div className="border-t pt-4 space-y-3">
                <h3 className="text-sm font-medium">LLM Konfigürasyonu</h3>

                {/* 1. Analyze Prompt */}
                <div>
                  <Label className="text-xs">Analyze Prompt (Doküman Analizi)</Label>
                  <Textarea
                    value={editedSchema.templates.analyze || ''}
                    onChange={e => setEditedSchema({
                      ...editedSchema,
                      templates: { ...editedSchema.templates, analyze: e.target.value }
                    })}
                    placeholder="Belgeyi analiz et ve önemli bilgileri çıkar..."
                    rows={4}
                    className="mt-1 text-sm font-mono"
                  />
                </div>

                {/* 2. Citation Template */}
                <div>
                  <Label className="text-xs">Citation Template (Kaynak Formatı)</Label>
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

                {/* 3. Chatbot Context */}
                <div>
                  <Label className="text-xs">Chatbot Context (Sohbet Bağlamı)</Label>
                  <Textarea
                    value={editedSchema.llmConfig?.chatbotContext || ''}
                    onChange={e => setEditedSchema({
                      ...editedSchema,
                      llmConfig: { ...editedSchema.llmConfig, chatbotContext: e.target.value }
                    })}
                    placeholder="Chatbot davranış kuralları ve yanıt stili..."
                    rows={4}
                    className="mt-1 text-sm font-mono"
                  />
                </div>

                {/* 4. Question Generator */}
                <div>
                  <Label className="text-xs">Question Generator (Soru Üretici)</Label>
                  <Textarea
                    value={editedSchema.llmConfig?.questionGenerator || ''}
                    onChange={e => setEditedSchema({
                      ...editedSchema,
                      llmConfig: { ...editedSchema.llmConfig, questionGenerator: e.target.value }
                    })}
                    placeholder="Takip soruları oluşturma kuralları..."
                    rows={3}
                    className="mt-1 text-sm font-mono"
                  />
                </div>

                {/* 5. Embedding Prefix */}
                <div>
                  <Label className="text-xs">Embedding Prefix (Vektör Öneki)</Label>
                  <Input
                    value={editedSchema.llmConfig?.embeddingPrefix || ''}
                    onChange={e => setEditedSchema({
                      ...editedSchema,
                      llmConfig: { ...editedSchema.llmConfig, embeddingPrefix: e.target.value }
                    })}
                    placeholder="[Vergi Mevzuatı] "
                    className="h-8 mt-1 font-mono"
                  />
                </div>

                {/* 6. Search Context */}
                <div>
                  <Label className="text-xs">Search Context (Arama Bağlamı)</Label>
                  <Textarea
                    value={editedSchema.llmConfig?.searchContext || ''}
                    onChange={e => setEditedSchema({
                      ...editedSchema,
                      llmConfig: { ...editedSchema.llmConfig, searchContext: e.target.value }
                    })}
                    placeholder="Semantik arama için bağlam..."
                    rows={3}
                    className="mt-1 text-sm font-mono"
                  />
                </div>
              </div>

              {/* Alanlar */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs">Veri Alanları ({editedSchema.fields.length})</Label>
                  <Button size="sm" variant="outline" onClick={addField} className="h-6 text-xs">
                    <Plus className="w-3 h-3 mr-1" />Ekle
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                  {editedSchema.fields.map((field, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs">
                      <Input
                        value={field.key}
                        onChange={e => updateField(i, { key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                        placeholder="key"
                        className="h-7 w-24"
                      />
                      <Input
                        value={field.label}
                        onChange={e => updateField(i, { label: e.target.value })}
                        placeholder="Label"
                        className="h-7 flex-1"
                      />
                      <Select value={field.type} onValueChange={v => updateField(i, { type: v as FieldType })}>
                        <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Switch checked={field.showInCitation} onCheckedChange={c => updateField(i, { showInCitation: c })} />
                      <Button variant="ghost" size="sm" onClick={() => removeField(i)} className="h-7 w-7 p-0 text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  {!editedSchema.fields.length && <p className="text-xs text-muted-foreground text-center py-3">Alan yok</p>}
                </div>
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
