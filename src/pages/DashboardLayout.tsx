import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer';
import { getStoredAccessToken } from '@/auth/spotifyAuth';
import { PlaybackBar } from '@/components/PlaybackBar';
import { NowPlayingExpanded } from '@/components/NowPlayingExpanded';

interface ContextInfo {
  name: string;
  type: 'artist' | 'playlist';
}

export default function DashboardLayout() {
  const location = useLocation();
  const accessToken = getStoredAccessToken();
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentContext, setCurrentContext] = useState<ContextInfo | null>(null);

  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    volume,
    shuffleEnabled,
    repeatMode,
    deviceId,
    togglePlay,
    nextTrack,
    previousTrack,
    toggleShuffle,
    toggleRepeat,
    setVolume: setPlayerVolume,
    seek,
  } = useSpotifyPlayer(accessToken);

  // Hide playbar on account, meldingen, and bestanden pages
  const hiddenPlaybarRoutes = ['/account', '/meldingen', '/materialen'];
  const shouldShowPlaybar = currentTrack && !hiddenPlaybarRoutes.some(route => 
    location.pathname === route || location.pathname.startsWith(route + '/')
  );

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-8">
        <Outlet context={{ deviceId, setCurrentContext }} />
      </main>

      {/* Playback Bar */}
      {shouldShowPlaybar && !isExpanded && (
        <PlaybackBar
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          position={position}
          duration={duration}
          onTogglePlay={togglePlay}
          onNext={nextTrack}
          onPrevious={previousTrack}
          onSeek={seek}
          onExpand={() => setIsExpanded(true)}
        />
      )}

      {/* Expanded Now Playing */}
      {currentTrack && isExpanded && (
        <NowPlayingExpanded
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          position={position}
          duration={duration}
          volume={volume}
          shuffleEnabled={shuffleEnabled}
          repeatMode={repeatMode}
          contextInfo={currentContext}
          onTogglePlay={togglePlay}
          onNext={nextTrack}
          onPrevious={previousTrack}
          onSeek={seek}
          onVolumeChange={setPlayerVolume}
          onToggleShuffle={toggleShuffle}
          onToggleRepeat={toggleRepeat}
          onCollapse={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
}
