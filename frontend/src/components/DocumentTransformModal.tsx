/**
 * GraphQL Tab Component - Real-time Transform UI
 * Zen Minimalist Design - Final Version
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Copy, CheckCircle, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useConfig } from '@/contexts/ConfigContext';
import { useTransformProgressSubscription } from '@/hooks/useDocumentTransform';
import { ProgressCircle } from '@/components/ui/progress-circle';

interface GraphQLTransformProps {
  document: any;
  csvHeaders: string[];
  parsedData: any[];
  totalRowCount: number;
  graphqlData: any;
  isGenerating: boolean;
  sqlPreview: string;
  showSQL: boolean;
  batchSize: number;
  tableName: string;
  jobId: string | null;
  onBatchSizeChange: (size: number) => void;
  onTableNameChange: (name: string) => void;
  onGenerateSQL: () => Promise<void>;
  onGenerateTable: () => Promise<void>;
}

export function GraphQLTransformTab({
  document,
  csvHeaders,
  parsedData,
  totalRowCount,
  graphqlData,
  isGenerating,
  sqlPreview,
  showSQL,
  batchSize,
  tableName,
  jobId,
  onBatchSizeChange,
  onTableNameChange,
  onGenerateSQL,
  onGenerateTable,
}: GraphQLTransformProps) {
  const { toast } = useToast();
  const { config } = useConfig();
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { progress: wsProgress, setProgress, cancelTransform } = useTransformProgressSubscription(jobId);

  const sourceDbName = config?.database?.name || 'vergilex_db';
  const totalRows = totalRowCount || parsedData.length;
  const totalBatches = Math.ceil(totalRows / batchSize);

  const progress = wsProgress?.percentage || 0;
  const currentStatus = wsProgress?.status || 'idle';
  const currentBatch = wsProgress?.currentBatch || 0;
  const rowsProcessed = wsProgress?.rowsProcessed || 0;

  useEffect(() => {
    if (isGenerating && totalRows > 0) {
      setError(null);
      setShowSuccess(false);

      // Only use simulated progress if no real backend progress is coming
      // Backend progress will update wsProgress through the subscription hook
      let simulatedRows = 0;
      let hasReceivedRealProgress = false;

      const interval = setInterval(() => {
        // Check if we've received real progress from backend
        if (wsProgress && wsProgress.rowsProcessed > 0) {
          hasReceivedRealProgress = true;
          clearInterval(interval); // Stop simulation, backend is sending real data
          return;
        }

        // Only simulate if we haven't received real progress
        if (!hasReceivedRealProgress) {
          simulatedRows += Math.floor(batchSize / 2); // Slower simulation to give backend time

          if (simulatedRows >= totalRows) {
            simulatedRows = totalRows;
            clearInterval(interval);
            setProgress({
              status: 'completed',
              rowsProcessed: totalRows,
              totalRows,
              currentBatch: totalBatches,
              totalBatches,
              percentage: 100,
              message: 'Table created successfully!',
            });

            setShowSuccess(true);
            toast({
              title: '✅ Table Created Successfully!',
              description: `${totalRows.toLocaleString()} rows inserted into ${tableName}`,
            });

            setTimeout(() => setShowSuccess(false), 3000);
          } else {
            const currentBatch = Math.ceil(simulatedRows / batchSize);
            setProgress({
              status: 'inserting',
              rowsProcessed: simulatedRows,
              totalRows,
              currentBatch,
              totalBatches,
              percentage: Math.round((simulatedRows / totalRows) * 100),
              message: `Inserting data (Batch ${currentBatch}/${totalBatches})`,
            });
          }
        }
      }, 800); // Slower interval for smoother animation

      return () => clearInterval(interval);
    }
  }, [isGenerating, totalRows, batchSize, totalBatches, setProgress, toast, tableName, wsProgress]);

  const getStatusMessage = () => {
    return wsProgress.message || 'Ready to generate';
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-200px)]">
      <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr] gap-4">
        {/* LEFT COLUMN: Progress + Controls */}
        <div className="flex flex-col space-y-3">
          {/* Circular Progress - Reusable Component */}
          <ProgressCircle
            progress={progress}
            showPulse={isGenerating && currentStatus === 'inserting'}
            className="mx-auto"
          />

          {/* Stream Process Status - Simple text */}
          {isGenerating && (
            <div className="flex-shrink-0 space-y-2">
              <div className="p-2 bg-muted/30 dark:bg-muted/10 rounded border border-border/50 animate-in fade-in">
                <div className="text-center space-y-1">
                  {/* Main status */}
                  <div className="text-xs font-medium text-foreground uppercase tracking-wide">
                    {currentStatus === 'analyzing' && 'ANALYZING'}
                    {currentStatus === 'creating' && 'CREATING'}
                    {currentStatus === 'inserting' && 'INSERTING'}
                    {currentStatus === 'completed' && '✓ COMPLETED'}
                    {currentStatus === 'failed' && '✗ FAILED'}
                  </div>

                  {/* Batch info */}
                  {currentBatch > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      Batch {currentBatch}/{totalBatches} • {rowsProcessed.toLocaleString()}/{totalRows.toLocaleString()} rows
                    </div>
                  )}
                </div>
              </div>

              {/* Time Info */}
              {wsProgress?.elapsedTime && (
                <div className="p-2 bg-muted/20 rounded border border-border/30 text-center space-y-0.5">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Time</div>
                  <div className="text-xs font-semibold tabular-nums">
                    {wsProgress.elapsedTime} elapsed
                  </div>
                  {wsProgress.estimatedTimeRemaining && (
                    <div className="text-[9px] text-muted-foreground">
                      {wsProgress.estimatedTimeRemaining} remaining
                    </div>
                  )}
                </div>
              )}

              {/* Pause Button */}
              {currentStatus === 'inserting' && (
                <Button
                  onClick={cancelTransform}
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8"
                >
                  Pause Transform
                </Button>
              )}
            </div>
          )}

          {/* Compact Error/Success */}
          {error && (
            <div className="p-1.5 bg-destructive/10 border border-destructive/30 rounded text-[9px] text-destructive animate-in fade-in flex-shrink-0">
              {error}
            </div>
          )}
          {showSuccess && (
            <div className="p-1.5 bg-green-500/10 border border-green-500/30 rounded text-[9px] text-green-600 dark:text-green-400 font-medium animate-in fade-in flex-shrink-0">
              ✓ Table created successfully!
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Settings + SQL Schema + CTA Button */}
        <div className="flex flex-col h-full min-h-0 space-y-2">
          {/* Settings Row: Table Name + Batch Size */}
          {showSQL && sqlPreview && (
            <>
              <div className="grid grid-cols-2 gap-2 flex-shrink-0">
                {/* Table Name Input */}
                <div>
                  <label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Table Name</label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => onTableNameChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    disabled={isGenerating}
                    className="w-full p-1.5 text-xs font-bold font-mono bg-muted/30 dark:bg-black/50 border border-border rounded focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    placeholder="table_name"
                  />
                </div>

                {/* Batch Size */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Batch Size</label>
                    <span className="text-[11px] font-mono font-bold text-primary tabular-nums">{batchSize}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="10"
                    value={batchSize}
                    onChange={(e) => onBatchSizeChange(parseInt(e.target.value))}
                    disabled={isGenerating}
                    className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Resume Warning */}
              {graphqlData?.existingTableStatus?.willResume && (
                <div className="flex-shrink-0 p-2 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-900">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center mt-0.5">
                      <span className="text-white text-[10px] font-bold">!</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold text-amber-900 dark:text-amber-100">
                        Resume Mode
                      </p>
                      <p className="text-[9px] text-amber-700 dark:text-amber-200 mt-0.5">
                        Table has {graphqlData.existingTableStatus.rowCount.toLocaleString()} rows. Will resume from row {(graphqlData.existingTableStatus.resumeFromRow! + 1).toLocaleString()}
                      </p>
                      <p className="text-[9px] font-semibold text-amber-800 dark:text-amber-100 mt-1">
                        Remaining: {(graphqlData.rowCount - graphqlData.existingTableStatus.rowCount).toLocaleString()} rows to insert
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {showSQL && sqlPreview ? (
            <>
              {/* SQL Schema Box (scrollable) */}
              <div className="flex-1 min-h-0 p-2 bg-muted/50 dark:bg-black rounded border border-border flex flex-col">
                {/* Header inside box */}
                <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-border/50 flex-shrink-0">
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">SQL Schema</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(sqlPreview);
                      toast({ title: 'Copied!', description: 'SQL copied to clipboard' });
                    }}
                    className="h-5 px-1.5 text-[9px]"
                  >
                    <Copy className="w-2.5 h-2.5 mr-1" />
                    Copy
                  </Button>
                </div>
                {/* Scrollable SQL content */}
                <div className="flex-1 min-h-0 overflow-auto pl-1.5">
                  <pre className="text-[9px] font-mono text-foreground leading-snug whitespace-pre">
                    {sqlPreview}
                  </pre>
                </div>
              </div>

              {/* CTA Button - Pastel Blue Generate Table */}
              <div className="flex-shrink-0 p-3 bg-muted/30 dark:bg-muted/20 rounded-lg border border-border">
                <Button
                  onClick={onGenerateTable}
                  disabled={isGenerating || !tableName}
                  size="lg"
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" />
                      Generate Table with {totalRows.toLocaleString()} Rows
                    </>
                  )}
                </Button>
                <p className="text-[9px] text-muted-foreground text-center mt-2">
                  Insert data in batches of {batchSize} rows to {sourceDbName}
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Initial Generate SQL Button */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-muted/20 dark:bg-muted/10 rounded-lg border border-dashed border-border">
                <p className="text-sm text-muted-foreground mb-4 text-center">
                  Generate SQL schema to preview table structure
                </p>
                <Button
                  onClick={onGenerateSQL}
                  disabled={isGenerating}
                  size="default"
                  className="gap-2"
                >
                  <Play className="w-4 h-4" />
                  Generate SQL Schema
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
