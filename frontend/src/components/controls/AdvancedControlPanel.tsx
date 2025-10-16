'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Square,
  Save,
  Upload,
  Download,
  Settings,
  Zap,
  Database,
  Globe
} from 'lucide-react';

interface ControlSettings {
  batchSize: number;
  workerCount: number;
  provider: 'openai' | 'google' | 'local';
  similarityThreshold: number;
  maxTokens: number;
  autoRetry: boolean;
  concurrentTables: number;
}

interface AdvancedControlPanelProps {
  settings: ControlSettings;
  onSettingsChange: (settings: ControlSettings) => void;
  isProcessing: boolean;
  isPaused: boolean;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onSavePreset: () => void;
  onLoadPreset: () => void;
  onExportProgress: () => void;
  processingSpeed?: number;
  eta?: string;
}

export function AdvancedControlPanel({
  settings,
  onSettingsChange,
  isProcessing,
  isPaused,
  onStart,
  onPause,
  onStop,
  onSavePreset,
  onLoadPreset,
  onExportProgress,
  processingSpeed,
  eta
}: AdvancedControlPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSettingChange = (key: keyof ControlSettings, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-4">
      {/* Main Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Embedding Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {!isProcessing ? (
              <Button onClick={onStart} className="w-full" size="lg">
                <Play className="w-4 h-4 mr-2" />
                Start Processing
              </Button>
            ) : (
              <>
                {isPaused ? (
                  <Button onClick={onStart} className="w-full" variant="default">
                    <Play className="w-4 h-4 mr-2" />
                    Resume
                  </Button>
                ) : (
                  <Button onClick={onPause} className="w-full" variant="outline">
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                )}
                <Button onClick={onStop} className="w-full" variant="destructive">
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </>
            )}
          </div>

          {/* Basic Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Batch Size</Label>
              <div className="px-3 py-2 bg-muted rounded">
                <span className="text-sm font-medium">{settings.batchSize}</span>
              </div>
              <Slider
                value={[settings.batchSize]}
                onValueChange={([value]) => handleSettingChange('batchSize', value)}
                min={10}
                max={500}
                step={10}
                disabled={isProcessing}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label>Worker Count</Label>
              <div className="px-3 py-2 bg-muted rounded">
                <span className="text-sm font-medium">{settings.workerCount}</span>
              </div>
              <Slider
                value={[settings.workerCount]}
                onValueChange={([value]) => handleSettingChange('workerCount', value)}
                min={1}
                max={8}
                step={1}
                disabled={isProcessing}
                className="w-full"
              />
            </div>
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>Embedding Provider</Label>
            <Select
              value={settings.provider}
              onValueChange={(value: 'openai' | 'google' | 'local') =>
                handleSettingChange('provider', value)
              }
              disabled={isProcessing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    OpenAI
                  </div>
                </SelectItem>
                <SelectItem value="google">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Google AI
                  </div>
                </SelectItem>
                <SelectItem value="local">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Local Model
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Display */}
          {(isProcessing || isPaused) && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {processingSpeed || 0}
                </div>
                <div className="text-xs text-muted-foreground">Records/min</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {eta || '--'}
                </div>
                <div className="text-xs text-muted-foreground">ETA</div>
              </div>
            </div>
          )}

          {/* Advanced Toggle */}
          <div className="flex items-center justify-between">
            <Label>Advanced Settings</Label>
            <Switch
              checked={showAdvanced}
              onCheckedChange={setShowAdvanced}
            />
          </div>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Similarity Threshold</Label>
                <div className="px-3 py-2 bg-muted rounded">
                  <span className="text-sm font-medium">{settings.similarityThreshold.toFixed(2)}</span>
                </div>
                <Slider
                  value={[settings.similarityThreshold]}
                  onValueChange={([value]) => handleSettingChange('similarityThreshold', value)}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={isProcessing}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>Max Tokens</Label>
                <Input
                  type="number"
                  value={settings.maxTokens}
                  onChange={(e) => handleSettingChange('maxTokens', parseInt(e.target.value))}
                  disabled={isProcessing}
                  min={100}
                  max={8000}
                />
              </div>

              <div className="space-y-2">
                <Label>Concurrent Tables</Label>
                <Input
                  type="number"
                  value={settings.concurrentTables}
                  onChange={(e) => handleSettingChange('concurrentTables', parseInt(e.target.value))}
                  disabled={isProcessing}
                  min={1}
                  max={10}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Auto Retry on Error</Label>
                <Switch
                  checked={settings.autoRetry}
                  onCheckedChange={(checked) => handleSettingChange('autoRetry', checked)}
                  disabled={isProcessing}
                />
              </div>
            </div>
          )}

          {/* Preset Controls */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={onSavePreset}
              className="text-xs"
            >
              <Save className="w-3 h-3 mr-1" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onLoadPreset}
              className="text-xs"
            >
              <Upload className="w-3 h-3 mr-1" />
              Load
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onExportProgress}
              className="text-xs"
            >
              <Download className="w-3 h-3 mr-1" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}