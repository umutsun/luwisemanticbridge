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
  Building2,
  Copy,
  Lock,
  Star,
  Crown
} from 'lucide-react';
import {
  DataSchema,
  SchemaField,
  DataSchemaGlobalSettings,
  FieldType,
  FIELD_TYPE_LABELS,
  EMPTY_FIELD
} from '@/types/data-schema';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

interface Industry {
  code: string;
  name: string;
  icon: string;
}

interface IndustryPreset {
  id: string;
  industry_code: string;
  industry_name: string;
  industry_icon?: string;
  schema_name: string;
  schema_display_name: string;
  schema_description?: string;
  fields: SchemaField[];
  templates: {
    analyze: string;
    citation: string;
    questions: string[];
  };
  llm_guide?: string;
  tier: 'free' | 'pro' | 'enterprise';
  is_active: boolean;
  sort_order: number;
}

interface UserSchema {
  id: string;
  user_id: string;
  name: string;
  display_name: string;
  description?: string;
  source_type: 'custom' | 'cloned' | 'imported';
  source_preset_id?: string;
  fields: SchemaField[];
  templates: {
    analyze: string;
    citation: string;
    questions: string[];
  };
  llm_guide?: string;
  is_active: boolean;
  is_default: boolean;
}

interface UserSettings {
  user_id: string;
  active_schema_id?: string;
  active_schema_type?: 'preset' | 'custom';
  enable_auto_detect: boolean;
  max_fields_in_citation: number;
  max_questions: number;
  preferred_industry?: string;
}

const TIER_COLORS = {
  free: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pro: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  enterprise: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
};

const TIER_ICONS = {
  free: null,
  pro: Star,
  enterprise: Crown
};

export default function DataSchemaSettings() {
  // State
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [presets, setPresets] = useState<IndustryPreset[]>([]);
  const [userSchemas, setUserSchemas] = useState<UserSchema[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [selectedSchemaType, setSelectedSchemaType] = useState<'preset' | 'custom'>('preset');
  const [editedSchema, setEditedSchema] = useState<DataSchema | null>(null);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('presets');

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Load presets when industry changes
  useEffect(() => {
    if (selectedIndustry) {
      loadPresets(selectedIndustry === 'all' ? undefined : selectedIndustry);
    }
  }, [selectedIndustry]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [industriesRes, presetsRes, userSchemasRes, settingsRes] = await Promise.all([
        apiClient.get('/api/v2/data-schema/industries'),
        apiClient.get('/api/v2/data-schema/presets'),
        apiClient.get('/api/v2/data-schema/user/schemas'),
        apiClient.get('/api/v2/data-schema/user/settings')
      ]);

      setIndustries(industriesRes.data.industries || []);
      setPresets(presetsRes.data.presets || []);
      setUserSchemas(userSchemasRes.data.schemas || []);
      setUserSettings(settingsRes.data.settings || null);

      // Select active schema if exists
      if (settingsRes.data.settings?.active_schema_id) {
        setSelectedSchemaId(settingsRes.data.settings.active_schema_id);
        setSelectedSchemaType(settingsRes.data.settings.active_schema_type || 'preset');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadPresets = async (industryCode?: string) => {
    try {
      const url = industryCode
        ? `/api/v2/data-schema/presets?industry=${industryCode}`
        : '/api/v2/data-schema/presets';
      const response = await apiClient.get(url);
      setPresets(response.data.presets || []);
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  };

  const handleSelectPreset = (preset: IndustryPreset) => {
    setSelectedSchemaId(preset.id);
    setSelectedSchemaType('preset');
    setEditedSchema({
      id: preset.id,
      name: preset.schema_name,
      displayName: preset.schema_display_name,
      description: preset.schema_description || '',
      fields: preset.fields,
      templates: preset.templates,
      llmGuide: preset.llm_guide || '',
      isActive: preset.is_active,
      isDefault: false,
      createdAt: '',
      updatedAt: ''
    });
  };

  const handleSelectUserSchema = (schema: UserSchema) => {
    setSelectedSchemaId(schema.id);
    setSelectedSchemaType('custom');
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
      createdAt: '',
      updatedAt: ''
    });
  };

  const handleClonePreset = async (presetId: string) => {
    try {
      setCloning(presetId);
      const response = await apiClient.post(`/api/v2/data-schema/presets/${presetId}/clone`);
      const newSchema = response.data.schema;
      setUserSchemas([...userSchemas, newSchema]);
      toast.success('Şablon kopyalandı');
      setActiveTab('custom');
    } catch (error) {
      console.error('Failed to clone preset:', error);
      toast.error('Şablon kopyalanamadı');
    } finally {
      setCloning(null);
    }
  };

  const handleSetActive = async () => {
    if (!selectedSchemaId) return;

    try {
      setSaving(true);
      await apiClient.post('/api/v2/data-schema/user/active-schema', {
        schemaId: selectedSchemaId,
        schemaType: selectedSchemaType
      });
      setUserSettings(prev => prev ? {
        ...prev,
        active_schema_id: selectedSchemaId,
        active_schema_type: selectedSchemaType
      } : null);
      toast.success('Aktif şema ayarlandı');
    } catch (error) {
      console.error('Failed to set active schema:', error);
      toast.error('Aktif şema ayarlanamadı');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUserSchema = () => {
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
    setSelectedSchemaType('custom');
    setEditedSchema(newSchema);
    setActiveTab('custom');
  };

  const handleSaveUserSchema = async () => {
    if (!editedSchema) return;

    try {
      setSaving(true);
      if (selectedSchemaId === 'new' || !editedSchema.id) {
        // Create new
        const response = await apiClient.post('/api/v2/data-schema/user/schemas', {
          name: editedSchema.name,
          display_name: editedSchema.displayName,
          description: editedSchema.description,
          fields: editedSchema.fields,
          templates: editedSchema.templates,
          llm_guide: editedSchema.llmGuide
        });
        const newSchema = response.data.schema;
        setUserSchemas([...userSchemas, newSchema]);
        setSelectedSchemaId(newSchema.id);
        setEditedSchema({ ...editedSchema, id: newSchema.id });
        toast.success('Şema oluşturuldu');
      } else {
        // Update existing
        await apiClient.put(`/api/v2/data-schema/user/schemas/${editedSchema.id}`, {
          name: editedSchema.name,
          display_name: editedSchema.displayName,
          description: editedSchema.description,
          fields: editedSchema.fields,
          templates: editedSchema.templates,
          llm_guide: editedSchema.llmGuide
        });
        setUserSchemas(userSchemas.map(s =>
          s.id === editedSchema.id ? { ...s, ...editedSchema } as UserSchema : s
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

  const handleDeleteUserSchema = async (schemaId: string) => {
    if (!confirm('Bu şemayı silmek istediğinizden emin misiniz?')) return;

    try {
      await apiClient.delete(`/api/v2/data-schema/user/schemas/${schemaId}`);
      setUserSchemas(userSchemas.filter(s => s.id !== schemaId));
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

  const handleSaveSettings = async () => {
    if (!userSettings) return;

    try {
      setSaving(true);
      await apiClient.put('/api/v2/data-schema/user/settings', {
        enable_auto_detect: userSettings.enable_auto_detect,
        max_fields_in_citation: userSettings.max_fields_in_citation,
        max_questions: userSettings.max_questions,
        preferred_industry: selectedIndustry === 'all' ? null : selectedIndustry
      });
      toast.success('Ayarlar kaydedildi');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Ayarlar kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  // Field handlers
  const handleFieldChange = (index: number, field: Partial<SchemaField>) => {
    if (!editedSchema) return;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const isPresetSelected = selectedSchemaType === 'preset' && selectedSchemaId;
  const isUserSchemaSelected = selectedSchemaType === 'custom' && selectedSchemaId;
  const isActiveSchema = userSettings?.active_schema_id === selectedSchemaId &&
    userSettings?.active_schema_type === selectedSchemaType;

  return (
    <div className="grid grid-cols-[35%_65%] gap-6">
      {/* Schema List - Left Column */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Veri Şemaları
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Industry Filter */}
          <div>
            <Label className="text-xs mb-1 block">Sektör</Label>
            <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Tüm sektörler" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Sektörler</SelectItem>
                {industries.map(industry => (
                  <SelectItem key={industry.code} value={industry.code}>
                    {industry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tabs: Presets / Custom */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 h-8">
              <TabsTrigger value="presets" className="text-xs">
                <Building2 className="w-3 h-3 mr-1" />
                Hazır Şablonlar
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-xs">
                <Settings className="w-3 h-3 mr-1" />
                Özel Şemalar
              </TabsTrigger>
            </TabsList>

            {/* Presets Tab */}
            <TabsContent value="presets" className="mt-3 space-y-2">
              {presets.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Bu sektörde şablon yok
                </p>
              ) : (
                presets.map(preset => (
                  <div
                    key={preset.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedSchemaId === preset.id && selectedSchemaType === 'preset'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    }`}
                    onClick={() => handleSelectPreset(preset)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{preset.schema_display_name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge className={`text-[10px] px-1.5 ${TIER_COLORS[preset.tier]}`}>
                          {TIER_ICONS[preset.tier] && React.createElement(TIER_ICONS[preset.tier]!, { className: 'w-2.5 h-2.5 mr-0.5 inline' })}
                          {preset.tier}
                        </Badge>
                        {userSettings?.active_schema_id === preset.id && (
                          <Badge variant="default" className="text-[10px] px-1.5">Aktif</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {preset.schema_description}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        {preset.fields.length} alan
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={(e) => { e.stopPropagation(); handleClonePreset(preset.id); }}
                        disabled={cloning === preset.id}
                      >
                        {cloning === preset.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1" />
                            Kopyala
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Custom Schemas Tab */}
            <TabsContent value="custom" className="mt-3 space-y-2">
              <Button size="sm" onClick={handleCreateUserSchema} className="w-full gap-2 h-8">
                <Plus className="w-3 h-3" />
                Yeni Şema Oluştur
              </Button>

              {userSchemas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Henüz özel şema yok
                </p>
              ) : (
                userSchemas.map(schema => (
                  <div
                    key={schema.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedSchemaId === schema.id && selectedSchemaType === 'custom'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    }`}
                    onClick={() => handleSelectUserSchema(schema)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{schema.display_name}</span>
                      <div className="flex items-center gap-1">
                        {schema.source_type === 'cloned' && (
                          <Badge variant="outline" className="text-[10px] px-1.5">Kopyalandı</Badge>
                        )}
                        {userSettings?.active_schema_id === schema.id && userSettings?.active_schema_type === 'custom' && (
                          <Badge variant="default" className="text-[10px] px-1.5">Aktif</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {schema.description || schema.name}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        {schema.fields.length} alan
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-red-500 hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); handleDeleteUserSchema(schema.id); }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}

              {/* New schema placeholder */}
              {selectedSchemaId === 'new' && (
                <div className="p-3 rounded-lg border border-primary bg-primary/5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Yeni Şema</span>
                    <Badge variant="outline" className="text-[10px]">Kaydedilmedi</Badge>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Settings */}
          {userSettings && (
            <div className="pt-3 border-t space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Settings className="w-3 h-3" />
                Ayarlar
              </h4>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Otomatik Tespit</Label>
                <Switch
                  checked={userSettings.enable_auto_detect}
                  onCheckedChange={(checked) => setUserSettings({ ...userSettings, enable_auto_detect: checked })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Max Citation</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={userSettings.max_fields_in_citation}
                    onChange={(e) => setUserSettings({ ...userSettings, max_fields_in_citation: parseInt(e.target.value) || 4 })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Soru</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={userSettings.max_questions}
                    onChange={(e) => setUserSettings({ ...userSettings, max_questions: parseInt(e.target.value) || 3 })}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleSaveSettings} disabled={saving} className="w-full">
                <Save className="w-3 h-3 mr-2" />
                Ayarları Kaydet
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schema Editor - Right Column */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Şema Detayları</span>
            {editedSchema && (
              <div className="flex items-center gap-2">
                {!isActiveSchema && selectedSchemaId && selectedSchemaId !== 'new' && (
                  <Button variant="outline" size="sm" onClick={handleSetActive} disabled={saving}>
                    <Check className="w-3 h-3 mr-1" />
                    Aktif Yap
                  </Button>
                )}
                {isPresetSelected && (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="w-3 h-3" />
                    Salt Okunur
                  </Badge>
                )}
                {isUserSchemaSelected && (
                  <Button
                    onClick={handleSaveUserSchema}
                    disabled={saving || !editedSchema?.name || !editedSchema?.displayName}
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
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {editedSchema ? (
            <>
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Şema Adı</Label>
                  <Input
                    value={editedSchema.name}
                    onChange={(e) => setEditedSchema({ ...editedSchema, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    placeholder="vergi_mevzuati"
                    className="mt-1"
                    disabled={isPresetSelected}
                  />
                </div>
                <div>
                  <Label>Görüntüleme Adı</Label>
                  <Input
                    value={editedSchema.displayName}
                    onChange={(e) => setEditedSchema({ ...editedSchema, displayName: e.target.value })}
                    placeholder="Vergi Mevzuatı"
                    className="mt-1"
                    disabled={isPresetSelected}
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
                  disabled={isPresetSelected}
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
                    {!isPresetSelected && (
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
                          disabled={isPresetSelected}
                        />
                        <Input
                          value={field.label}
                          onChange={(e) => handleFieldChange(index, { label: e.target.value })}
                          placeholder="Label"
                          className="h-8 flex-1 text-xs"
                          disabled={isPresetSelected}
                        />
                        <Select
                          value={field.type}
                          onValueChange={(value) => handleFieldChange(index, { type: value as FieldType })}
                          disabled={isPresetSelected}
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
                          disabled={isPresetSelected}
                        />
                        {!isPresetSelected && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveField(index)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
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
                  disabled={isPresetSelected}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editedSchema.fields.length > 0
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
                  disabled={isPresetSelected}
                />
              </div>

              {/* Clone hint for presets */}
              {isPresetSelected && (
                <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Bu hazır bir şablondur ve düzenlenemez.
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto"
                      onClick={() => handleClonePreset(selectedSchemaId!)}
                    >
                      Kopyalayıp düzenleyebilirsiniz
                    </Button>
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Detayları görüntülemek için bir şema seçin</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
