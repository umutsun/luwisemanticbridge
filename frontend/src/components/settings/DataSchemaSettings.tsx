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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Database,
  Plus,
  Trash2,
  Check,
  Save,
  RefreshCw,
  Settings,
  ChevronDown,
  ChevronUp,
  Star,
  Crown,
  Lock,
  Search,
  Grid,
  List,
  Sparkles,
  X
} from 'lucide-react';
import {
  DataSchema,
  SchemaField,
  DataSchemaGlobalSettings,
  FieldType,
  FIELD_TYPE_LABELS,
  EMPTY_FIELD,
  LLMConfig,
  DEFAULT_LLM_CONFIG
} from '@/types/data-schema';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import SchemaCard from './schemas/SchemaCard';
import LLMConfigEditor from './schemas/LLMConfigEditor';
import PatternManagement from './PatternManagement';
import { cn } from '@/lib/utils';

interface Industry {
  code: string;
  name: string;
  icon: string;
}

interface UnifiedSchema {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  industry_code?: string;
  industry_name?: string;
  industry_icon?: string;
  fields: SchemaField[];
  templates: {
    analyze: string;
    citation: string;
    questions: string[];
  };
  llm_guide?: string;
  llm_config?: LLMConfig;
  is_active: boolean;
  is_default: boolean;
  is_system?: boolean;
  source_preset_id?: string;
  user_id?: string;
  tier?: 'free' | 'pro' | 'enterprise';
  created_at?: string;
  updated_at?: string;
}

interface UserSettings {
  user_id: string;
  active_schema_id?: string;
  enable_auto_detect: boolean;
  max_fields_in_citation: number;
  max_questions: number;
  preferred_industry?: string;
}

export default function DataSchemaSettings() {
  // State
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [allSchemas, setAllSchemas] = useState<UnifiedSchema[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [editedSchema, setEditedSchema] = useState<DataSchema | null>(null);
  const [editedLLMConfig, setEditedLLMConfig] = useState<LLMConfig>(DEFAULT_LLM_CONFIG);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'basic' | 'llm' | 'patterns'>('basic');

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [industriesRes, schemasRes, settingsRes] = await Promise.all([
        apiClient.get('/api/v2/data-schema/industries'),
        apiClient.get('/api/v2/data-schema/all-schemas'),
        apiClient.get('/api/v2/data-schema/user/settings')
      ]);

      const industriesData = industriesRes?.data?.industries || [];
      const schemasData = schemasRes?.data?.schemas || [];
      const settingsData = settingsRes?.data?.settings || null;

      setIndustries(Array.isArray(industriesData) ? industriesData : []);
      setAllSchemas(Array.isArray(schemasData) ? schemasData : []);
      setUserSettings(settingsData);

      if (settingsData?.active_schema_id) {
        setSelectedSchemaId(settingsData.active_schema_id);
        const activeSchema = schemasData.find((s: UnifiedSchema) => s.id === settingsData.active_schema_id);
        if (activeSchema) {
          handleSelectSchema(activeSchema);
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Veriler yüklenemedi');
      setIndustries([]);
      setAllSchemas([]);
      setUserSettings(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSchema = (schema: UnifiedSchema) => {
    setSelectedSchemaId(schema.id);
    setEditedSchema({
      id: schema.id,
      name: schema.name,
      displayName: schema.display_name,
      description: schema.description || '',
      fields: schema.fields,
      templates: schema.templates,
      llmGuide: schema.llm_guide || '',
      isActive: schema.is_active,
      isDefault: schema.is_default,
      createdAt: schema.created_at || '',
      updatedAt: schema.updated_at || ''
    });
    setEditedLLMConfig(schema.llm_config || DEFAULT_LLM_CONFIG);
    setActiveTab('basic');
  };

  const handleSetActive = async (schemaId?: string) => {
    const targetId = schemaId || selectedSchemaId;
    if (!targetId) return;

    try {
      setSaving(true);
      await apiClient.post('/api/v2/data-schema/user/active-schema', {
        schemaId: targetId
      });
      setUserSettings(prev => prev ? {
        ...prev,
        active_schema_id: targetId
      } : null);
      toast.success('Aktif şema ayarlandı');
    } catch (error) {
      console.error('Failed to set active schema:', error);
      toast.error('Aktif şema ayarlanamadı');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSchema = () => {
    const newSchema: DataSchema = {
      id: '',
      name: 'yeni_sema',
      displayName: 'Yeni Şema',
      description: '',
      fields: [],
      templates: { analyze: '', citation: '', questions: [] },
      llmGuide: '',
      isActive: true,
      createdAt: '',
      updatedAt: ''
    };
    setSelectedSchemaId('new');
    setEditedSchema(newSchema);
    setEditedLLMConfig(DEFAULT_LLM_CONFIG);
    setActiveTab('basic');
  };

  const handleSaveSchema = async () => {
    if (!editedSchema) return;

    try {
      setSaving(true);
      const schemaData = {
        name: editedSchema.name,
        display_name: editedSchema.displayName,
        description: editedSchema.description,
        fields: editedSchema.fields,
        templates: editedSchema.templates,
        llm_guide: editedSchema.llmGuide,
        llm_config: editedLLMConfig
      };

      if (selectedSchemaId === 'new' || !editedSchema.id) {
        const response = await apiClient.post('/api/v2/data-schema/schemas', schemaData);
        const newSchema = response?.data?.schema || response?.data;
        if (!newSchema?.id) {
          throw new Error('Invalid response: missing schema data');
        }
        setAllSchemas([...allSchemas, { ...newSchema, llm_config: editedLLMConfig }]);
        setSelectedSchemaId(newSchema.id);
        setEditedSchema({ ...editedSchema, id: newSchema.id });
        toast.success('Şema oluşturuldu');
      } else {
        await apiClient.put(`/api/v2/data-schema/schemas/${editedSchema.id}`, schemaData);
        setAllSchemas(allSchemas.map(s =>
          s.id === editedSchema.id
            ? { ...s, ...schemaData, display_name: schemaData.display_name, llm_config: editedLLMConfig } as UnifiedSchema
            : s
        ));
        toast.success('Şema güncellendi');
      }
    } catch (error) {
      console.error('Failed to save schema:', error);
      toast.error('Şema kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchema = async (schemaId: string) => {
    if (!confirm('Bu şemayı silmek istediğinizden emin misiniz?')) return;

    try {
      await apiClient.delete(`/api/v2/data-schema/schemas/${schemaId}`);
      setAllSchemas(allSchemas.filter(s => s.id !== schemaId));
      if (selectedSchemaId === schemaId) {
        setSelectedSchemaId(null);
        setEditedSchema(null);
      }
      toast.success('Şema silindi');
    } catch (error) {
      console.error('Failed to delete schema:', error);
      toast.error('Şema silinemedi');
    }
  };

  const handleCloneSchema = async (schema: UnifiedSchema) => {
    const clonedSchema: DataSchema = {
      id: '',
      name: `${schema.name}_kopya`,
      displayName: `${schema.display_name} (Kopya)`,
      description: schema.description || '',
      fields: [...schema.fields],
      templates: { ...schema.templates },
      llmGuide: schema.llm_guide || '',
      isActive: true,
      createdAt: '',
      updatedAt: ''
    };
    setSelectedSchemaId('new');
    setEditedSchema(clonedSchema);
    setEditedLLMConfig(schema.llm_config || DEFAULT_LLM_CONFIG);
    setActiveTab('basic');
    toast.info('Şema klonlandı. Düzenleyip kaydedin.');
  };

  // Field handlers
  const handleFieldChange = (index: number, field: Partial<SchemaField>) => {
    if (!editedSchema || !editedSchema.fields) return;
    if (index < 0 || index >= editedSchema.fields.length) return;
    const newFields = [...editedSchema.fields];
    newFields[index] = { ...newFields[index], ...field };
    setEditedSchema({ ...editedSchema, fields: newFields });
  };

  const handleAddField = () => {
    if (!editedSchema) return;
    const newKey = `field_${editedSchema.fields.length + 1}`;
    setEditedSchema({
      ...editedSchema,
      fields: [...editedSchema.fields, { ...EMPTY_FIELD, key: newKey }]
    });
  };

  const handleRemoveField = (index: number) => {
    if (!editedSchema) return;
    setEditedSchema({
      ...editedSchema,
      fields: editedSchema.fields.filter((_, i) => i !== index)
    });
  };

  // Filter schemas
  const filteredSchemas = allSchemas.filter(schema => {
    const matchesIndustry = selectedIndustry === 'all' || schema.industry_code === selectedIndustry;
    const matchesSearch = !searchQuery ||
      schema.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      schema.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      schema.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesIndustry && matchesSearch;
  });

  const selectedSchema = selectedSchemaId && selectedSchemaId !== 'new'
    ? allSchemas.find(s => s.id === selectedSchemaId)
    : null;
  const isSystemSchema = selectedSchema?.is_system || false;
  const isActiveSchema = userSettings?.active_schema_id === selectedSchemaId;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-[300px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Şema ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Tüm sektörler" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Sektörler</SelectItem>
              {industries.map(industry => (
                <SelectItem key={industry.code} value={industry.code}>
                  {industry.icon} {industry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreateSchema} className="gap-2 h-9">
          <Plus className="w-4 h-4" />
          Yeni Şema
        </Button>
      </div>

      {/* Schema Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSchemas.map(schema => (
          <SchemaCard
            key={schema.id}
            schema={schema}
            isActive={userSettings?.active_schema_id === schema.id}
            isSelected={selectedSchemaId === schema.id}
            onSelect={() => handleSelectSchema(schema)}
            onSetActive={() => handleSetActive(schema.id)}
            onEdit={() => handleSelectSchema(schema)}
            onClone={() => handleCloneSchema(schema)}
            onDelete={schema.is_system ? undefined : () => handleDeleteSchema(schema.id)}
          />
        ))}

        {/* New schema placeholder */}
        {selectedSchemaId === 'new' && (
          <Card className="ring-2 ring-primary border-dashed">
            <CardContent className="p-4 flex items-center justify-center h-full min-h-[120px]">
              <div className="text-center">
                <Plus className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Yeni Şema</p>
                <Badge variant="outline" className="mt-2">Kaydedilmedi</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {filteredSchemas.length === 0 && selectedSchemaId !== 'new' && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Bu kriterlere uygun şema bulunamadı</p>
          </div>
        )}
      </div>

      {/* Selected Schema Editor */}
      {editedSchema && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                <span>{editedSchema.displayName || 'Yeni Şema'}</span>
                {isSystemSchema && (
                  <Badge variant="outline" className="ml-2">
                    <Lock className="w-3 h-3 mr-1" />
                    Sistem Şeması
                  </Badge>
                )}
                {isActiveSchema && (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 ml-2">
                    <Check className="w-3 h-3 mr-1" />
                    Aktif
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isActiveSchema && selectedSchemaId && selectedSchemaId !== 'new' && (
                  <Button variant="outline" size="sm" onClick={() => handleSetActive()} disabled={saving}>
                    <Check className="w-3 h-3 mr-1" />
                    Aktif Yap
                  </Button>
                )}
                <Button
                  onClick={handleSaveSchema}
                  disabled={saving || !editedSchema?.name || !editedSchema?.displayName || isSystemSchema}
                  size="sm"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Save className="w-3 h-3 mr-1" />
                      Kaydet
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSchemaId(null);
                    setEditedSchema(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="mb-4">
                <TabsTrigger value="basic">
                  <Database className="w-4 h-4 mr-2" />
                  Temel Bilgiler
                </TabsTrigger>
                <TabsTrigger value="llm">
                  <Sparkles className="w-4 h-4 mr-2" />
                  LLM Ayarları
                </TabsTrigger>
                <TabsTrigger value="patterns">
                  <Settings className="w-4 h-4 mr-2" />
                  Patterns
                </TabsTrigger>
              </TabsList>

              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Şema Adı</Label>
                    <Input
                      value={editedSchema.name}
                      onChange={(e) => setEditedSchema({ ...editedSchema, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                      placeholder="vergi_mevzuati"
                      className="mt-1"
                      disabled={isSystemSchema}
                    />
                  </div>
                  <div>
                    <Label>Görüntüleme Adı</Label>
                    <Input
                      value={editedSchema.displayName}
                      onChange={(e) => setEditedSchema({ ...editedSchema, displayName: e.target.value })}
                      placeholder="Vergi Mevzuatı"
                      className="mt-1"
                      disabled={isSystemSchema}
                    />
                  </div>
                </div>

                <div>
                  <Label>Açıklama</Label>
                  <Textarea
                    value={editedSchema.description}
                    onChange={(e) => setEditedSchema({ ...editedSchema, description: e.target.value })}
                    placeholder="Bu şema hangi tür belgeler için kullanılacak?"
                    rows={2}
                    className="mt-1"
                    disabled={isSystemSchema}
                  />
                </div>

                {/* Fields - Collapsible */}
                <div className="border rounded-lg">
                  <button
                    type="button"
                    onClick={() => setFieldsExpanded(!fieldsExpanded)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50"
                  >
                    <span className="font-medium text-sm">
                      Alanlar ({editedSchema.fields.length})
                    </span>
                    <div className="flex items-center gap-2">
                      {!isSystemSchema && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleAddField(); }}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      )}
                      {fieldsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>
                  {fieldsExpanded && (
                    <div className="border-t p-3 space-y-2 max-h-[250px] overflow-y-auto">
                      {editedSchema.fields.map((field, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                          <Input
                            value={field.key}
                            onChange={(e) => handleFieldChange(index, { key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                            placeholder="key"
                            className="h-8 w-24 text-xs"
                            disabled={isSystemSchema}
                          />
                          <Input
                            value={field.label}
                            onChange={(e) => handleFieldChange(index, { label: e.target.value })}
                            placeholder="Label"
                            className="h-8 flex-1 text-xs"
                            disabled={isSystemSchema}
                          />
                          <Select
                            value={field.type}
                            onValueChange={(value) => handleFieldChange(index, { type: value as FieldType })}
                            disabled={isSystemSchema}
                          >
                            <SelectTrigger className="h-8 w-24 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Switch
                            checked={field.showInCitation}
                            onCheckedChange={(checked) => handleFieldChange(index, { showInCitation: checked })}
                            title="Citation'da göster"
                            disabled={isSystemSchema}
                          />
                          {!isSystemSchema && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveField(index)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {editedSchema.fields.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          Henüz alan yok
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Citation Template */}
                <div>
                  <Label>Citation Template</Label>
                  <Input
                    value={editedSchema.templates.citation}
                    onChange={(e) => setEditedSchema({
                      ...editedSchema,
                      templates: { ...editedSchema.templates, citation: e.target.value }
                    })}
                    placeholder="{{kanun_no}} Md.{{madde_no}} - {{tarih}}"
                    className="mt-1"
                    disabled={isSystemSchema}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {editedSchema?.fields && editedSchema.fields.length > 0
                      ? editedSchema.fields.map(f => `{{${f.key}}}`).join(', ')
                      : 'Önce alan ekleyin'}
                  </p>
                </div>

                {/* LLM Guide */}
                <div>
                  <Label>LLM Kılavuzu</Label>
                  <Textarea
                    value={editedSchema.llmGuide}
                    onChange={(e) => setEditedSchema({ ...editedSchema, llmGuide: e.target.value })}
                    placeholder="Bu veri hakkında LLM'e rehberlik edecek bilgiler..."
                    rows={4}
                    className="mt-1 text-sm"
                    disabled={isSystemSchema}
                  />
                </div>
              </TabsContent>

              {/* LLM Config Tab */}
              <TabsContent value="llm">
                <LLMConfigEditor
                  config={editedLLMConfig}
                  onChange={setEditedLLMConfig}
                  disabled={isSystemSchema}
                />
              </TabsContent>

              {/* Patterns Tab */}
              <TabsContent value="patterns">
                {selectedSchemaId && selectedSchemaId !== 'new' ? (
                  <PatternManagement schemaId={selectedSchemaId} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Pattern yönetimi için önce şemayı kaydedin</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* User Settings Card */}
      {userSettings && !editedSchema && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="w-4 h-4" />
              Genel Ayarlar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Otomatik Tespit</Label>
                <p className="text-xs text-muted-foreground">Belge tipine göre şemayı otomatik seç</p>
              </div>
              <Switch
                checked={userSettings.enable_auto_detect}
                onCheckedChange={(checked) => setUserSettings({ ...userSettings, enable_auto_detect: checked })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Max Citation Alanı</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={userSettings.max_fields_in_citation}
                  onChange={(e) => setUserSettings({ ...userSettings, max_fields_in_citation: parseInt(e.target.value) || 4 })}
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">Max Soru Sayısı</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={userSettings.max_questions}
                  onChange={(e) => setUserSettings({ ...userSettings, max_questions: parseInt(e.target.value) || 3 })}
                  className="h-9 mt-1"
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  setSaving(true);
                  await apiClient.put('/api/v2/data-schema/user/settings', userSettings);
                  toast.success('Ayarlar kaydedildi');
                } catch (error) {
                  toast.error('Ayarlar kaydedilemedi');
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              <Save className="w-3 h-3 mr-2" />
              Ayarları Kaydet
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
