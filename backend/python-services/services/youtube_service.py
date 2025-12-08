"""
YouTube Service
Download audio and subtitles from YouTube videos for transcription
"""

import os
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from loguru import logger

try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    YT_DLP_AVAILABLE = False
    logger.warning("yt-dlp not available. Install with: pip install yt-dlp")


class YouTubeService:
    """Service for downloading YouTube audio and extracting subtitles"""

    def __init__(self):
        """Initialize YouTube service"""
        if not YT_DLP_AVAILABLE:
            raise RuntimeError("yt-dlp package not installed. Install with: pip install yt-dlp")

    async def get_video_info(self, url: str) -> Dict[str, Any]:
        """
        Extract video metadata without downloading

        Args:
            url: YouTube video URL

        Returns:
            Dict with video information
        """
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

                return {
                    "success": True,
                    "title": info.get('title', 'Unknown'),
                    "duration": info.get('duration', 0),
                    "author": info.get('uploader', 'Unknown'),
                    "description": info.get('description', ''),
                    "view_count": info.get('view_count', 0),
                    "upload_date": info.get('upload_date', ''),
                    "thumbnail": info.get('thumbnail', ''),
                }

        except Exception as e:
            logger.error(f"Failed to get video info: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def get_subtitles(self, url: str, language: str = 'tr') -> Optional[str]:
        """
        Try to get existing subtitles (much faster than transcription)

        Args:
            url: YouTube video URL
            language: Preferred subtitle language (tr, en, etc.)

        Returns:
            Subtitle text if available, None otherwise
        """
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'writesubtitles': True,
                'writeautomaticsub': True,
                'subtitleslangs': [language, 'en'],  # Fallback to English
                'skip_download': True,
                'subtitlesformat': 'vtt',
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

                # Check for manual subtitles first
                if 'subtitles' in info and language in info['subtitles']:
                    subtitle_url = info['subtitles'][language][0]['url']
                    logger.info(f"Found manual subtitles for {language}")
                    # Download and parse subtitle
                    return await self._download_subtitle(subtitle_url)

                # Check for automatic subtitles
                if 'automatic_captions' in info and language in info['automatic_captions']:
                    subtitle_url = info['automatic_captions'][language][0]['url']
                    logger.info(f"Found automatic subtitles for {language}")
                    return await self._download_subtitle(subtitle_url)

                logger.info(f"No subtitles found for language: {language}")
                return None

        except Exception as e:
            logger.error(f"Failed to get subtitles: {e}")
            return None

    async def _download_subtitle(self, url: str) -> str:
        """Download and parse subtitle file"""
        import aiohttp
        import re

        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                content = await response.text()

                # Remove VTT timing and formatting
                text = re.sub(r'WEBVTT\n\n', '', content)
                text = re.sub(r'\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}', '', text)
                text = re.sub(r'<[^>]+>', '', text)  # Remove HTML tags
                text = re.sub(r'\n\n+', '\n', text)  # Remove extra newlines

                return text.strip()

    async def download_audio(
        self,
        url: str,
        format_preference: str = 'mp3'
    ) -> Tuple[Optional[bytes], Dict[str, Any]]:
        """
        Download audio from YouTube video

        Args:
            url: YouTube video URL
            format_preference: Preferred audio format (mp3, wav, m4a)

        Returns:
            Tuple of (audio_bytes, video_info)
        """
        temp_dir = None
        try:
            # Create temporary directory
            temp_dir = tempfile.mkdtemp()

            # yt-dlp configuration
            ydl_opts = {
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': format_preference,
                    'preferredquality': '192',
                }],
                'outtmpl': os.path.join(temp_dir, '%(id)s.%(ext)s'),
                'quiet': True,
                'no_warnings': True,
            }

            logger.info(f"Downloading audio from: {url}")

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Download and get info
                info = ydl.extract_info(url, download=True)

                # Find downloaded file
                video_id = info.get('id', 'video')
                audio_file = os.path.join(temp_dir, f"{video_id}.{format_preference}")

                if not os.path.exists(audio_file):
                    raise FileNotFoundError(f"Downloaded audio file not found: {audio_file}")

                # Read audio file
                with open(audio_file, 'rb') as f:
                    audio_data = f.read()

                logger.info(f"Audio downloaded successfully: {len(audio_data)} bytes")

                # Extract video info
                video_info = {
                    "title": info.get('title', 'Unknown'),
                    "duration": info.get('duration', 0),
                    "author": info.get('uploader', 'Unknown'),
                    "description": info.get('description', ''),
                    "view_count": info.get('view_count', 0),
                    "upload_date": info.get('upload_date', ''),
                }

                return audio_data, video_info

        except Exception as e:
            logger.error(f"Failed to download audio: {e}")
            return None, {"error": str(e)}

        finally:
            # Cleanup temporary files
            if temp_dir and os.path.exists(temp_dir):
                import shutil
                try:
                    shutil.rmtree(temp_dir)
                except Exception as e:
                    logger.warning(f"Failed to cleanup temp dir: {e}")

    async def download_with_fallback_to_subtitles(
        self,
        url: str,
        language: str = 'tr',
        prefer_subtitles: bool = True
    ) -> Dict[str, Any]:
        """
        Smart download: try subtitles first (faster), fallback to audio transcription

        Args:
            url: YouTube video URL
            language: Preferred language
            prefer_subtitles: If True, try to get subtitles before downloading audio

        Returns:
            Dict with text and metadata
        """
        try:
            # Get video info first
            video_info_result = await self.get_video_info(url)
            if not video_info_result.get("success"):
                return video_info_result

            video_info = video_info_result

            # Try to get subtitles if preferred
            if prefer_subtitles:
                logger.info("Attempting to get subtitles...")
                subtitles = await self.get_subtitles(url, language)

                if subtitles:
                    logger.info(f"✅ Got subtitles ({len(subtitles)} chars), skipping audio download")
                    return {
                        "success": True,
                        "text": subtitles,
                        "method": "subtitles",
                        "video_info": video_info,
                        "language": language,
                    }
                else:
                    logger.info("No subtitles found, will need audio transcription")

            # Download audio for transcription
            logger.info("Downloading audio for transcription...")
            audio_data, download_info = await self.download_audio(url)

            if audio_data is None:
                return {
                    "success": False,
                    "error": download_info.get("error", "Failed to download audio"),
                    "video_info": video_info
                }

            return {
                "success": True,
                "audio_data": audio_data,
                "method": "audio_transcription",
                "video_info": video_info,
                "requires_transcription": True,
            }

        except Exception as e:
            logger.error(f"YouTube download failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }


# Global instance (lazy loaded)
_youtube_service: Optional[YouTubeService] = None


def get_youtube_service() -> YouTubeService:
    """
    Get or create YouTube service instance

    Returns:
        YouTubeService instance
    """
    global _youtube_service
    if _youtube_service is None:
        _youtube_service = YouTubeService()
    return _youtube_service
