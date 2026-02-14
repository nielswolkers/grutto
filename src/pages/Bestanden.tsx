import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Upload, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/files/FileUpload";
import { FileList } from "@/components/files/FileList";
import { FolderDialog } from "@/components/files/FolderDialog";
import { FolderCard } from "@/components/files/FolderCard";
import { useAuth } from "@/hooks/useAuth";

const TABS = [
  { key: "recent" as const, label: "Recent" },
  { key: "shared" as const, label: "Gedeeld" },
  { key: "favorites" as const, label: "Favorieten" },
];

const Bestanden = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [activeView, setActiveView] = useState<"recent" | "shared" | "favorites">("recent");
  const [sortByRecent, setSortByRecent] = useState<"name" | "date">("date");
  const [sortByShared, setSortByShared] = useState<"name" | "date">("date");
  const [sortByFavorites, setSortByFavorites] = useState<"name" | "date">("date");
  const [fileTypeFilter, setFileTypeFilter] = useState<string>("all");
  const [folders, setFolders] = useState<any[]>([]);
  const [folderFileCounts, setFolderFileCounts] = useState<Record<string, number>>({});
  const [showSearch, setShowSearch] = useState(false);

  const activeIndex = TABS.findIndex(tab => tab.key === activeView);

  useEffect(() => {
    if (user) {
      loadFolders(user.id);
    }
  }, [user]);

  const loadFolders = async (userId: string) => {
    try {
      const { data: foldersData, error } = await supabase
        .from('folders')
        .select('*')
        .eq('owner_id', userId)
        .is('parent_folder_id', null)
        .order('name');

      if (error) throw error;

      setFolders(foldersData || []);

      const counts: Record<string, number> = {};
      for (const folder of foldersData || []) {
        const { count } = await supabase
          .from('files')
          .select('*', { count: 'exact', head: true })
          .eq('folder_id', folder.id)
          .is('deleted_at', null);
        counts[folder.id] = count || 0;
      }
      setFolderFileCounts(counts);
    } catch (error) {
      console.error("Failed to load folders:", error);
    }
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    setRefreshTrigger(prev => prev + 1);
    toast.success("Bestand geüpload!");
  };

  const handleFolderCreated = () => {
    setRefreshTrigger(prev => prev + 1);
    if (user) loadFolders(user.id);
  };

  if (!user) return null;

  return (
    <div className="w-full">
      {/* Toggle - same style as Communities page - centered */}
      <div className="flex justify-center items-center gap-3 mb-8">
        <div className="inline-flex bg-muted rounded-full p-1 border relative" style={{ minWidth: '400px' }}>
          {/* Sliding indicator */}
          <div 
            className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm transition-all duration-300 ease-out"
            style={{
              width: 'calc(33.333% - 3px)',
              left: `calc(${activeIndex} * 33.333% + 2px)`,
            }}
          />
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`flex-1 px-6 py-2.5 rounded-full text-sm font-medium transition-colors relative z-10 ${
                activeView === tab.key 
                  ? "text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Round search button - same as Communities */}
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-[46px] w-[46px] bg-muted border hover:bg-muted/80"
          onClick={() => setShowSearch(!showSearch)}
        >
          <Search className="w-5 h-5" />
        </Button>
      </div>

      {/* Search bar - shown when search button is clicked */}
      {showSearch && (
        <div className="flex justify-center mb-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Zoeken..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-full bg-secondary border-0 focus-visible:ring-1"
              autoFocus
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 mb-6">
        <Button onClick={() => setShowFolderDialog(true)} variant="ghost" size="sm" className="rounded-full gap-2 h-9 px-4">
          <FolderPlus className="w-4 h-4" />
          Voeg map toe
        </Button>

        <Button onClick={() => setShowUpload(!showUpload)} variant="ghost" size="sm" className="rounded-full gap-2 h-9 px-4">
          <Upload className="w-4 h-4" />
          Importeer
        </Button>
      </div>

      {showUpload && (
        <div className="mb-6 p-6 bg-secondary rounded-2xl shadow-sm border border-border/60">
          <FileUpload userId={user.id} onUploadComplete={handleUploadComplete} />
        </div>
      )}

      {activeView === "recent" && folders.length > 0 && (
        <div className="mb-8">
          <h2 className="text-[0.8rem] font-semibold mb-4 text-muted-foreground">Mappen</h2>
          <div className="flex gap-6 overflow-x-auto pb-2">
            {folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                fileCount={folderFileCounts[folder.id] || 0}
                onUpdate={() => {
                  loadFolders(user.id);
                  setRefreshTrigger(prev => prev + 1);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[0.8rem] font-semibold text-muted-foreground">Bestanden</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sorteren:</span>
          <select
            value={activeView === "recent" ? sortByRecent : activeView === "shared" ? sortByShared : sortByFavorites}
            onChange={(e) => {
              const value = e.target.value as "name" | "date";
              if (activeView === "recent") setSortByRecent(value);
              else if (activeView === "shared") setSortByShared(value);
              else setSortByFavorites(value);
            }}
            className="h-9 px-3 rounded-full border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="name">Naam (A-Z)</option>
            <option value="date">Datum</option>
          </select>
        </div>
      </div>

      <FileList
        userId={user.id}
        viewType={activeView}
        searchQuery={searchQuery}
        refreshTrigger={refreshTrigger}
        sortBy={activeView === "recent" ? sortByRecent : activeView === "shared" ? sortByShared : sortByFavorites}
        fileTypeFilter={fileTypeFilter}
        onFavoritesChange={() => {}}
      />

      <FolderDialog
        open={showFolderDialog}
        onClose={() => setShowFolderDialog(false)}
        onSuccess={handleFolderCreated}
        userId={user.id}
      />
    </div>
  );
};

export default Bestanden;
