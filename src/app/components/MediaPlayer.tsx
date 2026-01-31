import { useRef, useState, useCallback } from 'react';

interface MediaPlayerProps {
  src?: string;
  type?: string;
  poster?: string;
}

export function MediaPlayer({ src, type, poster }: MediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(false);

  const isAudio = type?.includes('audio');

  // Play/pause handler - available for custom controls if needed
  const _handlePlay = useCallback(() => {
    const media = isAudio ? audioRef.current : videoRef.current;
    if (!media) return;

    if (isPlaying) {
      media.pause();
    } else {
      media.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, isAudio]);
  void _handlePlay; // Suppress unused warning

  const handleMediaEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleError = useCallback(() => {
    setError(true);
  }, []);

  if (!src) {
    return (
      <div className="media-player media-player-error">
        <p>No preview available</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="media-player media-player-error">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
        <p>Failed to load media</p>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="media-player media-player-audio">
        {poster && (
          <img src={poster} alt="" className="media-player-poster" />
        )}
        <audio
          ref={audioRef}
          src={src}
          controls
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={handleMediaEnded}
          onError={handleError}
        />
      </div>
    );
  }

  return (
    <div className="media-player media-player-video">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleMediaEnded}
        onError={handleError}
      />
    </div>
  );
}
