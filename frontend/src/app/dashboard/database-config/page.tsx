'use client';

import { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Save, TestTube, RefreshCw, Shield, Server, Upload, Download, FileText, Settings, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema: string;
  sslMode: 'disable' | 'require' | 'verify-ca' | 'verify-full';
  poolSize: number;
  connectionString?: string;
}

interface Migration {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  executedAt?: Date;
  checksum?: string;
  direction: 'up' | 'down';
}

interface Backup {
  id: string;
  filename: string;
  size: string;
  createdAt: Date;
  type: 'full' | 'incremental';
  status: 'completed' | 'failed' | 'restoring';
}

export default function DatabaseConfigPage() {

  const [config, setConfig] = useState<DatabaseConfig>({
    host: 'localhost',
    port: 5432,
    database: 'lsemb',
    username: 'postgres',
    password: '',
    schema: 'rag_data',
    sslMode: 'disable',
    poolSize: 20
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'testing'>('disconnected');
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [activeTab, setActiveTab] = useState('config');
  const [migrationScript, setMigrationScript] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  useEffect(() => {
    loadConfig();
    loadMigrations();
    loadBackups();
  }, []);

  const loadMigrations = async () => {
    try {
      // Mock migration data
      setMigrations([
        {
          id: '001',
          name: 'Initial Schema',
          description: 'Create initial tables and indexes',
          status: 'completed',
          executedAt: new Date('2024-01-01'),
          direction: 'up'
        },
        {
          id: '002',
          name: 'Add Vector Support',
          description: 'Add pgvector extension and vector columns',
          status: 'completed',
          executedAt: new Date('2024-01-15'),
          direction: 'up'
        },
        {
          id: '003',
          name: 'Add Audit Logs',
          description: 'Create audit log tables and triggers',
          status: 'pending',
          direction: 'up'
        }
      ]);
    } catch (error) {
      console.error('Failed to load migrations:', error);
    }
  };

  const loadBackups = async () => {
    try {
      // Mock backup data
      setBackups([
        {
          id: '1',
          filename: 'lsemb_backup_2024_01_20.sql',
          size: '2.4 GB',
          createdAt: new Date('2024-01-20'),
          type: 'full',
          status: 'completed'
        },
        {
          id: '2',
          filename: 'lsemb_backup_2024_01_21.sql',
          size: '45 MB',
          createdAt: new Date('2024-01-21'),
          type: 'incremental',
          status: 'completed'
        }
      ]);
    } catch (error) {
      console.error('Failed to load backups:', error);
    }
  };

  const loadConfig = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v2/config/database');
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setConfig(data.config);
          setConnectionStatus(data.status || 'disconnected');
        }
      }
    } catch (error) {
      console.error('Failed to load database config:', error);
    }
  };

  const handleInputChange = (field: keyof DatabaseConfig, value: string | number) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Auto-generate connection string
    if (field !== 'connectionString') {
      const newConfig = { ...config, [field]: value };
      const connStr = `postgresql://${newConfig.username}:${newConfig.password}@${newConfig.host}:${newConfig.port}/${newConfig.database}`;
      setConfig(prev => ({
        ...prev,
        [field]: value,
        connectionString: connStr
      }));
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    setMessage(null);
    setConnectionStatus('testing');

    try {
      const response = await fetch('http://localhost:3001/api/v2/config/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      
      if (result.success) {
        setMessage({ type: 'success', text: `Bağlantı başarılı! Veritabanı: ${result.database}, Versiyon: ${result.version}` });
        setConnectionStatus('connected');
      } else {
        setMessage({ type: 'error', text: result.error || 'Bağlantı başarısız' });
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Bağlantı testi başarısız' });
      setConnectionStatus('disconnected');
    } finally {
      setIsTesting(false);
    }
  };

  const saveConfig = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('http://localhost:3001/api/v2/config/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: 'Veritabanı ayarları kaydedildi' });

        // Restart backend connection
        await fetch('http://localhost:3001/api/v2/config/database/restart', { method: 'POST' });

        setTimeout(() => {
          loadConfig();
        }, 2000);
      } else {
        setMessage({ type: 'error', text: result.error || 'Kaydetme başarısız' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Ayarlar kaydedilemedi' });
    } finally {
      setIsLoading(false);
    }
  };

  const runMigration = async (migrationId: string, direction: 'up' | 'down' = 'up') => {
    setIsMigrating(true);
    try {
      // Mock migration execution
      setMigrations(prev => prev.map(m =>
        m.id === migrationId
          ? { ...m, status: direction === 'up' ? 'running' : 'running', direction }
          : m
      ));

      // Simulate migration
      await new Promise(resolve => setTimeout(resolve, 3000));

      setMigrations(prev => prev.map(m =>
        m.id === migrationId
          ? { ...m, status: 'completed', executedAt: new Date() }
          : m
      ));

      setMessage({ type: 'success', text: `Migration ${migrationId} başarıyla çalıştırıldı` });
    } catch (error) {
      setMigrations(prev => prev.map(m =>
        m.id === migrationId ? { ...m, status: 'failed' } : m
      ));
      setMessage({ type: 'error', text: 'Migration çalıştırma başarısız' });
    } finally {
      setIsMigrating(false);
    }
  };

  const createBackup = async (type: 'full' | 'incremental' = 'full') => {
    setIsBackingUp(true);
    try {
      const newBackup: Backup = {
        id: Date.now().toString(),
        filename: `lsemb_backup_${new Date().toISOString().split('T')[0]}.sql`,
        size: 'Calculating...',
        createdAt: new Date(),
        type,
        status: 'completed'
      };

      setBackups(prev => [newBackup, ...prev]);
      setMessage({ type: 'success', text: `${type === 'full' ? 'Full' : 'Incremental'} backup oluşturuluyor...` });
    } catch (error) {
      setMessage({ type: 'error', text: 'Backup oluşturulamadı' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const restoreBackup = async (backupId: string) => {
    try {
      setBackups(prev => prev.map(b =>
        b.id === backupId ? { ...b, status: 'restoring' } : b
      ));

      // Simulate restore
      await new Promise(resolve => setTimeout(resolve, 5000));

      setBackups(prev => prev.map(b =>
        b.id === backupId ? { ...b, status: 'completed' } : b
      ));

      setMessage({ type: 'success', text: 'Backup başarıyla geri yüklendi' });
    } catch (error) {
      setBackups(prev => prev.map(b =>
        b.id === backupId ? { ...b, status: 'failed' } : b
      ));
      setMessage({ type: 'error', text: 'Backup geri yüklenemedi' });
    }
  };

  return (
    <div className="p-6 lg:p-8 container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Database className="h-8 w-8" />
          Veritabanı Yönetimi
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Veritabanı yapılandırması, migration ve backup yönetimi
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config">Yapılandırma</TabsTrigger>
          <TabsTrigger value="migrations">Migrations</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">

      {message && (
        <Alert className={`mb-6 ${message.type === 'error' ? 'border-red-500' : message.type === 'success' ? 'border-green-500' : 'border-blue-500'}`}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Bağlantı Durumu</span>
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' : 
                  connectionStatus === 'testing' ? 'bg-yellow-500 animate-pulse' : 
                  'bg-red-500'
                }`} />
                <span className="text-sm text-muted-foreground">
                  {connectionStatus === 'connected' ? 'Bağlı' : 
                   connectionStatus === 'testing' ? 'Test ediliyor...' : 
                   'Bağlı değil'}
                </span>
              </div>
            </CardTitle>
          </CardHeader>
        </Card>

        {/* PostgreSQL Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              PostgreSQL Ayarları
            </CardTitle>
            <CardDescription>
              Veritabanı sunucu bağlantı bilgileri
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="host">Host / IP Adresi</Label>
                <Input
                  id="host"
                  value={config.host}
                  onChange={(e) => handleInputChange('host', e.target.value)}
                  placeholder="localhost veya IP adresi"
                />
              </div>
              <div>
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={config.port}
                  onChange={(e) => handleInputChange('port', parseInt(e.target.value))}
                  placeholder="5432"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="database">Veritabanı Adı</Label>
              <Input
                id="database"
                value={config.database}
                onChange={(e) => handleInputChange('database', e.target.value)}
                placeholder="lsemb veya müşteri veritabanı adı"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="username">Kullanıcı Adı</Label>
                <Input
                  id="username"
                  value={config.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="postgres"
                />
              </div>
              <div>
                <Label htmlFor="password">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  value={config.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="schema">Schema (RAG Data)</Label>
              <Input
                id="schema"
                value={config.schema}
                onChange={(e) => handleInputChange('schema', e.target.value)}
                placeholder="rag_data"
              />
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Gelişmiş Ayarlar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sslMode">SSL Modu</Label>
                <Select value={config.sslMode} onValueChange={(value) => handleInputChange('sslMode', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disable">Devre Dışı</SelectItem>
                    <SelectItem value="require">Zorunlu</SelectItem>
                    <SelectItem value="verify-ca">CA Doğrula</SelectItem>
                    <SelectItem value="verify-full">Tam Doğrula</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="poolSize">Bağlantı Havuzu Boyutu</Label>
                <Input
                  id="poolSize"
                  type="number"
                  value={config.poolSize}
                  onChange={(e) => handleInputChange('poolSize', parseInt(e.target.value))}
                  placeholder="20"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="connectionString">Bağlantı Dizesi (Otomatik)</Label>
              <Input
                id="connectionString"
                value={config.connectionString || ''}
                readOnly
                className="bg-muted font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-end">
          <Button
            variant="outline"
            onClick={testConnection}
            disabled={isTesting}
          >
            {isTesting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Test Ediliyor...
              </>
            ) : (
              <>
                <TestTube className="h-4 w-4 mr-2" />
                Bağlantıyı Test Et
              </>
            )}
          </Button>
          <Button
            onClick={saveConfig}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Ayarları Kaydet
              </>
            )}
          </Button>
        </div>
      </div>
      </TabsContent>

      <TabsContent value="migrations" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Database Migrations</span>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Migration Yükle
              </Button>
            </CardTitle>
            <CardDescription>
              Veritabanı schema değişikliklerini yönetin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {migrations.map((migration) => (
                <Card key={migration.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium">{migration.name}</h4>
                          <Badge variant={
                            migration.status === 'completed' ? 'default' :
                            migration.status === 'running' ? 'secondary' :
                            migration.status === 'failed' ? 'destructive' : 'outline'
                          }>
                            {migration.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{migration.description}</p>
                        {migration.executedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Çalıştırma: {migration.executedAt.toLocaleString('tr-TR')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {migration.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => runMigration(migration.id, 'up')}
                            disabled={isMigrating}
                          >
                            Çalıştır
                          </Button>
                        )}
                        {migration.status === 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runMigration(migration.id, 'down')}
                            disabled={isMigrating}
                          >
                            Geri Al
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Özel Migration</CardTitle>
            <CardDescription>
              SQL script çalıştırın
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="SQL migration scriptini buraya yapıştırın..."
              value={migrationScript}
              onChange={(e) => setMigrationScript(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <Button>
              <FileText className="h-4 w-4 mr-2" />
              Scripti Çalıştır
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="backups" className="space-y-6">
        <div className="flex items-center justify-between">
          <Card>
            <CardHeader>
              <CardTitle>Backup İstatistikleri</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{backups.length}</p>
                  <p className="text-sm text-muted-foreground">Toplam Backup</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {backups.filter(b => b.type === 'full').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Full Backup</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {backups.filter(b => b.type === 'incremental').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Incremental</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={() => createBackup('full')} disabled={isBackingUp}>
              <Download className="h-4 w-4 mr-2" />
              Full Backup
            </Button>
            <Button onClick={() => createBackup('incremental')} disabled={isBackingUp} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Incremental Backup
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Backup Geçmişi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {backups.map((backup) => (
                <Card key={backup.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{backup.filename}</h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span>{backup.size}</span>
                          <span>•</span>
                          <span>{backup.type}</span>
                          <span>•</span>
                          <span>{backup.createdAt.toLocaleString('tr-TR')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          backup.status === 'completed' ? 'default' :
                          backup.status === 'restoring' ? 'secondary' : 'destructive'
                        }>
                          {backup.status}
                        </Badge>
                        {backup.status === 'completed' && (
                          <>
                            <ConfirmTooltip
                              onConfirm={() => restoreBackup(backup.id)}
                              message="Backup geri yüklensin mi?"
                              side="top"
                            >
                              <Button
                                size="sm"
                                variant="outline"
                              >
                                Geri Yükle
                              </Button>
                            </ConfirmTooltip>
                            <Button size="sm" variant="outline">
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tools" className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Database Tools
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start">
                <RefreshCw className="h-4 w-4 mr-2" />
                Vacuum & Analyze
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Generate Schema Report
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Database className="h-4 w-4 mr-2" />
                View Query Stats
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Tools
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start">
                <CheckCircle className="h-4 w-4 mr-2" />
                Validate Permissions
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <XCircle className="h-4 w-4 mr-2" />
                Check for Vulnerabilities
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Clock className="h-4 w-4 mr-2" />
                Audit Trail Report
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Query Editor</CardTitle>
            <CardDescription>
              Doğrudan SQL sorguları çalıştırın
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="SELECT * FROM table_name LIMIT 10;"
              rows={5}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button>Çalıştır</Button>
              <Button variant="outline">Kaydet</Button>
              <Button variant="outline">Açıkla</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>
    </div>
  );
}