import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { User, Mail, LogOut, Trash2, Camera, Clock, Image, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useGruttoPlus } from "@/contexts/GruttoPlusContext";
import { getStoredAccessToken, logout as spotifyLogout, refreshAccessToken, redirectToSpotifyAuth } from "@/auth/spotifyAuth";
import { getUserProfile } from "@/api/spotifyApi";
import CalendarIntegrations from "@/components/account/CalendarIntegrations";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";

interface ProfileData {
  full_name: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  banner_url: string | null;
  study_goal_minutes: number;
}

const Account = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { enabled: plusEnabled, loading: plusLoading, setEnabled: setPlusEnabled } = useGruttoPlus();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [formData, setFormData] = useState({ full_name: "", username: "", bio: "" });
  
  // Profile picture & banner
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  
  // Study goal
  const [studyGoalHours, setStudyGoalHours] = useState(2);
  const [savingGoal, setSavingGoal] = useState(false);
  
  // Spotify state
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyUser, setSpotifyUser] = useState<any>(null);

  useEffect(() => {
    if (user) {
      loadProfile();
      checkSpotifyConnection();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, username, display_name, avatar_url, bio, banner_url, study_goal_minutes')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      setProfile(data);
      setFormData({ 
        full_name: data.full_name || "", 
        username: data.username || "",
        bio: data.bio || ""
      });
      setStudyGoalHours(Math.round((data.study_goal_minutes || 120) / 60 * 10) / 10);
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkSpotifyConnection = async () => {
    if (!user) return;
    
    let token = getStoredAccessToken();
    
    if (token) {
      try {
        const spotifyProfile = await getUserProfile(token);
        setSpotifyUser(spotifyProfile);
        setSpotifyConnected(true);
        return;
      } catch (error) {
        console.error('Failed to fetch Spotify profile:', error);
      }
    }

    const { data: spotifyConnection } = await supabase
      .from('spotify_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (spotifyConnection?.spotify_refresh_token) {
      try {
        localStorage.setItem('refresh_token', spotifyConnection.spotify_refresh_token);
        const newToken = await refreshAccessToken();
        
        if (newToken) {
          const spotifyProfile = await getUserProfile(newToken);
          setSpotifyUser(spotifyProfile);
          setSpotifyConnected(true);
          
          await supabase
            .from('spotify_connections')
            .update({ spotify_token: newToken, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
        }
      } catch (refreshError) {
        console.error('Failed to refresh token:', refreshError);
        setSpotifyUser({
          display_name: spotifyConnection.spotify_display_name,
          email: spotifyConnection.spotify_email,
        });
        setSpotifyConnected(false);
      }
    }
  };

  const handleSave = async () => {
    if (!user || !formData.username.trim() || !formData.full_name.trim()) {
      toast.error("Vul alle verplichte velden in");
      return;
    }

    setSaving(true);
    try {
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('username', formData.username)
        .neq('user_id', user.id)
        .maybeSingle();
        
      if (existingUser) {
        toast.error("Deze gebruikersnaam is al in gebruik");
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('profiles').update({
        full_name: formData.full_name.trim(),
        username: formData.username.trim(),
        bio: formData.bio.trim() || null,
      }).eq('user_id', user.id);

      if (error) throw error;
      toast.success("Profiel bijgewerkt");
      setIsEditing(false);
      loadProfile();
    } catch (error) {
      toast.error("Kon profiel niet bijwerken");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Alleen afbeeldingen zijn toegestaan");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Afbeelding mag maximaal 5MB zijn");
      return;
    }

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatars/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('user-files')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      toast.success("Profielfoto bijgewerkt");
      loadProfile();
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast.error("Kon profielfoto niet uploaden");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Alleen afbeeldingen zijn toegestaan");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Afbeelding mag maximaal 10MB zijn");
      return;
    }

    setUploadingBanner(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/banners/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('user-files')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ banner_url: urlData.publicUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      toast.success("Banner bijgewerkt");
      loadProfile();
    } catch (error) {
      console.error("Banner upload error:", error);
      toast.error("Kon banner niet uploaden");
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleStudyGoalChange = async (value: number[]) => {
    setStudyGoalHours(value[0]);
  };

  const saveStudyGoal = async () => {
    if (!user) return;
    setSavingGoal(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ study_goal_minutes: Math.round(studyGoalHours * 60) })
        .eq('user_id', user.id);

      if (error) throw error;
      toast.success("Studiedoel opgeslagen");
    } catch (error) {
      toast.error("Kon studiedoel niet opslaan");
    } finally {
      setSavingGoal(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleSpotifyDisconnect = async () => {
    if (!user) return;
    await supabase.from('spotify_connections').delete().eq('user_id', user.id);
    spotifyLogout();
    setSpotifyConnected(false);
    setSpotifyUser(null);
    toast.success("Spotify ontkoppeld");
  };

  const handleSpotifyConnect = async () => {
    try {
      await redirectToSpotifyAuth();
    } catch (error) {
      console.error('Failed to redirect to Spotify:', error);
      toast.error('Kon niet verbinden met Spotify');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const { data: userFiles } = await supabase.from('files').select('storage_url').eq('owner_id', user.id);
      if (userFiles && userFiles.length > 0) {
        await supabase.storage.from('user-files').remove(userFiles.map(f => f.storage_url));
        await supabase.from('files').delete().eq('owner_id', user.id);
      }

      await supabase.from('folders').delete().eq('owner_id', user.id);
      await supabase.from('notifications').delete().eq('recipient_id', user.id);
      await supabase.from('file_shares').delete().eq('shared_by_user_id', user.id);
      await supabase.from('spotify_connections').delete().eq('user_id', user.id);
      await supabase.from('profiles').delete().eq('user_id', user.id);

      await signOut();
      toast.success("Account verwijderd");
      navigate("/auth");
    } catch (error) {
      console.error("Delete account error:", error);
      toast.error("Kon account niet verwijderen");
    } finally {
      setDeleting(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="w-full space-y-6">
      <h1 className="text-4xl font-bold text-foreground">Account</h1>

      {/* Profile Card with Banner */}
      <Card className="rounded-2xl border-border overflow-hidden">
        {/* Banner */}
        <div className="relative h-32 bg-gradient-to-br from-primary/20 to-primary/5">
          {profile?.banner_url && (
            <img
              src={profile.banner_url}
              alt="Banner"
              className="w-full h-full object-cover"
            />
          )}
          <button
            onClick={() => bannerInputRef.current?.click()}
            disabled={uploadingBanner}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
          >
            {uploadingBanner ? (
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              <Image className="w-5 h-5 text-foreground" />
            )}
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            onChange={handleBannerUpload}
            className="hidden"
          />
        </div>

        <CardContent className="pt-0">
          {/* Avatar with upload - overlapping banner */}
          <div className="flex items-end gap-4 -mt-12 mb-6">
            <div className="relative">
              <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
                {profile?.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt="Profielfoto" />
                ) : null}
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {profile?.full_name ? getInitials(profile.full_name) : <User className="w-8 h-8" />}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                {uploadingAvatar ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div className="pb-2">
              <p className="font-medium text-lg">{profile?.full_name}</p>
              <p className="text-sm text-muted-foreground">@{profile?.username}</p>
            </div>
          </div>

          {!isEditing ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Naam</p>
                  <p className="font-medium">{profile?.full_name}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">E-mail</p>
                  <p className="font-medium">{user?.email}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-medium">@</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gebruikersnaam</p>
                  <p className="font-medium">@{profile?.username}</p>
                </div>
              </div>

              {profile?.bio && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-1">Bio</p>
                  <p className="text-foreground whitespace-pre-wrap">{profile.bio}</p>
                </div>
              )}

              <Button variant="outline" onClick={() => setIsEditing(true)} className="rounded-full">
                Bewerken
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Volledige naam</Label>
                <Input 
                  id="full_name" 
                  value={formData.full_name} 
                  onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))} 
                  placeholder="Jan de Vries" 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Gebruikersnaam</Label>
                <Input 
                  id="username" 
                  value={formData.username} 
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} 
                  placeholder="jandevries" 
                />
                <p className="text-xs text-muted-foreground">Anderen kunnen je vinden met deze gebruikersnaam</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea 
                  id="bio" 
                  value={formData.bio} 
                  onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))} 
                  placeholder="Vertel iets over jezelf..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="rounded-full">
                  {saving ? "Opslaan..." : "Opslaan"}
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)} className="rounded-full">
                  Annuleren
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferences Card */}
      <Card className="rounded-2xl border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold">Voorkeuren</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Dagelijks studiedoel</p>
                <p className="text-sm text-muted-foreground">
                  Stel je dagelijkse studietijd doel in
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{studyGoalHours}u</p>
                <p className="text-xs text-muted-foreground">{Math.round(studyGoalHours * 60)} minuten</p>
              </div>
            </div>
            
            <div className="px-1">
              <Slider
                value={[studyGoalHours]}
                onValueChange={handleStudyGoalChange}
                min={0.5}
                max={8}
                step={0.5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>30 min</span>
                <span>8 uur</span>
              </div>
            </div>

            <Button 
              onClick={saveStudyGoal} 
              disabled={savingGoal}
              variant="outline"
              className="rounded-full"
            >
              {savingGoal ? "Opslaan..." : "Studiedoel opslaan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Integrations Card */}
      <Card className="rounded-2xl border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold">Integraties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Spotify */}
          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
              </div>
              <div>
                <p className="font-medium">Spotify</p>
                <p className="text-sm text-muted-foreground">
                  {spotifyConnected ? spotifyUser?.display_name || 'Verbonden' : 'Niet verbonden'}
                </p>
              </div>
            </div>
            
            {spotifyConnected ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-primary">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-sm">Actief</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleSpotifyDisconnect} className="rounded-full">
                  Ontkoppelen
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={handleSpotifyConnect} className="rounded-full">
                Verbinden
              </Button>
            )}
          </div>

          <CalendarIntegrations />
        </CardContent>
      </Card>

      {/* Account Actions Card */}
      <Card className="rounded-2xl border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold">Acties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-border h-12 px-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Grutto Plus</span>
            </div>
            <Switch
              checked={plusEnabled}
              disabled={plusLoading}
              onCheckedChange={async (value) => {
                try {
                  await setPlusEnabled(value);
                  toast.success(value ? "Grutto Plus ingeschakeld" : "Grutto Plus uitgeschakeld");
                } catch {
                  toast.error("Kon instelling niet opslaan");
                }
              }}
              aria-label="Grutto Plus"
            />
          </div>

          <Button variant="outline" onClick={handleSignOut} className="w-full justify-start rounded-xl h-12">
            <LogOut className="w-4 h-4 mr-3" />
            Uitloggen
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full justify-start rounded-xl h-12 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash2 className="w-4 h-4 mr-3" />
                Account verwijderen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
                <AlertDialogDescription>
                  Dit verwijdert je account permanent, inclusief al je bestanden, mappen en instellingen. Deze actie kan niet ongedaan worden gemaakt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAccount} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Verwijderen..." : "Account Verwijderen"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default Account;
