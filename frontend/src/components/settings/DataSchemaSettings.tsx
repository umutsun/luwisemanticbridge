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
  Database, Plus, Trash2, Check, Save, RefreshCw, Search, Copy, MoreVertical
} from 'lucide-react';
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

export default function DataSchemaSettings() {
  const [allSchemas, setAllSchemas] = useState<UnifiedSchema[]>([]);
  const [activeSchemaId, setActiveSchemaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [editedSchema, setEditedSchema] = useState<EditedSchema | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [schemasRes, settingsRes] = await Promise.all([
        apiClient.get('/api/v2/data-schema/all-schemas'),
        apiClient.get('/api/v2/data-schema/user/settings')
      ]);
      const schemasData = schemasRes?.data?.schemas || [];
      setAllSchemas(Array.isArray(schemasData) ? schemasData : []);
      const activeId = settingsRes?.data?.settings?.active_schema_id;
      setActiveSchemaId(activeId);
      if (activeId) {
        const active = schemasData.find((s: UnifiedSchema) => s.id === activeId);
        if (active) selectSchema(active);
      }
    } catch (error) {
      console.error('Failed to load:', error);
      toast.error('Veriler yüklenemedi');
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

  const filtered = allSchemas.filter(s =>
    !searchQuery || s.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isActive = activeSchemaId === selectedSchemaId;

  if (loading) return <div className="flex justify-center p-8"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="grid grid-cols-[35%_65%] gap-6">
      {/* Sol - Şema Listesi */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4" /> Şemalar
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={createNew} className="h-7 px-2">
              <Plus className="w-4 h-4" />
            </Button>
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

              {/* LLM Configuration - All 7 fields */}
              <div className="border-t pt-4 space-y-3">
                <h3 className="text-sm font-medium">LLM Konfigürasyonu</h3>

                {/* 1. System Prompt / LLM Guide */}
                <div>
                  <Label className="text-xs">System Prompt (LLM Kılavuzu)</Label>
                  <Textarea
                    value={editedSchema.llmGuide || ''}
                    onChange={e => setEditedSchema({ ...editedSchema, llmGuide: e.target.value })}
                    placeholder="AI'a veri hakkında bağlam ve talimatlar..."
                    rows={4}
                    className="mt-1 text-sm font-mono"
                  />
                </div>

                {/* 2. Analyze Prompt */}
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

                {/* 3. Citation Template */}
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

                {/* 4. Chatbot Context */}
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

                {/* 5. Question Generator */}
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

                {/* 6. Transform Rules */}
                <div>
                  <Label className="text-xs">Transform Rules (Dönüştürme Kuralları)</Label>
                  <Textarea
                    value={editedSchema.llmConfig?.transformRules || ''}
                    onChange={e => setEditedSchema({
                      ...editedSchema,
                      llmConfig: { ...editedSchema.llmConfig, transformRules: e.target.value }
                    })}
                    placeholder="Veri dönüştürme ve işleme kuralları..."
                    rows={3}
                    className="mt-1 text-sm font-mono"
                  />
                </div>

                {/* 7. Embedding Prefix */}
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

                {/* 8. Search Context */}
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
