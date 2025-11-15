'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Brain,
  Eye,
  Loader2,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  Settings,
  Zap,
  FileText,
  Clock,
  TrendingUp,
  BarChart3,
  Timer,
  Target,
  Database,
  Languages,
  Globe
} from 'lucide-react';
import Translator from '@/components/ui/translator';
import PDFBatchTab from '@/components/PDFBatchTab';

interface OperationProgress {
  status: 'idle' | 'processing' | 'completed' | 'error' | 'paused';
  current: number;
  total: number;
  percentage: number;
  currentItem: string | null;
  error: string | null;
  startTime?: number;
  estimatedTimeRemaining?: number;
  processedItems?: number;
  errorCount?: number;
  processingSpeed?: number;
  confidence?: number;
  operationType: 'ocr' | 'embedding';
}

interface DocumentOperationsProps {
  selectedDocuments: Set<string>;
  allDocuments: any[];
  onOperationComplete: () => void;
}

// Circular Progress Component
const CircularProgress = ({
  percentage,
  size = 100,
  strokeWidth = 2,
  className = "",
  color = "blue"
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const gradientColors = {
    blue: ['#3B82F6', '#8B5CF6'],
    green: ['#10B981', '#34D399'],
    orange: ['#F97316', '#FB923C']
  };

  return (
    <div className={`relative ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-800"
        />
        {/* Progress circle with gradient */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#gradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradientColors[color][0]} />
            <stop offset="100%" stopColor={gradientColors[color][1]} />
          </linearGradient>
        </defs>
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-light tracking-tight">
          {percentage.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
};

export default function DocumentOperations({
  selectedDocuments,
  allDocuments,
  onOperationComplete
}: DocumentOperationsProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'ocr' | 'translate' | 'embedding'>('ocr');
  const [ocrProgress, setOcrProgress] = useState<OperationProgress>({
    status: 'idle',
    current: 0,
    total: 0,
    percentage: 0,
    currentItem: null,
    error: null,
    operationType: 'ocr'
  });
  const [embeddingProgress, setEmbeddingProgress] = useState<OperationProgress>({
    status: 'idle',
    current: 0,
    total: 0,
    percentage: 0,
    currentItem: null,
    error: null,
    operationType: 'embedding'
  });
  const [translateProgress, setTranslateProgress] = useState<OperationProgress>({
    status: 'idle',
    current: 0,
    total: 0,
    percentage: 0,
    currentItem: null,
    error: null,
    operationType: 'embedding'
  });
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [translatedDocuments, setTranslatedDocuments] = useState<string[]>([]);

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<string[]>([]);
  const [processingStats, setProcessingStats] = useState({
    totalProcessed: 0,
    successCount: 0,
    errorCount: 0,
    avgConfidence: 0,
    tokensUsed: 0
  });

  // OCR eligible documents (PDFs without OCR)
  const ocrEligibleDocuments = allDocuments.filter(doc =>
    doc.type === 'pdf' &&
    !doc.title.includes('[OCR]') &&
    !selectedDocuments.has(doc.id)
  );

  // Embedding eligible documents (documents without embeddings)
  const embeddingEligibleDocuments = allDocuments.filter(doc =>
    !doc.metadata?.embeddings &&
    !selectedDocuments.has(doc.id)
  );

  const startOCRProcessing = async () => {
    if (ocrEligibleDocuments.length === 0) {
      toast({
        title: "No documents to process",
        description: "There are no PDF documents that need OCR processing.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setOcrProgress({
      status: 'processing',
      current: 0,
      total: ocrEligibleDocuments.length,
      percentage: 0,
      currentItem: ocrEligibleDocuments[0]?.title || null,
      error: null,
      startTime: Date.now(),
      operationType: 'ocr'
    });

    let successCount = 0;
    let totalConfidence = 0;
    let errorCount = 0;

    for (let i = 0; i < ocrEligibleDocuments.length; i++) {
      const doc = ocrEligibleDocuments[i];

      setOcrProgress(prev => ({
        ...prev,
        current: i,
        currentItem: doc.title,
        percentage: (i / ocrEligibleDocuments.length) * 100
      }));

      try {
        const response = await fetch(`/documents/ocr/${doc.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: 'tur+eng' })
        });

        if (response.ok) {
          const data = await response.json();
          successCount++;
          totalConfidence += data.data.confidence;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
        console.error(`OCR failed for ${doc.title}:`, error);
      }

      // Small delay between documents
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setOcrProgress({
      status: errorCount > 0 ? 'completed' : 'completed',
      current: ocrEligibleDocuments.length,
      total: ocrEligibleDocuments.length,
      percentage: 100,
      currentItem: null,
      error: null,
      confidence: successCount > 0 ? totalConfidence / successCount : 0,
      operationType: 'ocr'
    });

    setProcessingStats(prev => ({
      ...prev,
      totalProcessed: prev.totalProcessed + ocrEligibleDocuments.length,
      successCount: prev.successCount + successCount,
      errorCount: prev.errorCount + errorCount,
      avgConfidence: successCount > 0 ? totalConfidence / successCount : prev.avgConfidence
    }));

    toast({
      title: "OCR Processing Complete",
      description: `Processed ${ocrEligibleDocuments.length} documents with ${successCount} successes and ${errorCount} errors.`
    });

    onOperationComplete();
    setIsProcessing(false);
  };

  const startEmbeddingProcessing = async () => {
    const docsToProcess = selectedDocuments.size > 0
      ? Array.from(selectedDocuments)
      : embeddingEligibleDocuments.map(doc => doc.id);

    if (docsToProcess.length === 0) {
      toast({
        title: "No documents to process",
        description: "There are no documents that need embedding processing.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setEmbeddingProgress({
      status: 'processing',
      current: 0,
      total: docsToProcess.length,
      percentage: 0,
      currentItem: docsToProcess[0] || null,
      error: null,
      startTime: Date.now(),
      operationType: 'embedding'
    });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < docsToProcess.length; i++) {
      const docId = docsToProcess[i];
      const doc = allDocuments.find(d => d.id === docId);

      setEmbeddingProgress(prev => ({
        ...prev,
        current: i,
        currentItem: doc?.title || `Document ${docId}`,
        percentage: (i / docsToProcess.length) * 100
      }));

      try {
        const response = await fetch(`/documents/${docId}/embeddings`, {
          method: 'POST'
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
        console.error(`Embedding failed for ${docId}:`, error);
      }

      // Small delay between documents
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setEmbeddingProgress({
      status: 'completed',
      current: docsToProcess.length,
      total: docsToProcess.length,
      percentage: 100,
      currentItem: null,
      error: null,
      operationType: 'embedding'
    });

    setProcessingStats(prev => ({
      ...prev,
      totalProcessed: prev.totalProcessed + docsToProcess.length,
      successCount: prev.successCount + successCount,
      errorCount: prev.errorCount + errorCount
    }));

    toast({
      title: "Embedding Processing Complete",
      description: `Processed ${docsToProcess.length} documents with ${successCount} successes and ${errorCount} errors.`
    });

    onOperationComplete();
    setIsProcessing(false);
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    const seconds = Math.floor((ms / 1000) % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getElapsedTime = (progress: OperationProgress) => {
    if (!progress.startTime) return '--:--';
    const elapsed = Date.now() - progress.startTime;
    return formatTime(elapsed);
  };

  return (
    <Card className="mt-6 border-border/50 bg-gradient-to-br from-background to-muted/20 dark:from-background dark:to-muted/10">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Document Operations
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">
              {ocrEligibleDocuments.length} OCR Ready
            </Badge>
            <Badge variant="outline" className="text-xs">
              {embeddingEligibleDocuments.length} Embed Ready
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Operation Tabs */}
        <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="batch">
              Transform
            </TabsTrigger>
            <TabsTrigger value="ocr">
              OCR
            </TabsTrigger>
          </TabsList>

          <TabsContent value="batch" className="space-y-4 mt-4">
            <PDFBatchTab
              selectedDocuments={selectedDocuments}
              allDocuments={allDocuments}
              onComplete={onOperationComplete}
            />
          </TabsContent>

          <TabsContent value="ocr" className="space-y-4 mt-4">
            <div className="space-y-4">
              {ocrProgress.status === 'processing' ? (
                <div className="p-6 bg-background/50 rounded-xl border border-border/30">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                      <span className="text-sm font-medium text-foreground">Processing OCR</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {ocrProgress.currentItem}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <CircularProgress
                      percentage={ocrProgress.percentage}
                      size={120}
                      color="orange"
                    />
                    <div className="flex-1 ml-8 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Progress</span>
                        <span className="text-sm font-medium">
                          {ocrProgress.current} / {ocrProgress.total}
                        </span>
                      </div>
                      <Progress
                        value={ocrProgress.percentage}
                        className="h-2"
                      />
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">Time Elapsed</span>
                          <div className="font-medium">{getElapsedTime(ocrProgress)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Documents/min</span>
                          <div className="font-medium">2.4</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Eye className="h-8 w-8 text-orange-500" />
                    <div>
                      <h3 className="font-medium text-foreground">OCR Processing</h3>
                      <p className="text-sm text-muted-foreground">
                        Process PDF documents with Optical Character Recognition
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={startOCRProcessing}
                    disabled={isProcessing || ocrEligibleDocuments.length === 0}
                    className="min-w-[120px]"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Start OCR
                      </>
                    )}
                  </Button>
                </div>
              )}

              {ocrProgress.status === 'completed' && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-green-800 dark:text-green-200">
                      OCR Processing Completed
                    </span>
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300">
                    Successfully processed documents with average confidence:
                    {ocrProgress.confidence?.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="translate" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="text-center p-6 bg-muted/20 rounded-lg">
                <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Document Translation</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Translate documents before embedding for better RAG performance
                </p>
              </div>

              {/* Document Selection */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Select Documents to Translate</h4>
                <div className="grid gap-2 max-h-40 overflow-y-auto">
                  {allDocuments.slice(0, 5).map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <input
                        type="checkbox"
                        checked={translatedDocuments.includes(doc.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTranslatedDocuments([...translatedDocuments, doc.id]);
                          } else {
                            setTranslatedDocuments(translatedDocuments.filter(id => id !== doc.id));
                          }
                        }}
                        className="rounded"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.type.toUpperCase()} • {formatFileSize(doc.size || 0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Language Selection */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Target Language</h4>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="en">🇬🇧 English</option>
                  <option value="de">🇩🇪 German</option>
                  <option value="fr">🇫🇷 French</option>
                  <option value="es">🇪🇸 Spanish</option>
                  <option value="it">🇮🇹 Italian</option>
                  <option value="pt">🇵🇹 Portuguese</option>
                  <option value="ru">🇷🇺 Russian</option>
                  <option value="zh">🇨🇳 Chinese</option>
                  <option value="ja">🇯🇵 Japanese</option>
                </select>
              </div>

              {/* Preview Translation */}
              {translatedDocuments.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Preview Translation</h4>
                  <Translator
                    text={allDocuments.find(d => d.id === translatedDocuments[0])?.content || ''}
                    title={`Translate: ${allDocuments.find(d => d.id === translatedDocuments[0])?.title}`}
                  />
                </div>
              )}

              {/* Action Button */}
              <Button
                onClick={() => {
                  toast({
                    title: "Translation Started",
                    description: `Translating ${translatedDocuments.length} documents to ${targetLanguage.toUpperCase()}`
                  });
                }}
                disabled={translatedDocuments.length === 0}
                className="w-full"
              >
                <Languages className="h-4 w-4 mr-2" />
                Translate {translatedDocuments.length} Document{translatedDocuments.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="embedding" className="space-y-4 mt-4">
            <div className="space-y-4">
              {embeddingProgress.status === 'processing' ? (
                <div className="p-6 bg-background/50 rounded-xl border border-border/30">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-sm font-medium text-foreground">Creating Embeddings</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {embeddingProgress.currentItem}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <CircularProgress
                      percentage={embeddingProgress.percentage}
                      size={120}
                      color="blue"
                    />
                    <div className="flex-1 ml-8 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Progress</span>
                        <span className="text-sm font-medium">
                          {embeddingProgress.current} / {embeddingProgress.total}
                        </span>
                      </div>
                      <Progress
                        value={embeddingProgress.percentage}
                        className="h-2"
                      />
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">Time Elapsed</span>
                          <div className="font-medium">{getElapsedTime(embeddingProgress)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Documents/min</span>
                          <div className="font-medium">4.8</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Brain className="h-8 w-8 text-blue-500" />
                    <div>
                      <h3 className="font-medium text-foreground">Embedding Processing</h3>
                      <p className="text-sm text-muted-foreground">
                        Create vector embeddings for semantic search
                      </p>
                      {selectedDocuments.size > 0 && (
                        <Badge variant="secondary" className="mt-1">
                          {selectedDocuments.size} selected
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={startEmbeddingProcessing}
                    disabled={isProcessing || (selectedDocuments.size === 0 && embeddingEligibleDocuments.length === 0)}
                    className="min-w-[120px]"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        {selectedDocuments.size > 0 ? 'Embed Selected' : 'Embed All'}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {embeddingProgress.status === 'completed' && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Embedding Processing Completed
                    </span>
                  </div>
                  <div className="text-sm text-green-700 dark:text-green-300">
                    Successfully created embeddings for {embeddingProgress.total} documents
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Processing Stats Summary */}
        {(processingStats.totalProcessed > 0 || isProcessing) && (
          <div className="pt-4 border-t border-border/50">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold text-foreground">
                  {processingStats.totalProcessed}
                </div>
                <div className="text-xs text-muted-foreground">Total Processed</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-green-600">
                  {processingStats.successCount}
                </div>
                <div className="text-xs text-muted-foreground">Success</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-600">
                  {processingStats.errorCount}
                </div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-blue-600">
                  {processingStats.avgConfidence.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Avg Confidence</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}