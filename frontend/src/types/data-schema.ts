/**
 * Data Schema Types (Frontend)
 *
 * Veri şema yönetimi için tip tanımlamaları
 */

// Alan tipleri
export type FieldType =
  | 'string'
  | 'number'
  | 'date'
  | 'currency'
  | 'percentage'
  | 'reference'
  | 'category'
  | 'entity'
  | 'boolean';

// Tek bir alan tanımı
export interface SchemaField {
  key: string;
  label: string;
  type: FieldType;
  format?: string;
  required?: boolean;
  extractionHint?: string;
  displayOrder?: number;
  showInCitation?: boolean;
  showInTags?: boolean;
}

// Ana Data Schema yapısı
export interface DataSchema {
  id: string;
  name: string;
  displayName: string;
  description: string;
  fields: SchemaField[];
  templates: {
    analyze: string;
    citation: string;
    excerpt?: string;
    questions: string[];
  };
  llmGuide: string;
  sourceTables?: string[];
  isActive: boolean;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Global ayarlar
export interface DataSchemaGlobalSettings {
  enableAutoDetect: boolean;
  fallbackSchemaId?: string;
  maxFieldsInCitation: number;
  maxQuestionsToGenerate: number;
}

// Config yapısı
export interface DataSchemaConfig {
  activeSchemaId?: string;
  schemas: DataSchema[];
  globalSettings: DataSchemaGlobalSettings;
}

// API Response tipleri
export interface DataSchemaListResponse {
  schemas: DataSchema[];
  activeSchemaId?: string;
  globalSettings: DataSchemaGlobalSettings;
}

// İşlenmiş citation
export interface ProcessedCitation {
  text: string;
  fields: Array<{
    key: string;
    value: string;
    label: string;
  }>;
}

// İşlenmiş soru
export interface ProcessedQuestion {
  text: string;
  basedOn: string[];
}

// Field type display names
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  string: 'Metin',
  number: 'Sayı',
  date: 'Tarih',
  currency: 'Para Birimi',
  percentage: 'Yüzde',
  reference: 'Referans',
  category: 'Kategori',
  entity: 'Varlık',
  boolean: 'Evet/Hayır'
};

// Default empty schema
export const EMPTY_SCHEMA: Omit<DataSchema, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  displayName: '',
  description: '',
  fields: [],
  templates: {
    analyze: '',
    citation: '',
    questions: []
  },
  llmGuide: '',
  isActive: true
};

// Default empty field
export const EMPTY_FIELD: Omit<SchemaField, 'key'> = {
  label: '',
  type: 'string',
  showInCitation: false,
  showInTags: false
};
