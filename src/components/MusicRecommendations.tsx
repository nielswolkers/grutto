import { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { getTopArtists, getUserPlaylists, getArtistTopTracks, playContext } from '@/api/spotifyApi';
import { toast } from '@/hooks/use-toast';
import { getStoredAccessToken, refreshAccessToken } from '@/auth/spotifyAuth';
import { Button } from './ui/button';

interface RecommendationItem {
  id: string;
  name: string;
  image: string;
  subtitle: string;
  type: 'artist' | 'playlist';
  uri: string;
}

interface MusicRecommendationsProps {
  deviceId: string | null;
  onContextChange: (name: string, type: 'artist' | 'playlist') => void;
}

export function MusicRecommendations({ deviceId, onContextChange }: MusicRecommendationsProps) {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // First try to get stored token
        let accessToken = getStoredAccessToken();
        
        // If no valid token, try to refresh
        if (!accessToken) {
          try {
            accessToken = await refreshAccessToken();
          } catch (refreshError) {
            console.log('Could not refresh token, user may not be connected:', refreshError);
            setError('Verbind je Spotify account in Instellingen');
            setLoading(false);
            return;
          }
        }

        if (!accessToken) {
          setError('Geen Spotify verbinding gevonden');
          setLoading(false);
          return;
        }

        // Fetch data in parallel with better error handling
        let topArtists: any[] = [];
        let playlists: any[] = [];
        
        try {
          topArtists = await getTopArtists(accessToken, 3);
        } catch (err: any) {
          console.error('Error fetching top artists:', err);
          // If 401, try refresh once more
          if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
            try {
              accessToken = await refreshAccessToken();
              topArtists = await getTopArtists(accessToken, 3);
            } catch (retryErr) {
              console.error('Retry failed for top artists:', retryErr);
            }
          }
        }

        try {
          playlists = await getUserPlaylists(accessToken, 3);
        } catch (err: any) {
          console.error('Error fetching playlists:', err);
          // If we have a fresh token from the artists retry, use it
          if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
            try {
              if (!accessToken) accessToken = await refreshAccessToken();
              playlists = await getUserPlaylists(accessToken, 3);
            } catch (retryErr) {
              console.error('Retry failed for playlists:', retryErr);
            }
          }
        }

        const combined: RecommendationItem[] = [
          ...topArtists.map(artist => ({
            id: artist.id,
            name: artist.name,
            image: artist.images?.[0]?.url || '',
            subtitle: artist.genres?.[0] || 'Artiest',
            type: 'artist' as const,
            uri: artist.uri,
          })),
          ...playlists.map((playlist: any) => ({
            id: playlist.id,
            name: playlist.name,
            image: playlist.images?.[0]?.url || '',
            subtitle: 'Playlist',
            type: 'playlist' as const,
            uri: playlist.uri,
          }))
        ];

        if (combined.length === 0) {
          setError('Geen aanbevelingen gevonden. Luister eerst naar wat muziek op Spotify!');
        } else {
          setItems(combined.slice(0, 6));
        }
      } catch (error) {
        console.error('Error fetching recommendations:', error);
        setError('Kon aanbevelingen niet laden');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleItemClick = async (item: RecommendationItem) => {
    let accessToken = getStoredAccessToken();
    
    if (!accessToken) {
      try {
        accessToken = await refreshAccessToken();
      } catch {
        toast({
          title: 'Niet ingelogd',
          description: 'Log opnieuw in bij Spotify',
        });
        return;
      }
    }

    if (!deviceId) {
      toast({
        title: 'Speler niet gereed',
        description: 'Wacht tot de speler is geïnitialiseerd',
      });
      return;
    }

    try {
      if (item.type === 'artist') {
        const tracks = await getArtistTopTracks(item.id, accessToken);
        if (tracks.length > 0) {
          const uris = tracks.map(t => t.uri);
          await playContext({ uris }, accessToken, deviceId);
        }
      } else {
        await playContext({ context_uri: item.uri }, accessToken, deviceId);
      }

      onContextChange(item.name, item.type);
    } catch (error) {
      console.error('Error playing:', error);
      toast({
        title: 'Afspelen mislukt',
        description: 'Zorg dat Spotify actief is.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-2xl p-6 border border-border">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Aanbevolen studiemuziek</h3>
            <p className="text-sm text-muted-foreground mt-1">Jouw favoriete nummers</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-muted rounded-2xl mb-3"></div>
              <div className="h-4 bg-muted rounded mb-2"></div>
              <div className="h-3 bg-muted rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || items.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-6 border border-border">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Aanbevolen studiemuziek</h3>
            <p className="text-sm text-muted-foreground mt-1">Jouw favoriete nummers</p>
          </div>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            {error || 'Geen aanbevelingen beschikbaar'}
          </p>
          <Button 
            variant="outline" 
            onClick={() => window.open('https://open.spotify.com', '_blank')}
          >
            Open Spotify
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Aanbevolen studiemuziek</h3>
          <p className="text-sm text-muted-foreground mt-1">Jouw favoriete nummers</p>
        </div>
        <Button 
          variant="outline" 
          className="flex items-center gap-2"
          onClick={() => window.open('https://open.spotify.com', '_blank')}
        >
          <span className="text-sm">Luister op Spotify</span>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="group cursor-pointer"
            onClick={() => handleItemClick(item)}
          >
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-primary/40 shadow-md hover:shadow-xl transition-all duration-300 mb-3">
              {item.image && (
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                <button className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all duration-300">
                  <Play className="w-6 h-6 text-black ml-0.5" fill="black" />
                </button>
              </div>
            </div>
            <h4 className="font-medium text-sm text-foreground truncate">{item.name}</h4>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
