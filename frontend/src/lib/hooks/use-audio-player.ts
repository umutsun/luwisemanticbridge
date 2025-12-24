'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { fetchWithAuth } from '@/lib/auth-fetch';

interface UseAudioPlayerOptions {
  voice?: string;
  speed?: number;
  onError?: (error: string) => void;
}

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  play: (text: string) => Promise<void>;
  pause: () => void;
  stop: () => void;
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}): UseAudioPlayerReturn {
  const { voice, speed, onError } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const play = useCallback(async (text: string) => {
    try {
      setError(null);
      setIsLoading(true);

      // Stop any existing playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      // Abort any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      console.log('[AudioPlayer] Requesting TTS for', text.length, 'chars');

      // Request audio from TTS service
      const response = await fetchWithAuth(`${apiUrl}/api/v2/tts/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          voice,
          speed
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'TTS request failed');
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      console.log('[AudioPlayer] Received audio:', audioBlob.size, 'bytes');

      // Create and play audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsPlaying(true);
        setIsLoading(false);
      };

      audio.onpause = () => {
        setIsPlaying(false);
      };

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        const errorMessage = 'Ses oynatma hatasi';
        setError(errorMessage);
        setIsPlaying(false);
        setIsLoading(false);
        onError?.(errorMessage);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();

    } catch (err: any) {
      console.error('[AudioPlayer] Error:', err);

      if (err.name === 'AbortError') {
        // Request was cancelled, not an error
        return;
      }

      const errorMessage = err.message || 'Ses uretilemedi';
      setError(errorMessage);
      setIsLoading(false);
      onError?.(errorMessage);
    }
  }, [apiUrl, voice, speed, onError]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  return {
    isPlaying,
    isLoading,
    error,
    play,
    pause,
    stop
  };
}
