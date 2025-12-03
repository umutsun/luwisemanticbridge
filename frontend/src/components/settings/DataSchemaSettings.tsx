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
  ChevronUp
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

export default function DataSchemaSettings() {
  const [schemas, setSchemas] = useState<DataSchema[]>([]);
  const [activeSchemaId, setActiveSchemaId] = useState<string | undefined>();
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [globalSettings, setGlobalSettings] = useState<DataSchemaGlobalSettings>({
    enableAutoDetect: true,
    maxFieldsInCitation: 4,
    maxQuestionsToGenerate: 3
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedSchema, setEditedSchema] = useState<DataSchema | null>(null);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);

  // Load schemas on mount
  useEffect(() => {
    loadSchemas();
  }, []);

  // Auto-select first schema
  useEffect(() => {
    if (schemas.length > 0 && !selectedSchemaId) {
      const firstSchema = schemas[0];
      setSelectedSchemaId(firstSchema.id);
      setEditedSchema({ ...firstSchema });
    }
  }, [schemas, selectedSchemaId]);

  const loadSchemas = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/v2/data-schema');
      setSchemas(response.data.schemas || []);
      setActiveSchemaId(response.data.activeSchemaId);
      setGlobalSettings(response.data.globalSettings || {
        enableAutoDetect: true,
        maxFieldsInCitation: 4,
        maxQuestionsToGenerate: 3
      });
    } catch (error) {
      console.error('Failed to load schemas:', error);
      toast.error('Şemalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSchema = (schemaId: string) => {
    const schema = schemas.find(s => s.id === schemaId);
    if (schema) {
      setSelectedSchemaId(schemaId);
      setEditedSchema({ ...schema });
    }
  };

  const handleCreateNewSchema = () => {
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

  const handleActivateSchema = async (schemaId: string) => {
    try {
      await apiClient.post(`/api/v2/data-schema/${schemaId}/activate`);
      setActiveSchemaId(schemaId);
      toast.success('Şema aktifleştirildi');
    } catch (error) {
      console.error('Failed to activate schema:', error);
      toast.error('Şema aktifleştirilemedi');
    }
  };

  const handleDeleteSchema = async (schemaId: string) => {
    const schema = schemas.find(s => s.id === schemaId);
    if (schema?.isDefault) {
      toast.error('Varsayılan şema silinemez');
      return;
    }

    if (!confirm('Bu şemayı silmek istediğinizden emin misiniz?')) return;

    try {
      await apiClient.delete(`/api/v2/data-schema/${schemaId}`);
      const updatedSchemas = schemas.filter(s => s.id !== schemaId);
      setSchemas(updatedSchemas);
      if (selectedSchemaId === schemaId && updatedSchemas.length > 0) {
        handleSelectSchema(updatedSchemas[0].id);
      }
      toast.success('Şema silindi');
    } catch (error) {
      console.error('Failed to delete schema:', error);
      toast.error('Şema silinemedi');
    }
  };

  const handleSaveSchema = async () => {
    if (!editedSchema) return;

    try {
      setSaving(true);
      if (editedSchema.id) {
        await apiClient.put(`/api/v2/data-schema/${editedSchema.id}`, editedSchema);
        setSchemas(schemas.map(s => s.id === editedSchema.id ? editedSchema : s));
      } else {
        const response = await apiClient.post('/api/v2/data-schema', editedSchema);
        const newSchema = response.data.schema;
        setSchemas([...schemas, newSchema]);
        setSelectedSchemaId(newSchema.id);
        setEditedSchema(newSchema);
      }
      toast.success('Şema kaydedildi');
    } catch (error) {
      console.error('Failed to save schema:', error);
      toast.error('Şema kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGlobalSettings = async () => {
    try {
      setSaving(true);
      await apiClient.put('/api/v2/data-schema/settings/global', globalSettings);
      toast.success('Ayarlar kaydedildi');
    } catch (error) {
      console.error('Failed to save global settings:', error);
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

  return (
    <div className="grid grid-cols-[35%_65%] gap-6">
      {/* Schema List - Left Column */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Şema Kütüphanesi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <h3 className="text-sm font-medium">Veri Şemaları</h3>
            <Button size="sm" onClick={handleCreateNewSchema} className="gap-2">
              <Plus className="w-4 h-4" />
              Yeni
            </Button>
          </div>

          <div className="space-y-2">
            {schemas.map((schema) => (
              <div
                key={schema.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedSchemaId === schema.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                }`}
                onClick={() => handleSelectSchema(schema.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      activeSchemaId === schema.id ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    <span className="font-medium">{schema.displayName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      {schema.fields.length} alan
                    </Badge>
                    {schema.isDefault && (
                      <Badge variant="secondary" className="text-xs">Varsayılan</Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {schema.description || schema.name}
                </p>
              </div>
            ))}

            {/* New schema placeholder */}
            {selectedSchemaId === 'new' && (
              <div className="p-3 rounded-lg border border-primary bg-primary/5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="font-medium">Yeni Şema</span>
                  <Badge variant="outline" className="text-xs">Kaydedilmedi</Badge>
                </div>
              </div>
            )}
          </div>

          {/* Global Settings */}
          <div className="pt-4 border-t border-border space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Settings className="w-3 h-3" />
              Genel Ayarlar
            </h4>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Otomatik Tespit</Label>
              <Switch
                checked={globalSettings.enableAutoDetect}
                onCheckedChange={(checked) => setGlobalSettings({ ...globalSettings, enableAutoDetect: checked })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Max Citation</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={globalSettings.maxFieldsInCitation}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, maxFieldsInCitation: parseInt(e.target.value) || 4 })}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Max Soru</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={globalSettings.maxQuestionsToGenerate}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, maxQuestionsToGenerate: parseInt(e.target.value) || 3 })}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleSaveGlobalSettings} disabled={saving} className="w-full">
              <Save className="w-3 h-3 mr-2" />
              Ayarları Kaydet
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Schema Editor - Right Column */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Şema Editörü</span>
            {editedSchema && (
              <div className="flex items-center gap-2">
                {editedSchema.id && activeSchemaId !== editedSchema.id && (
                  <Button variant="outline" size="sm" onClick={() => handleActivateSchema(editedSchema.id)}>
                    <Check className="w-3 h-3 mr-1" />
                    Aktifleştir
                  </Button>
                )}
                {editedSchema.id && !editedSchema.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteSchema(editedSchema.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Sil
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
                />
              </div>

              <div>
                <Label>Kaynak Tablolar</Label>
                <Input
                  value={editedSchema.sourceTables?.join(', ') || ''}
                  onChange={(e) => setEditedSchema({
                    ...editedSchema,
                    sourceTables: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                  })}
                  placeholder="OZELGELER, DANISTAYKARARLARI"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Virgülle ayırın</p>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleAddField(); }}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
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
                        />
                        <Input
                          value={field.label}
                          onChange={(e) => handleFieldChange(index, { label: e.target.value })}
                          placeholder="Label"
                          className="h-8 flex-1 text-xs"
                        />
                        <Select
                          value={field.type}
                          onValueChange={(value) => handleFieldChange(index, { type: value as FieldType })}
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
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveField(index)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
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
                />
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Düzenlemek için bir şema seçin veya yeni şema oluşturun</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
