'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot, 
  Settings, 
  Save, 
  RefreshCw, 
  Plus, 
  Trash2,
  MessageSquare,
  Palette,
  FileText,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface ChatbotSettings {
  title: string;
  welcomeMessage: string;
  placeholder: string;
  primaryColor: string;
  suggestions: string;
}

interface Suggestion {
  icon: string;
  title: string;
  description: string;
}

export default function ChatbotSettingsPage() {
  const [settings, setSettings] = useState<ChatbotSettings>({
    title: '',
    welcomeMessage: '',
    placeholder: '',
    primaryColor: '#3B82F6',
    suggestions: '[]'
  });
  
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8084/api/v2/chatbot/settings');
      const data = await response.json();
      
      setSettings({
        title: data.title || '',
        welcomeMessage: data.welcomeMessage || '',
        placeholder: data.placeholder || '',
        primaryColor: data.primaryColor || '#3B82F6',
        suggestions: data.suggestions || '[]'
      });
      
      try {
        const parsedSuggestions = JSON.parse(data.suggestions || '[]');
        setSuggestions(Array.isArray(parsedSuggestions) ? parsedSuggestions : []);
      } catch {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setMessage({ type: 'error', text: 'Ayarlar yüklenemedi' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('http://localhost:8084/api/v2/chatbot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          suggestions: JSON.stringify(suggestions)
        })
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Ayarlar başarıyla kaydedildi' });
        // Refresh the page after 1.5 seconds
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({ type: 'error', text: 'Ayarlar kaydedilemedi' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Tüm ayarlar varsayılan değerlere dönecek. Emin misiniz?')) {
      return;
    }
    
    try {
      const response = await fetch('http://localhost:8084/api/v2/chatbot/settings', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Ayarlar sıfırlandı' });
        fetchSettings();
      }
    } catch (error) {
      console.error('Failed to reset settings:', error);
      setMessage({ type: 'error', text: 'Ayarlar sıfırlanamadı' });
    }
  };

  const addSuggestion = () => {
    setSuggestions([
      ...suggestions,
      { icon: '📌', title: '', description: '' }
    ]);
  };

  const updateSuggestion = (index: number, field: keyof Suggestion, value: string) => {
    const updated = [...suggestions];
    updated[index] = { ...updated[index], [field]: value };
    setSuggestions(updated);
  };

  const removeSuggestion = (index: number) => {
    setSuggestions(suggestions.filter((_, i) => i !== index));
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Chatbot Ayarları
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Chatbot başlık, karşılama mesajı ve görünümünü özelleştirin
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={loading || saving}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Varsayılana Dön
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || saving}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </div>
      </div>

      {/* Alert Message */}
      {message && (
        <Alert className={message.type === 'error' ? 'border-red-500' : 'border-green-500'}>
          {message.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Preview Card */}
      <Card className="border-2 border-dashed">
        <CardHeader>
          <CardTitle className="text-lg">Önizleme</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
            <div className="text-center max-w-lg mx-auto">
              <div 
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg"
                style={{ backgroundColor: settings.primaryColor }}
              >
                <Bot className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                {settings.title || 'Chatbot Başlığı'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                {settings.welcomeMessage || 'Karşılama mesajınız buraya gelecek'}
              </p>
              {suggestions.length > 0 && (
                <div className="grid grid-cols-1 gap-3 text-left">
                  {suggestions.slice(0, 3).map((suggestion, index) => (
                    <div key={index} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md border">
                      <p className="text-sm font-medium">
                        {suggestion.icon} {suggestion.title || 'Öneri Başlığı'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {suggestion.description || 'Öneri açıklaması'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Tabs */}
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">
            <Settings className="h-4 w-4 mr-2" />
            Genel Ayarlar
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="h-4 w-4 mr-2" />
            Görünüm
          </TabsTrigger>
          <TabsTrigger value="suggestions">
            <MessageSquare className="h-4 w-4 mr-2" />
            Öneriler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Temel Ayarlar</CardTitle>
              <CardDescription>
                Chatbot başlığı ve mesajlarını özelleştirin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Chatbot Başlığı</Label>
                <Input
                  id="title"
                  value={settings.title}
                  onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                  placeholder="Örn: Hukuki Asistan"
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Chat penceresinde görünecek başlık
                </p>
              </div>
              
              <div>
                <Label htmlFor="welcomeMessage">Karşılama Mesajı</Label>
                <Textarea
                  id="welcomeMessage"
                  value={settings.welcomeMessage}
                  onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                  placeholder="Kullanıcıları karşılayacak mesaj..."
                  className="mt-1"
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Kullanıcı chat'i açtığında görecek ilk mesaj
                </p>
              </div>
              
              <div>
                <Label htmlFor="placeholder">Input Placeholder</Label>
                <Input
                  id="placeholder"
                  value={settings.placeholder}
                  onChange={(e) => setSettings({ ...settings, placeholder: e.target.value })}
                  placeholder="Örn: Sorunuzu yazın..."
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Mesaj yazma alanında görünecek yardımcı metin
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Görünüm Ayarları</CardTitle>
              <CardDescription>
                Chatbot'un görsel özelliklerini düzenleyin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="primaryColor">Ana Renk</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="primaryColor"
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    className="w-20 h-10"
                  />
                  <Input
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    placeholder="#3B82F6"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  İkon ve vurgu renkleri için kullanılacak
                </p>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettings({ ...settings, primaryColor: '#3B82F6' })}
                  className="h-20"
                >
                  <div className="space-y-1 text-center">
                    <div className="w-8 h-8 bg-blue-500 rounded mx-auto" />
                    <span className="text-xs">Mavi</span>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettings({ ...settings, primaryColor: '#10B981' })}
                  className="h-20"
                >
                  <div className="space-y-1 text-center">
                    <div className="w-8 h-8 bg-green-500 rounded mx-auto" />
                    <span className="text-xs">Yeşil</span>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettings({ ...settings, primaryColor: '#8B5CF6' })}
                  className="h-20"
                >
                  <div className="space-y-1 text-center">
                    <div className="w-8 h-8 bg-purple-500 rounded mx-auto" />
                    <span className="text-xs">Mor</span>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettings({ ...settings, primaryColor: '#F59E0B' })}
                  className="h-20"
                >
                  <div className="space-y-1 text-center">
                    <div className="w-8 h-8 bg-amber-500 rounded mx-auto" />
                    <span className="text-xs">Turuncu</span>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Öneri Kartları</CardTitle>
              <CardDescription>
                Kullanıcılara gösterilecek öneri kartlarını düzenleyin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {suggestions.map((suggestion, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium">Öneri {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSuggestion(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-2">
                      <Input
                        value={suggestion.icon}
                        onChange={(e) => updateSuggestion(index, 'icon', e.target.value)}
                        placeholder="📚"
                        className="text-center"
                      />
                    </div>
                    <div className="col-span-4">
                      <Input
                        value={suggestion.title}
                        onChange={(e) => updateSuggestion(index, 'title', e.target.value)}
                        placeholder="Başlık"
                      />
                    </div>
                    <div className="col-span-6">
                      <Input
                        value={suggestion.description}
                        onChange={(e) => updateSuggestion(index, 'description', e.target.value)}
                        placeholder="Açıklama"
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <Button
                variant="outline"
                onClick={addSuggestion}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Yeni Öneri Ekle
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}