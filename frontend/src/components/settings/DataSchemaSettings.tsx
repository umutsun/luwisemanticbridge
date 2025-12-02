'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Edit2,
  Check,
  X,
  FileText,
  Tag,
  MessageSquare,
  BookOpen,
  Save,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Sparkles
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
  const [globalSettings, setGlobalSettings] = useState<DataSchemaGlobalSettings>({
    enableAutoDetect: true,
    maxFieldsInCitation: 4,
    maxQuestionsToGenerate: 3
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingSchema, setEditingSchema] = useState<DataSchema | null>(null);
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);

  // Load schemas on mount
  useEffect(() => {
    loadSchemas();
  }, []);

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
      setSchemas(schemas.filter(s => s.id !== schemaId));
      toast.success('Şema silindi');
    } catch (error) {
      console.error('Failed to delete schema:', error);
      toast.error('Şema silinemedi');
    }
  };

  const handleSaveSchema = async (schema: DataSchema) => {
    try {
      setSaving(true);
      if (schema.id) {
        await apiClient.put(`/api/v2/data-schema/${schema.id}`, schema);
        setSchemas(schemas.map(s => s.id === schema.id ? schema : s));
      } else {
        const response = await apiClient.post('/api/v2/data-schema', schema);
        setSchemas([...schemas, response.data.schema]);
      }
      setEditingSchema(null);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5" />
            Veri Şeması Yapılandırması
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Belgelerinizin yapısını tanımlayın, LLM'in veriyi doğru yorumlamasını sağlayın
          </p>
        </div>
        <Button
          onClick={() => setEditingSchema({
            id: '',
            name: '',
            displayName: '',
            description: '',
            fields: [],
            templates: { analyze: '', citation: '', questions: [] },
            llmGuide: '',
            isActive: true,
            createdAt: '',
            updatedAt: ''
          })}
          className="bg-gradient-to-r from-violet-600 to-purple-600 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Yeni Şema
        </Button>
      </div>

      {/* Global Settings */}
      <Card className="border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Genel Ayarlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Otomatik Şema Tespiti</Label>
              <p className="text-xs text-gray-500">Belge içeriğine göre şema otomatik seçilsin</p>
            </div>
            <Switch
              checked={globalSettings.enableAutoDetect}
              onCheckedChange={(checked) => setGlobalSettings({ ...globalSettings, enableAutoDetect: checked })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Citation'da Max Alan</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={globalSettings.maxFieldsInCitation}
                onChange={(e) => setGlobalSettings({ ...globalSettings, maxFieldsInCitation: parseInt(e.target.value) || 4 })}
              />
            </div>
            <div>
              <Label>Max Takip Sorusu</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={globalSettings.maxQuestionsToGenerate}
                onChange={(e) => setGlobalSettings({ ...globalSettings, maxQuestionsToGenerate: parseInt(e.target.value) || 3 })}
              />
            </div>
          </div>
          <Button variant="outline" onClick={handleSaveGlobalSettings} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            Ayarları Kaydet
          </Button>
        </CardContent>
      </Card>

      {/* Schema List */}
      <div className="space-y-3">
        {schemas.map((schema) => (
          <Card
            key={schema.id}
            className={`border transition-all ${
              activeSchemaId === schema.id
                ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-900/10'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="cursor-pointer"
                    onClick={() => setExpandedSchema(expandedSchema === schema.id ? null : schema.id)}
                  >
                    {expandedSchema === schema.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-medium">{schema.displayName}</CardTitle>
                      {activeSchemaId === schema.id && (
                        <Badge variant="default" className="bg-violet-600">Aktif</Badge>
                      )}
                      {schema.isDefault && (
                        <Badge variant="outline">Varsayılan</Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs mt-0.5">{schema.description}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeSchemaId !== schema.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleActivateSchema(schema.id)}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Aktifleştir
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingSchema(schema)}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  {!schema.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSchema(schema.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {expandedSchema === schema.id && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {/* Fields */}
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Tag className="w-3 h-3" /> Alanlar ({schema.fields.length})
                    </h4>
                    <div className="space-y-1">
                      {schema.fields.map((field) => (
                        <div key={field.key} className="flex items-center gap-2 text-xs p-1.5 bg-gray-50 dark:bg-gray-800 rounded">
                          <span className="font-mono text-violet-600">{field.key}</span>
                          <span className="text-gray-400">→</span>
                          <span>{field.label}</span>
                          <Badge variant="outline" className="text-[10px]">{FIELD_TYPE_LABELS[field.type]}</Badge>
                          {field.showInCitation && <FileText className="w-2.5 h-2.5 text-blue-500" title="Citation'da göster" />}
                          {field.showInTags && <Tag className="w-2.5 h-2.5 text-green-500" title="Tag olarak göster" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Templates */}
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Templates
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-gray-500">Citation:</span>
                        <code className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                          {schema.templates.citation || '(boş)'}
                        </code>
                      </div>
                      <div>
                        <span className="text-gray-500">Sorular:</span>
                        <span className="ml-2">{schema.templates.questions.length} adet</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* LLM Guide Preview */}
                {schema.llmGuide && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <h4 className="text-xs font-medium mb-1 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> LLM Kılavuzu
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3">
                      {schema.llmGuide}
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Edit Modal */}
      {editingSchema && (
        <SchemaEditor
          schema={editingSchema}
          onSave={handleSaveSchema}
          onCancel={() => setEditingSchema(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

// Schema Editor Component
interface SchemaEditorProps {
  schema: DataSchema;
  onSave: (schema: DataSchema) => void;
  onCancel: () => void;
  saving: boolean;
}

function SchemaEditor({ schema, onSave, onCancel, saving }: SchemaEditorProps) {
  const [editedSchema, setEditedSchema] = useState<DataSchema>(schema);
  const [activeTab, setActiveTab] = useState('basic');

  const handleFieldChange = (index: number, field: Partial<SchemaField>) => {
    const newFields = [...editedSchema.fields];
    newFields[index] = { ...newFields[index], ...field };
    setEditedSchema({ ...editedSchema, fields: newFields });
  };

  const handleAddField = () => {
    const newKey = `field_${editedSchema.fields.length + 1}`;
    setEditedSchema({
      ...editedSchema,
      fields: [...editedSchema.fields, { ...EMPTY_FIELD, key: newKey }]
    });
  };

  const handleRemoveField = (index: number) => {
    setEditedSchema({
      ...editedSchema,
      fields: editedSchema.fields.filter((_, i) => i !== index)
    });
  };

  const handleAddQuestion = () => {
    setEditedSchema({
      ...editedSchema,
      templates: {
        ...editedSchema.templates,
        questions: [...editedSchema.templates.questions, '']
      }
    });
  };

  const handleQuestionChange = (index: number, value: string) => {
    const newQuestions = [...editedSchema.templates.questions];
    newQuestions[index] = value;
    setEditedSchema({
      ...editedSchema,
      templates: { ...editedSchema.templates, questions: newQuestions }
    });
  };

  const handleRemoveQuestion = (index: number) => {
    setEditedSchema({
      ...editedSchema,
      templates: {
        ...editedSchema.templates,
        questions: editedSchema.templates.questions.filter((_, i) => i !== index)
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold">
            {schema.id ? 'Şemayı Düzenle' : 'Yeni Şema Oluştur'}
          </h3>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="basic">Temel Bilgiler</TabsTrigger>
              <TabsTrigger value="fields">Alanlar</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="llm">LLM Kılavuzu</TabsTrigger>
            </TabsList>

            {/* Basic Info */}
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Şema Adı (teknik)</Label>
                  <Input
                    value={editedSchema.name}
                    onChange={(e) => setEditedSchema({ ...editedSchema, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    placeholder="vergi_mevzuati"
                  />
                </div>
                <div>
                  <Label>Görüntüleme Adı</Label>
                  <Input
                    value={editedSchema.displayName}
                    onChange={(e) => setEditedSchema({ ...editedSchema, displayName: e.target.value })}
                    placeholder="Vergi Mevzuatı"
                  />
                </div>
              </div>
              <div>
                <Label>Açıklama</Label>
                <Textarea
                  value={editedSchema.description}
                  onChange={(e) => setEditedSchema({ ...editedSchema, description: e.target.value })}
                  placeholder="Bu şema hangi tür belgeler için kullanılacak?"
                  rows={3}
                />
              </div>
              <div>
                <Label>Kaynak Tablolar (virgülle ayırın)</Label>
                <Input
                  value={editedSchema.sourceTables?.join(', ') || ''}
                  onChange={(e) => setEditedSchema({
                    ...editedSchema,
                    sourceTables: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                  })}
                  placeholder="OZELGELER, DANISTAYKARARLARI"
                />
                <p className="text-xs text-gray-500 mt-1">Bu tablolardan gelen veriler otomatik olarak bu şemayı kullanır</p>
              </div>
            </TabsContent>

            {/* Fields */}
            <TabsContent value="fields" className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">Belgelerden çıkarılacak alanları tanımlayın</p>
                <Button variant="outline" size="sm" onClick={handleAddField}>
                  <Plus className="w-3 h-3 mr-1" /> Alan Ekle
                </Button>
              </div>

              <div className="space-y-3">
                {editedSchema.fields.map((field, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex-1 grid grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Anahtar</Label>
                        <Input
                          value={field.key}
                          onChange={(e) => handleFieldChange(index, { key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                          placeholder="kanun_no"
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Etiket</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => handleFieldChange(index, { label: e.target.value })}
                          placeholder="Kanun No"
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Tip</Label>
                        <Select
                          value={field.type}
                          onValueChange={(value) => handleFieldChange(index, { type: value as FieldType })}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Format</Label>
                        <Input
                          value={field.format || ''}
                          onChange={(e) => handleFieldChange(index, { format: e.target.value })}
                          placeholder="DD.MM.YYYY"
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={field.showInCitation}
                          onCheckedChange={(checked) => handleFieldChange(index, { showInCitation: checked })}
                        />
                        <span className="text-xs">Citation</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={field.showInTags}
                          onCheckedChange={(checked) => handleFieldChange(index, { showInTags: checked })}
                        />
                        <span className="text-xs">Tag</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveField(index)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Templates */}
            <TabsContent value="templates" className="space-y-4">
              <div>
                <Label>Analiz Prompt'u</Label>
                <Textarea
                  value={editedSchema.templates.analyze}
                  onChange={(e) => setEditedSchema({
                    ...editedSchema,
                    templates: { ...editedSchema.templates, analyze: e.target.value }
                  })}
                  placeholder="Bu belgeyi analiz et ve aşağıdaki bilgileri çıkar..."
                  rows={4}
                />
                <p className="text-xs text-gray-500 mt-1">Belge işlenirken LLM'e gönderilecek prompt</p>
              </div>

              <div>
                <Label>Citation Template</Label>
                <Input
                  value={editedSchema.templates.citation}
                  onChange={(e) => setEditedSchema({
                    ...editedSchema,
                    templates: { ...editedSchema.templates, citation: e.target.value }
                  })}
                  placeholder="{{kanun_no}} Md.{{madde_no}} - {{tarih}}"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Değişkenler: {editedSchema.fields.map(f => `{{${f.key}}}`).join(', ')}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Takip Soruları</Label>
                  <Button variant="outline" size="sm" onClick={handleAddQuestion}>
                    <Plus className="w-3 h-3 mr-1" /> Soru Ekle
                  </Button>
                </div>
                <div className="space-y-2">
                  {editedSchema.templates.questions.map((question, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={question}
                        onChange={(e) => handleQuestionChange(index, e.target.value)}
                        placeholder="{{madde_no}}. maddenin uygulama esasları nelerdir?"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveQuestion(index)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* LLM Guide */}
            <TabsContent value="llm" className="space-y-4">
              <div>
                <Label>LLM Kılavuzu</Label>
                <Textarea
                  value={editedSchema.llmGuide}
                  onChange={(e) => setEditedSchema({ ...editedSchema, llmGuide: e.target.value })}
                  placeholder="Bu veri Türk vergi mevzuatını içermektedir. Kaynaklar arasında..."
                  rows={8}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Bu metin sistem prompt'a eklenerek LLM'in veriyi doğru yorumlamasını sağlar
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={onCancel}>İptal</Button>
          <Button
            onClick={() => onSave(editedSchema)}
            disabled={saving || !editedSchema.name || !editedSchema.displayName}
            className="bg-gradient-to-r from-violet-600 to-purple-600 text-white"
          >
            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
