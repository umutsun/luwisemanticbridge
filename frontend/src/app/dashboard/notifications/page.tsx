'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  Mail,
  MessageSquare,
  Slack,
  Webhook,
  Save,
  Plus,
  Trash2,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NotificationRule {
  id: string;
  name: string;
  conditions: {
    type: string;
    operator: string;
    value: string;
  }[];
  actions: {
    type: 'email' | 'webhook' | 'slack';
    target: string;
    template?: string;
  }[];
  enabled: boolean;
}

interface NotificationChannel {
  id: string;
  type: 'email' | 'webhook' | 'slack';
  name: string;
  config: Record<string, string>;
  enabled: boolean;
}

export default function NotificationSettings() {
  const { t } = useTranslation();

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopEnabled, setDesktopEnabled] = useState(true);

  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>([
    {
      id: '1',
      name: 'High CPU Alert',
      conditions: [
        { type: 'cpu_usage', operator: '>', value: '85' }
      ],
      actions: [
        { type: 'email', target: 'admin@example.com' },
        { type: 'slack', target: '#alerts' }
      ],
      enabled: true
    },
    {
      id: '2',
      name: 'Service Down',
      conditions: [
        { type: 'service_status', operator: '=', value: 'down' }
      ],
      actions: [
        { type: 'webhook', target: 'https://hooks.slack.com/...' }
      ],
      enabled: true
    }
  ]);

  const [channels, setChannels] = useState<NotificationChannel[]>([
    {
      id: '1',
      type: 'email',
      name: 'Admin Email',
      config: { email: 'admin@example.com', smtp: 'smtp.gmail.com' },
      enabled: true
    },
    {
      id: '2',
      type: 'webhook',
      name: 'Slack Integration',
      config: { url: 'https://hooks.slack.com/...' },
      enabled: true
    }
  ]);

  const notificationTypes = [
    { id: 'system', name: t('notifications.types.system'), icon: Settings, description: t('notifications.types.systemDescription') },
    { id: 'security', name: t('notifications.types.security'), icon: AlertTriangle, description: t('notifications.types.securityDescription') },
    { id: 'documents', name: t('notifications.types.documents'), icon: CheckCircle, description: t('notifications.types.documentsDescription') },
    { id: 'queries', name: t('notifications.types.queries'), icon: MessageSquare, description: t('notifications.types.queriesDescription') },
    { id: 'maintenance', name: t('notifications.types.maintenance'), icon: Clock, description: t('notifications.types.maintenanceDescription') }
  ];

  return (
    <div className="w-[90%] mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('notifications.settings.title')}</h1>
          <p className="text-muted-foreground">{t('notifications.settings.description')}</p>
        </div>
        <Button>
          <Save className="h-4 w-4 mr-2" />
          {t('notifications.settings.saveSettings')}
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">{t('notifications.settings.general')}</TabsTrigger>
          <TabsTrigger value="channels">{t('notifications.settings.channels')}</TabsTrigger>
          <TabsTrigger value="rules">{t('notifications.settings.rules')}</TabsTrigger>
          <TabsTrigger value="templates">{t('notifications.settings.templates')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  {t('notifications.settings.notificationPreferences')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {notificationTypes.map((type) => (
                  <div key={type.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <type.icon className="h-4 w-4" />
                      <div>
                        <p className="font-medium">{type.name}</p>
                        <p className="text-sm text-muted-foreground">{type.description}</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5" />
                  {t('notifications.settings.soundAndVisualAlerts')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {soundEnabled ? (
                      <Volume2 className="h-4 w-4" />
                    ) : (
                      <VolumeX className="h-4 w-4" />
                    )}
                    <span>{t('notifications.settings.soundNotifications')}</span>
                  </div>
                  <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <span>{t('notifications.settings.desktopNotifications')}</span>
                  </div>
                  <Switch checked={desktopEnabled} onCheckedChange={setDesktopEnabled} />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>{t('notifications.settings.notificationSound')}</Label>
                  <Select defaultValue="default">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t('notifications.settings.default')}</SelectItem>
                      <SelectItem value="chime">{t('notifications.settings.chime')}</SelectItem>
                      <SelectItem value="bell">{t('notifications.settings.bell')}</SelectItem>
                      <SelectItem value="alert">{t('notifications.settings.alert')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('notifications.settings.notificationFrequency')}</CardTitle>
              <CardDescription>{t('notifications.settings.frequencyDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('notifications.settings.forErrors')}</Label>
                  <Select defaultValue="immediate">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">{t('notifications.settings.immediate')}</SelectItem>
                      <SelectItem value="5min">{t('notifications.settings.every5Minutes')}</SelectItem>
                      <SelectItem value="15min">{t('notifications.settings.every15Minutes')}</SelectItem>
                      <SelectItem value="1hour">{t('notifications.settings.hourly')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('notifications.settings.forWarnings')}</Label>
                  <Select defaultValue="5min">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">{t('notifications.settings.immediate')}</SelectItem>
                      <SelectItem value="5min">{t('notifications.settings.every5Minutes')}</SelectItem>
                      <SelectItem value="15min">{t('notifications.settings.every15Minutes')}</SelectItem>
                      <SelectItem value="1hour">{t('notifications.settings.hourly')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('notifications.settings.forInfo')}</Label>
                  <Select defaultValue="1hour">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">{t('notifications.settings.immediate')}</SelectItem>
                      <SelectItem value="5min">{t('notifications.settings.every5Minutes')}</SelectItem>
                      <SelectItem value="15min">{t('notifications.settings.every15Minutes')}</SelectItem>
                      <SelectItem value="1hour">{t('notifications.settings.hourly')}</SelectItem>
                      <SelectItem value="daily">{t('notifications.settings.daily')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {t('notifications.settings.notificationChannels')}
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('notifications.settings.newChannel')}
                </Button>
              </CardTitle>
              <CardDescription>
                {t('notifications.settings.channelsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {channels.map((channel) => (
                <Card key={channel.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${channel.type === 'email' ? 'bg-blue-100 text-blue-600' :
                          channel.type === 'slack' ? 'bg-purple-100 text-purple-600' :
                            'bg-green-100 text-green-600'
                          }`}>
                          {channel.type === 'email' ? <Mail className="h-4 w-4" /> :
                            channel.type === 'slack' ? <Slack className="h-4 w-4" /> :
                              <Webhook className="h-4 w-4" />}
                        </div>
                        <div>
                          <h4 className="font-medium">{channel.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {channel.type === 'email' ? (channel.config.email || '') :
                              channel.type === 'slack' ? t('notifications.settings.slackChannel') :
                                t('notifications.settings.webhookURL')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={channel.enabled} />
                        <Button variant="ghost" size="icon">
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {t('notifications.settings.notificationRules')}
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('notifications.settings.newRule')}
                </Button>
              </CardTitle>
              <CardDescription>
                {t('notifications.settings.rulesDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationRules.map((rule) => (
                <Card key={rule.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium">{rule.name}</h4>
                        <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                          {rule.enabled ? t('notifications.settings.active') : t('notifications.settings.inactive')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={rule.enabled} />
                        <Button variant="ghost" size="icon">
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {rule.conditions.map((cond, i) => (
                        <span key={i}>
                          {cond.type} {cond.operator} {cond.value}
                          {i < rule.conditions.length - 1 ? ` ${t('notifications.settings.and')} ` : ''}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {rule.actions.map((action, i) => (
                        <Badge key={i} variant="outline">
                          {action.type}: {action.target}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('notifications.settings.notificationTemplates')}</CardTitle>
              <CardDescription>
                {t('notifications.settings.templatesDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('notifications.settings.subjectTemplate')}</Label>
                  <Input
                    placeholder="[LSEM] {{type}}: {{title}}"
                    defaultValue="[LSEM] {{type}}: {{title}}"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('notifications.settings.messageTemplate')}</Label>
                  <Textarea
                    placeholder="{{title}}&#10;{{message}}&#10;&#10;Kaynak: {{source}}&#10;Zaman: {{timestamp}}"
                    defaultValue="{{title}}\n{{message}}\n\nKaynak: {{source}}\nZaman: {{timestamp}}"
                    rows={4}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('notifications.settings.variables')}</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{{ title }}</Badge>
                  <Badge variant="outline">{{ message }}</Badge>
                  <Badge variant="outline">{{ type }}</Badge>
                  <Badge variant="outline">{{ source }}</Badge>
                  <Badge variant="outline">{{ timestamp }}</Badge>
                  <Badge variant="outline">{{ severity }}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}