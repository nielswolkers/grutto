import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, Plus, Clock, Users, BookOpen } from "lucide-react";
import { getStudySets } from "@/lib/studyData";
import { StudySet } from "@/types/study";
import StudySetCard from "@/components/study/StudySetCard";
import StudySetDetail from "@/components/study/StudySetDetail";
import CreateStudySet from "@/components/study/CreateStudySet";
import { toast } from "sonner";
import { FileUpload } from "@/components/files/FileUpload";
import { FileList } from "@/components/files/FileList";
import { FolderDialog } from "@/components/files/FolderDialog";
import { FolderCard } from "@/components/files/FolderCard";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

const MAIN_TABS = [
  { key: "recent" as const, label: "Recent" },
  { key: "bestanden" as const, label: "Bestanden" },
  { key: "studiegroep" as const, label: "Studiegroep" },
];

const FILE_TABS = [
  { key: "recent" as const, label: "Recent" },
  { key: "shared" as const, label: "Gedeeld" },
  { key: "favorites" as const, label: "Favorieten" },
];

interface Subject {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sort_order: number;
}

interface Lesson {
  id: string;
  name: string;
  subject_id: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

interface StudyGroup {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  owner_id: string;
  is_public: boolean;
  member_count?: number;
}

const Materialen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"recent" | "bestanden" | "studiegroep">("recent");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeTabIndex = MAIN_TABS.findIndex(t => t.key === activeTab);

  // Recent tab state
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [sortBy, setSortBy] = useState<"name" | "date">("date");

  // Create dialogs
  const [showCreateSubject, setShowCreateSubject] = useState(false);
  const [showCreateLesson, setShowCreateLesson] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectEmoji, setNewSubjectEmoji] = useState("📚");
  const [newLessonName, setNewLessonName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Study sets state (beam-mind-tool integration)
  const [studySets, setStudySets] = useState<StudySet[]>([]);
  const [selectedStudySetId, setSelectedStudySetId] = useState<string | null>(null);
  const [showCreateStudySet, setShowCreateStudySet] = useState(false);

  useEffect(() => {
    setStudySets(getStudySets());
  }, []);

  // Bestanden tab state
  const [fileActiveView, setFileActiveView] = useState<"recent" | "shared" | "favorites">("recent");
  const [fileSortBy, setFileSortBy] = useState<"name" | "date">("date");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [folderFileCounts, setFolderFileCounts] = useState<Record<string, number>>({});
  const fileTabIndex = FILE_TABS.findIndex(t => t.key === fileActiveView);

  // Studiegroep tab state
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    if (searchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchExpanded]);

  useEffect(() => {
    if (user) {
      loadSubjects();
      loadFolders(user.id);
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedSubjectId) {
      loadLessons(selectedSubjectId);
    }
  }, [user, selectedSubjectId]);

  useEffect(() => {
    if (user && activeTab === "studiegroep") {
      loadStudyGroups();
    }
  }, [user, activeTab]);

  const loadSubjects = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("subjects")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order");
    if (error) { console.error(error); return; }
    setSubjects(data || []);
    if (data && data.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(data[0].id);
    }
  };

  const loadLessons = async (subjectId: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("lessons")
      .select("*")
      .eq("user_id", user.id)
      .eq("subject_id", subjectId)
      .order(sortBy === "date" ? "updated_at" : "name", { ascending: sortBy === "name" });
    if (error) { console.error(error); return; }

    // Get item counts
    const enriched: Lesson[] = [];
    for (const lesson of data || []) {
      const { count } = await supabase
        .from("lesson_items")
        .select("*", { count: "exact", head: true })
        .eq("lesson_id", lesson.id);
      enriched.push({ ...lesson, item_count: count || 0 });
    }
    setLessons(enriched);
  };

  const loadFolders = async (userId: string) => {
    try {
      const { data: foldersData, error } = await supabase
        .from("folders")
        .select("*")
        .eq("owner_id", userId)
        .is("parent_folder_id", null)
        .order("name");
      if (error) throw error;
      setFolders(foldersData || []);

      const counts: Record<string, number> = {};
      for (const folder of foldersData || []) {
        const { count } = await supabase
          .from("files")
          .select("*", { count: "exact", head: true })
          .eq("folder_id", folder.id)
          .is("deleted_at", null);
        counts[folder.id] = count || 0;
      }
      setFolderFileCounts(counts);
    } catch (error) {
      console.error("Failed to load folders:", error);
    }
  };

  const loadStudyGroups = async () => {
    if (!user) return;
    setLoadingGroups(true);
    try {
      // Get owned private groups
      const { data: owned } = await supabase
        .from("study_groups")
        .select("*")
        .eq("owner_id", user.id)
        .eq("is_public", false);

      // Get member private groups
      const { data: memberOf } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .eq("status", "accepted");

      const memberGroupIds = memberOf?.map(m => m.group_id) || [];
      let memberGroups: any[] = [];
      if (memberGroupIds.length > 0) {
        const { data } = await supabase
          .from("study_groups")
          .select("*")
          .in("id", memberGroupIds)
          .eq("is_public", false);
        memberGroups = data || [];
      }

      const allGroups = [...(owned || []), ...memberGroups];
      const uniqueGroups = allGroups.filter((g, i, arr) => arr.findIndex(x => x.id === g.id) === i);

      // Get member counts
      const enriched: StudyGroup[] = [];
      for (const group of uniqueGroups) {
        const { count } = await supabase
          .from("group_members")
          .select("*", { count: "exact", head: true })
          .eq("group_id", group.id)
          .eq("status", "accepted");
        enriched.push({ ...group, member_count: (count || 0) + 1 });
      }
      setStudyGroups(enriched);
    } catch (error) {
      console.error("Failed to load study groups:", error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const createSubject = async () => {
    if (!user || !newSubjectName.trim()) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("subjects")
        .insert({
          user_id: user.id,
          name: newSubjectName.trim(),
          emoji: newSubjectEmoji || "📚",
          sort_order: subjects.length,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("Vak aangemaakt!");
      setNewSubjectName("");
      setNewSubjectEmoji("📚");
      setShowCreateSubject(false);
      await loadSubjects();
      if (data) setSelectedSubjectId(data.id);
    } catch (error) {
      toast.error("Kon vak niet aanmaken");
    } finally {
      setIsCreating(false);
    }
  };

  const createLesson = async () => {
    if (!user || !newLessonName.trim() || !selectedSubjectId) return;
    setIsCreating(true);
    try {
      const { error } = await supabase
        .from("lessons")
        .insert({
          user_id: user.id,
          subject_id: selectedSubjectId,
          name: newLessonName.trim(),
        });
      if (error) throw error;
      toast.success("Les aangemaakt!");
      setNewLessonName("");
      setShowCreateLesson(false);
      await loadLessons(selectedSubjectId);
    } catch (error) {
      toast.error("Kon les niet aanmaken");
    } finally {
      setIsCreating(false);
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

  const getTimeAgo = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: false, locale: nl });
  };

  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  if (!user) return null;

  return (
    <div className="w-full">
      {/* Toggle + Search */}
      <div className="flex justify-center items-center gap-3 mb-8">
        {/* Toggle - hidden when search expanded */}
        <div
          className="inline-flex bg-muted rounded-full p-1 border relative overflow-hidden transition-all duration-300 ease-out"
          style={{
            minWidth: searchExpanded ? "0px" : "450px",
            maxWidth: searchExpanded ? "0px" : "450px",
            opacity: searchExpanded ? 0 : 1,
            padding: searchExpanded ? "0" : undefined,
          }}
        >
          <div
            className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm transition-all duration-300 ease-out"
            style={{
              width: "calc(33.333% - 3px)",
              left: `calc(${activeTabIndex} * 33.333% + 2px)`,
            }}
          />
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-6 py-2.5 rounded-full text-sm font-medium transition-colors relative z-10 ${
                activeTab === tab.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search button / expanded search bar */}
        <div
          className={`flex items-center transition-all duration-300 ease-out ${
            searchExpanded
              ? "bg-muted rounded-full border px-4"
              : ""
          }`}
          style={{
            width: searchExpanded ? "500px" : "46px",
            height: "46px",
          }}
        >
          {searchExpanded && (
            <Search className="w-5 h-5 text-muted-foreground flex-shrink-0 mr-2" />
          )}
          {searchExpanded ? (
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Zoeken..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => {
                if (!searchQuery) setSearchExpanded(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  setSearchExpanded(false);
                }
              }}
              className="flex-1 bg-transparent border-none outline-none text-sm h-full"
            />
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-[46px] w-[46px] bg-muted border hover:bg-muted/80"
              onClick={() => setSearchExpanded(true)}
            >
              <Search className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* ===== RECENT TAB ===== */}
      {activeTab === "recent" && selectedStudySetId && (
        <StudySetDetail
          setId={selectedStudySetId}
          onBack={() => {
            setSelectedStudySetId(null);
            setStudySets(getStudySets());
          }}
        />
      )}

      {activeTab === "recent" && showCreateStudySet && (
        <CreateStudySet
          subjects={subjects}
          defaultSubjectId={selectedSubjectId}
          onBack={() => setShowCreateStudySet(false)}
          onCreated={(id) => {
            setShowCreateStudySet(false);
            setStudySets(getStudySets());
            setSelectedStudySetId(id);
          }}
        />
      )}

      {activeTab === "recent" && !selectedStudySetId && !showCreateStudySet && (
        <div>
          {/* Vakken selector bar + Voeg toe button */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 overflow-x-auto flex-1 pb-1 pr-4">
              {subjects.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => setSelectedSubjectId(subject.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                    selectedSubjectId === subject.id
                      ? "bg-muted border border-border text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <span>{subject.emoji}</span>
                  {subject.name}
                </button>
              ))}
              {subjects.length === 0 && (
                <p className="text-sm text-muted-foreground">Nog geen vakken. Maak er een aan!</p>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 flex-shrink-0">
                  Voeg toe
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowCreateLesson(true)} disabled={!selectedSubjectId}>
                  <Plus className="w-4 h-4 mr-2" />
                  Voeg Les toe
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowCreateSubject(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Voeg vak toe
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowCreateStudySet(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Voeg studieset toe
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Sorting + Recent label */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[0.8rem] font-semibold text-muted-foreground">Recent</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sorteren:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "name" | "date")}
                className="h-9 px-3 rounded-full border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="date">Datum</option>
                <option value="name">Naam (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Combined lesson + study set cards */}
          {(selectedSubjectId && lessons.length > 0) || studySets.length > 0 ? (
            <div className="flex gap-6 flex-wrap mb-8">
              {selectedSubjectId && lessons
                .filter(l => !searchQuery || l.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((lesson) => (
                <Card
                  key={lesson.id}
                  className="w-[260px] cursor-pointer hover:shadow-md transition-shadow border-dashed border-2"
                  onClick={() => navigate(`/materialen/les/${lesson.id}`)}
                >
                  <CardContent className="p-5">
                    <div className="h-24 flex items-center justify-center mb-3">
                      <span className="text-5xl">{selectedSubject?.emoji || "📚"}</span>
                    </div>
                    <h3 className="font-semibold text-base truncate">{lesson.name}</h3>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">{selectedSubject?.name}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getTimeAgo(lesson.updated_at)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {studySets
                .filter(s => !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((set) => (
                <Card
                  key={set.id}
                  className="w-[260px] cursor-pointer hover:shadow-md transition-shadow border-dashed border-2"
                  onClick={() => setSelectedStudySetId(set.id)}
                >
                  <CardContent className="p-5">
                    <div className="h-24 flex items-center justify-center mb-3">
                      <span className="text-5xl">{set.emoji}</span>
                    </div>
                    <h3 className="font-semibold text-base truncate">{set.title}</h3>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">{set.cards.length} kaarten</span>
                      {set.lastStudied && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getTimeAgo(new Date(set.lastStudied).toISOString())}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : selectedSubjectId ? (
            <div className="text-center py-8 text-muted-foreground mb-8">
              <p className="text-lg font-medium">Nog geen lessen</p>
              <p className="text-sm">Maak een les aan om bestanden, video's en notities te organiseren.</p>
            </div>
          ) : null}

          {!selectedSubjectId && studySets.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">Maak eerst een vak aan</p>
              <p className="text-sm">Klik op 'Voeg toe' → 'Voeg vak toe' om te beginnen.</p>
            </div>
          )}
        </div>
      )}


      {/* ===== BESTANDEN TAB ===== */}
      {activeTab === "bestanden" && (
        <div>
          {/* File sub-tabs */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex bg-muted rounded-full p-1 border relative" style={{ minWidth: "360px" }}>
              <div
                className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm transition-all duration-300 ease-out"
                style={{
                  width: "calc(33.333% - 3px)",
                  left: `calc(${fileTabIndex} * 33.333% + 2px)`,
                }}
              />
              {FILE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFileActiveView(tab.key)}
                  className={`flex-1 px-6 py-2 rounded-full text-sm font-medium transition-colors relative z-10 ${
                    fileActiveView === tab.key
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 mb-6">
            <Button onClick={() => setShowFolderDialog(true)} variant="ghost" size="sm" className="rounded-full gap-2 h-9 px-4">
              <Plus className="w-4 h-4" />
              Voeg map toe
            </Button>
            <Button onClick={() => setShowUpload(!showUpload)} variant="ghost" size="sm" className="rounded-full gap-2 h-9 px-4">
              <Plus className="w-4 h-4" />
              Importeer
            </Button>
          </div>

          {showUpload && (
            <div className="mb-6 p-6 bg-secondary rounded-2xl shadow-sm border border-border/60">
              <FileUpload userId={user.id} onUploadComplete={handleUploadComplete} />
            </div>
          )}

          {fileActiveView === "recent" && folders.length > 0 && (
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
                value={fileSortBy}
                onChange={(e) => setFileSortBy(e.target.value as "name" | "date")}
                className="h-9 px-3 rounded-full border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="name">Naam (A-Z)</option>
                <option value="date">Datum</option>
              </select>
            </div>
          </div>

          <FileList
            userId={user.id}
            viewType={fileActiveView}
            searchQuery={searchQuery}
            refreshTrigger={refreshTrigger}
            sortBy={fileSortBy}
            fileTypeFilter="all"
            onFavoritesChange={() => {}}
          />
        </div>
      )}

      {/* ===== STUDIEGROEP TAB ===== */}
      {activeTab === "studiegroep" && (
        <div>
          {loadingGroups ? (
            <div className="text-center py-12 text-muted-foreground">Laden...</div>
          ) : studyGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Geen studiegroepen</p>
              <p className="text-sm">Je bent nog geen lid van privé studiegroepen.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {studyGroups.map((group) => (
                <Card
                  key={group.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/groep/${group.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12 bg-background">
                        {group.avatar_url && <AvatarImage src={group.avatar_url} className="object-cover" />}
                        <AvatarFallback className="bg-muted text-primary">
                          <Users className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{group.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {group.member_count} {group.member_count === 1 ? "lid" : "leden"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={showCreateSubject} onOpenChange={setShowCreateSubject}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuw Vak Aanmaken</DialogTitle>
            <DialogDescription>Voeg een nieuw schoolvak toe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Emoji</Label>
              <Input
                value={newSubjectEmoji}
                onChange={(e) => setNewSubjectEmoji(e.target.value)}
                maxLength={4}
                className="w-20 text-center text-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Vaknaam</Label>
              <Input
                placeholder="bijv. Frans, Wiskunde..."
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                maxLength={50}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreateSubject(false)} className="flex-1">Annuleren</Button>
              <Button onClick={createSubject} disabled={!newSubjectName.trim() || isCreating} className="flex-1">
                {isCreating ? "Aanmaken..." : "Vak Aanmaken"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateLesson} onOpenChange={setShowCreateLesson}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuwe Les Aanmaken</DialogTitle>
            <DialogDescription>Voeg een les toe aan {selectedSubject?.name || "dit vak"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lesnaam</Label>
              <Input
                placeholder="bijv. Chapitre 4+5 TW2"
                value={newLessonName}
                onChange={(e) => setNewLessonName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreateLesson(false)} className="flex-1">Annuleren</Button>
              <Button onClick={createLesson} disabled={!newLessonName.trim() || isCreating} className="flex-1">
                {isCreating ? "Aanmaken..." : "Les Aanmaken"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <FolderDialog
        open={showFolderDialog}
        onClose={() => setShowFolderDialog(false)}
        onSuccess={handleFolderCreated}
        userId={user.id}
      />
    </div>
  );
};

export default Materialen;
