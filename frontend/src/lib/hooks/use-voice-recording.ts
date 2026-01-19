'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { fetchWithAuth } from '@/lib/auth-fetch';

interface UseVoiceRecordingOptions {
  maxDurationSeconds?: number;
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}): UseVoiceRecordingReturn {
  const {
    maxDurationSeconds = 60,
    onTranscription,
    onError
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  // Cleanup function
  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setRecordingDuration(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      audioChunksRef.current = [];

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      streamRef.current = stream;

      // Create MediaRecorder with WebM/Opus format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);

      // Start duration counter
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingDuration(elapsed);
      }, 1000);

      // Auto-stop at max duration
      maxDurationTimeoutRef.current = setTimeout(() => {
        console.log('[VoiceRecording] Max duration reached, stopping...');
        stopRecording();
      }, maxDurationSeconds * 1000);

      console.log('[VoiceRecording] Recording started');
    } catch (err: any) {
      console.error('[VoiceRecording] Failed to start:', err);
      const errorMessage = err.name === 'NotAllowedError'
        ? 'Mikrofon izni gerekli'
        : err.name === 'NotFoundError'
          ? 'Mikrofon bulunamadi'
          : 'Ses kaydedilemedi';
      setError(errorMessage);
      onError?.(errorMessage);
      cleanup();
    }
  }, [maxDurationSeconds, cleanup, onError]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        setIsRecording(false);
        cleanup();
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        setIsRecording(false);

        // Clear timers
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        if (maxDurationTimeoutRef.current) {
          clearTimeout(maxDurationTimeoutRef.current);
          maxDurationTimeoutRef.current = null;
        }

        // Stop stream tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Check if we have audio data
        if (audioChunksRef.current.length === 0) {
          setError('Ses kaydedilemedi');
          resolve(null);
          return;
        }

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm'
        });

        console.log(`[VoiceRecording] Recording stopped, blob size: ${audioBlob.size} bytes`);

        // Transcribe audio
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          formData.append('language', 'tr');

          const response = await fetchWithAuth(`${apiUrl}/api/whisper/transcribe`, {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            throw new Error('Transcription failed');
          }

          const data = await response.json();
          const transcription = data.text || '';

          console.log(`[VoiceRecording] Transcription: "${transcription}"`);
          onTranscription?.(transcription);
          resolve(transcription);
        } catch (err: any) {
          console.error('[VoiceRecording] Transcription error:', err);
          const errorMessage = 'Ses metne cevrilemedi';
          setError(errorMessage);
          onError?.(errorMessage);
          resolve(null);
        } finally {
          setIsTranscribing(false);
          audioChunksRef.current = [];
          setRecordingDuration(0);
        }
      };

      mediaRecorder.stop();
    });
  }, [apiUrl, cleanup, onTranscription, onError]);

  const cancelRecording = useCallback(() => {
    console.log('[VoiceRecording] Recording cancelled');
    cleanup();
    setIsRecording(false);
    setIsTranscribing(false);
    setError(null);
  }, [cleanup]);

  return {
    isRecording,
    isTranscribing,
    error,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording
  };
}
