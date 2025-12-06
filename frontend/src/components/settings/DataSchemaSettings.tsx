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
  Lock
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
import PatternManagement from './PatternManagement';

interface Industry {
  code: string;
  name: string;
  icon: string;
}

/**
 * Unified Schema interface - combines presets and user schemas
 * No distinction between preset and custom - all are treated equally
 */
interface UnifiedSchema {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  industry_code?: string;
  industry_name?: string;
  fields: SchemaField[];
  templates: {
    analyze: string;
    citation: string;
    questions: string[];
  };
  llm_guide?: string;
  is_active: boolean;
  is_default: boolean;
  is_system?: boolean; // true for presets, false for user-created
  source_preset_id?: string; // if cloned from preset
  user_id?: string; // if user-created
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
  // State - Unified schema management
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [allSchemas, setAllSchemas] = useState<UnifiedSchema[]>([]); // All schemas (presets + user)
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [editedSchema, setEditedSchema] = useState<DataSchema | null>(null);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Filter schemas when industry changes
  useEffect(() => {
    // Filtering happens in the render logic
  }, [selectedIndustry]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [industriesRes, schemasRes, settingsRes] = await Promise.all([
        apiClient.get('/api/v2/data-schema/industries'),
        apiClient.get('/api/v2/data-schema/all-schemas'), // New unified endpoint
        apiClient.get('/api/v2/data-schema/user/settings')
      ]);

      // Safely extract data with null checks
      const industriesData = industriesRes?.data?.industries || [];
      const schemasData = schemasRes?.data?.schemas || [];
      const settingsData = settingsRes?.data?.settings || null;

      setIndustries(Array.isArray(industriesData) ? industriesData : []);
      setAllSchemas(Array.isArray(schemasData) ? schemasData : []);
      setUserSettings(settingsData);

      // Select active schema if exists
      if (settingsData?.active_schema_id) {
        setSelectedSchemaId(settingsData.active_schema_id);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Veriler yüklenemedi');
      // Set safe defaults on error
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
  };

  const handleSetActive = async () => {
    if (!selectedSchemaId) return;

    try {
      setSaving(true);
      await apiClient.post('/api/v2/data-schema/user/active-schema', {
        schemaId: selectedSchemaId
      });
      setUserSettings(prev => prev ? {
        ...prev,
        active_schema_id: selectedSchemaId
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
  };

  const handleSaveSchema = async () => {
    if (!editedSchema) return;

    try {
      setSaving(true);
      if (selectedSchemaId === 'new' || !editedSchema.id) {
        // Create new
        const response = await apiClient.post('/api/v2/data-schema/schemas', {
          name: editedSchema.name,
          display_name: editedSchema.displayName,
          description: editedSchema.description,
          fields: editedSchema.fields,
          templates: editedSchema.templates,
          llm_guide: editedSchema.llmGuide
        });
        const newSchema = response?.data?.schema || response?.data;
        if (!newSchema?.id) {
          throw new Error('Invalid response: missing schema data');
        }
        setAllSchemas([...allSchemas, newSchema]);
        setSelectedSchemaId(newSchema.id);
        setEditedSchema({ ...editedSchema, id: newSchema.id });
        toast.success('Şema oluşturuldu');
      } else {
        // Update existing
        await apiClient.put(`/api/v2/data-schema/schemas/${editedSchema.id}`, {
          name: editedSchema.name,
          display_name: editedSchema.displayName,
          description: editedSchema.description,
          fields: editedSchema.fields,
          templates: editedSchema.templates,
          llm_guide: editedSchema.llmGuide
        });
        setAllSchemas(allSchemas.map(s =>
          s.id === editedSchema.id ? { ...s, name: editedSchema.name, display_name: editedSchema.displayName, description: editedSchema.description, fields: editedSchema.fields, templates: editedSchema.templates, llm_guide: editedSchema.llmGuide } as UnifiedSchema : s
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
    if (!editedSchema || !editedSchema.fields) return;
    if (index < 0 || index >= editedSchema.fields.length) {
      console.warn(`Invalid field index: ${index}, max length: ${editedSchema.fields.length}`);
      return;
    }
    const newFields = [...editedSchema.fields];
    const existingField = newFields[index] || {};
    newFields[index] = { ...existingField, ...field };
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

  const isActiveSchema = userSettings?.active_schema_id === selectedSchemaId;

  // Get selected schema to check if it's system schema
  const selectedSchema = selectedSchemaId && selectedSchemaId !== 'new'
    ? allSchemas.find(s => s.id === selectedSchemaId)
    : null;
  const isSystemSchema = selectedSchema?.is_system || false;

  // Filter schemas by industry
  const filteredSchemas = selectedIndustry === 'all'
    ? allSchemas
    : allSchemas.filter(s => s.industry_code === selectedIndustry);

  return (
    <>
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

          {/* Add New Schema Button */}
          <Button size="sm" onClick={handleCreateSchema} className="w-full gap-2 h-8">
            <Plus className="w-3 h-3" />
            Yeni Şema Ekle
          </Button>

          {/* Unified Schema List */}
          <div className="space-y-2">
            {filteredSchemas.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Bu sektörde şema yok
              </p>
            ) : (
              filteredSchemas.map(schema => (
                <div
                  key={schema.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedSchemaId === schema.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted'
                  }`}
                  onClick={() => handleSelectSchema(schema)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{schema.display_name}</span>
                    <div className="flex items-center gap-1">
                      {schema.tier && (
                        <Badge className={`text-[10px] px-1.5 ${TIER_COLORS[schema.tier]}`}>
                          {TIER_ICONS[schema.tier] && React.createElement(TIER_ICONS[schema.tier]!, { className: 'w-2.5 h-2.5 mr-0.5 inline' })}
                          {schema.tier}
                        </Badge>
                      )}
                      {isActiveSchema && selectedSchemaId === schema.id && (
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
                    {!schema.is_system && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-red-500 hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); handleDeleteSchema(schema.id); }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
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
          </div>

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
                <Button
                  onClick={handleSaveSchema}
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
                  />
                </div>
                <div>
                  <Label>Görüntüleme Adı</Label>
                  <Input
                    value={editedSchema.displayName}
                    onChange={(e) => setEditedSchema({ ...editedSchema, displayName: e.target.value })}
                    placeholder="Vergi Mevzuatı"
                    className="mt-1"
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

              {/* System schema info */}
              {isSystemSchema && (
                <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Bu sistem şablonudur ve düzenlenemez.
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

      {/* Pattern Management Section */}
      {selectedSchemaId && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Pattern Management</h3>
          <PatternManagement schemaId={selectedSchemaId} />
        </div>
      )}
    </>
  );
}
