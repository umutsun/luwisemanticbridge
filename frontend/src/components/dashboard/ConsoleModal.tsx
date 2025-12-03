'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Terminal } from 'lucide-react';
import Console from '@/components/terminal/Console';

interface ConsoleModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConsoleModal({ isOpen, onOpenChange }: ConsoleModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            System Console & Logs
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0">
          <Console
            height={500}
            maxHeight={600}
            showHeader={true}
            showControls={true}
            showFilters={true}
            showBookmarks={true}
            showHistory={true}
            autoScroll={true}
            maxLogs={1000}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
