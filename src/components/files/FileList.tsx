import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FileText, FileSpreadsheet, Download, Trash2, MoreHorizontal, Image, Star, Copy, Edit2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ShareDialog } from "./ShareDialog";
import { toast } from "sonner";
import { formatRelativeDate } from "@/lib/dateUtils";

interface FileListProps {
  userId: string;
  viewType: "recent" | "shared" | "favorites";
  searchQuery: string;
  refreshTrigger: number;
  sortBy: "name" | "date";
  fileTypeFilter: string;
  onFavoritesChange: () => void;
}

interface FileData {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  upload_date: string;
  storage_url: string;
  owner_id: string;
  folder_id?: string | null;
  is_favorite?: boolean;
  profiles?: {
    username: string;
    display_name: string;
  };
}

const getFileIcon = (fileType: string) => {
  if (fileType.includes('image')) return <Image className="w-5 h-5" />;
  if (fileType.includes('word')) return <FileText className="w-5 h-5 text-blue-600" />;
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
  if (fileType.includes('powerpoint') || fileType.includes('presentation')) return <FileSpreadsheet className="w-5 h-5 text-orange-600" />;
  if (fileType.includes('pdf')) return <FileText className="w-5 h-5 text-red-600" />;
  return <FileText className="w-5 h-5 text-muted-foreground" />;
};

const getFileTypeLabel = (fileType: string) => {
  if (fileType.includes('image')) return 'AFBEELDING';
  if (fileType.includes('word')) return 'WORD';
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'EXCEL';
  if (fileType.includes('powerpoint') || fileType.includes('presentation')) return 'POWERPOINT';
  if (fileType.includes('pdf')) return 'PDF';
  return 'DOCUMENT';
};

export const FileList = ({ userId, viewType, searchQuery, refreshTrigger, sortBy, fileTypeFilter, onFavoritesChange }: FileListProps) => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileData[]>([]);
  const [rawFiles, setRawFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareDialogFile, setShareDialogFile] = useState<FileData | null>(null);
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState("");
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null);

  useEffect(() => {
    setRawFiles([]);
    setFiles([]);
    loadFiles();
  }, [userId, viewType, refreshTrigger]);

  useEffect(() => {
    if (rawFiles.length > 0) {
      setFiles(filterAndSortFiles(rawFiles));
    }
  }, [searchQuery, fileTypeFilter, sortBy, rawFiles]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      let query;

      if (viewType === "favorites") {
        query = supabase
          .from('files')
          .select('*')
          .eq('owner_id', userId)
          .eq('is_favorite', true)
          .is('deleted_at', null)
          .order('upload_date', { ascending: false });
      } else if (viewType === "shared") {
        const { data, error } = await supabase
          .from('file_shares')
          .select(`
            file_id,
            files!inner (
              id,
              filename,
              file_type,
              file_size,
              upload_date,
              storage_url,
              owner_id,
              folder_id,
              is_favorite
            )
          `)
          .eq('shared_with_user_id', userId);

        if (error) throw error;

        const fileOwnerIds = [...new Set(data.map((item: any) => item.files.owner_id))];
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, full_name')
          .in('user_id', fileOwnerIds);

        if (profilesError) throw profilesError;

        const profileMap = new Map(profiles?.map(p => [p.user_id, { username: p.username, display_name: p.display_name || p.full_name }]) || []);
        const transformedFiles = data.map((item: any) => ({
          ...item.files,
          profiles: profileMap.get(item.files.owner_id),
        }));

        setRawFiles(transformedFiles);
        setFiles(filterAndSortFiles(transformedFiles));
        setLoading(false);
        return;
      } else {
        const [ownFiles, sharedFilesData] = await Promise.all([
          supabase
            .from('files')
            .select('*')
            .eq('owner_id', userId)
            .is('deleted_at', null)
            .order('upload_date', { ascending: false }),
          supabase
            .from('file_shares')
            .select(`
              file_id,
              files!inner (
                id,
                filename,
                file_type,
                file_size,
                upload_date,
                storage_url,
                owner_id,
                folder_id,
                is_favorite
              )
            `)
            .eq('shared_with_user_id', userId),
        ]);

        if (ownFiles.error) throw ownFiles.error;
        if (sharedFilesData.error) throw sharedFilesData.error;

        const fileOwnerIds = [...new Set(sharedFilesData.data.map((item: any) => item.files.owner_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, full_name')
          .in('user_id', fileOwnerIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, { username: p.username, display_name: p.display_name || p.full_name }]) || []);
        const sharedFiles = sharedFilesData.data.map((item: any) => ({
          ...item.files,
          profiles: profileMap.get(item.files.owner_id),
        }));

        const allFilesCombined = [...(ownFiles.data || []), ...sharedFiles]
          .sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime());
        setRawFiles(allFilesCombined);
        setFiles(filterAndSortFiles(allFilesCombined));
        setLoading(false);
        return;
      }

      const { data, error } = await query;
      if (error) throw error;

      setRawFiles(data || []);
      setFiles(filterAndSortFiles(data || []));
    } catch (error: any) {
      toast.error("Kon bestanden niet laden");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortFiles = (fileList: FileData[]) => {
    let filtered = fileList;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(file =>
        file.filename.toLowerCase().includes(query) ||
        getFileTypeLabel(file.file_type).toLowerCase().includes(query) ||
        file.profiles?.username?.toLowerCase().includes(query) ||
        file.profiles?.display_name?.toLowerCase().includes(query)
      );
    }

    if (fileTypeFilter !== "all") {
      filtered = filtered.filter(file => {
        const label = getFileTypeLabel(file.file_type).toLowerCase();
        return label.includes(fileTypeFilter.toLowerCase());
      });
    }

    if (sortBy === "name") {
      filtered = [...filtered].sort((a, b) => a.filename.localeCompare(b.filename));
    } else {
      filtered = [...filtered].sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime());
    }
    return filtered;
  };

  const handleFileClick = (file: FileData) => {
    navigate(`/materialen/preview/${file.id}`);
  };

  const handleFileDoubleClick = (file: FileData, e: React.MouseEvent) => {
    e.stopPropagation();

    const isOfficeFile =
      file.file_type.includes('word') ||
      file.file_type.includes('excel') ||
      file.file_type.includes('spreadsheet') ||
      file.file_type.includes('powerpoint') ||
      file.file_type.includes('presentation');

    if (isOfficeFile) {
      handleDownload(file);
    }
  };

  const handleDownload = async (file: FileData) => {
    try {
      const { data, error } = await supabase.storage
        .from('user-files')
        .download(file.storage_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Bestand gedownload");
    } catch (error: any) {
      toast.error("Download mislukt");
      console.error(error);
    }
  };

  const handleDuplicate = async (file: FileData) => {
    try {
      const { data, error } = await supabase.storage
        .from('user-files')
        .download(file.storage_url);

      if (error) throw error;

      const newFileName = `${file.filename.split('.')[0]} (kopie).${file.filename.split('.').pop()}`;
      const newFilePath = `${userId}/${Date.now()}_${newFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(newFilePath, data, {
          contentType: file.file_type,
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('files')
        .insert({
          filename: newFileName,
          file_type: file.file_type,
          file_size: file.file_size,
          storage_url: newFilePath,
          owner_id: userId,
        });

      if (insertError) throw insertError;

      toast.success("Kopie gemaakt");
      loadFiles();
    } catch (error: any) {
      toast.error("Kon kopie niet maken");
      console.error(error);
    }
  };

  const handleDelete = async (fileId: string, filename: string) => {
    try {
      const { error } = await supabase
        .from('files')
        .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
        .eq('id', fileId);

      if (error) throw error;

      await supabase.from('notifications').insert({
        type: 'file_deleted',
        message: `Bestand "${filename}" is naar de prullenbak verplaatst`,
        recipient_id: userId,
        sender_id: userId,
        file_id: fileId,
      });

      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success("Bestand naar prullenbak verplaatst");
      onFavoritesChange();
    } catch (error: any) {
      toast.error("Kon bestand niet verwijderen");
      console.error(error);
    }
  };

  const toggleFavorite = async (file: FileData, e: React.MouseEvent) => {
    e.stopPropagation();

    const newFavoriteState = !file.is_favorite;
    setFiles(prev => prev.map(f =>
      f.id === file.id ? { ...f, is_favorite: newFavoriteState } : f
    ));

    toast.success(newFavoriteState ? "Toegevoegd aan favorieten" : "Uit favorieten verwijderd");
    onFavoritesChange();

    try {
      const { error } = await supabase
        .from('files')
        .update({ is_favorite: newFavoriteState })
        .eq('id', file.id);

      if (error) throw error;
    } catch (error: any) {
      setFiles(prev => prev.map(f =>
        f.id === file.id ? { ...f, is_favorite: file.is_favorite } : f
      ));
      toast.error("Kon favoriet niet bijwerken");
      console.error(error);
    }
  };

  const startEditingName = (file: FileData, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFileId(file.id);
    setEditingFileName(file.filename);
  };

  const saveFileName = async (fileId: string) => {
    if (!editingFileName.trim()) return;

    try {
      const { error } = await supabase
        .from('files')
        .update({ filename: editingFileName.trim() })
        .eq('id', fileId);

      if (error) throw error;

      setFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, filename: editingFileName.trim() } : f
      ));

      toast.success("Naam gewijzigd");
    } catch (error: any) {
      toast.error("Kon naam niet wijzigen");
      console.error(error);
    } finally {
      setEditingFileId(null);
    }
  };

  const handleDragStart = (fileId: string, file: FileData, e: React.DragEvent) => {
    setDraggedFile(fileId);
    e.dataTransfer.setData('application/grutto-file-id', fileId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {files.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Geen bestanden gevonden</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              draggable={!editingFileId}
              onDragStart={(e) => handleDragStart(file.id, file, e)}
              onClick={() => !editingFileId && handleFileClick(file)}
              onDoubleClick={(e) => handleFileDoubleClick(file, e)}
              onMouseEnter={() => setHoveredFileId(file.id)}
              onMouseLeave={() => setHoveredFileId(null)}
              className="group flex items-center gap-4 p-5 bg-card rounded-2xl border hover:border-primary/20 transition-all cursor-pointer hover:shadow-sm"
            >
              {getFileIcon(file.file_type)}

              <div className="flex-1 min-w-0">
                {editingFileId === file.id ? (
                  <Input
                    value={editingFileName}
                    onChange={(e) => setEditingFileName(e.target.value)}
                    onBlur={() => saveFileName(file.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveFileName(file.id);
                      if (e.key === 'Escape') setEditingFileId(null);
                    }}
                    className="h-8"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p className="font-medium truncate">{file.filename}</p>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                  <span>{formatRelativeDate(file.upload_date)}</span>
                  {file.profiles && (
                    <>
                      <span>•</span>
                      <span>{file.profiles.display_name || file.profiles.username}</span>
                    </>
                  )}
                </div>
              </div>

              {hoveredFileId === file.id && file.owner_id === userId && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShareDialogFile(file);
                    }}
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={(e) => toggleFavorite(file, e)}
                  >
                    <Star className={`w-4 h-4 ${file.is_favorite ? 'fill-primary text-primary' : ''}`} />
                  </Button>
                </div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                    <MoreHorizontal className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
                  <DropdownMenuItem onClick={() => handleDownload(file)} className="rounded-xl py-3">
                    <Download className="w-4 h-4 mr-3" />
                    Downloaden
                  </DropdownMenuItem>
                  {file.owner_id === userId && (
                    <>
                      <DropdownMenuItem onClick={() => handleDuplicate(file)} className="rounded-xl py-3">
                        <Copy className="w-4 h-4 mr-3" />
                        Kopie maken
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setShareDialogFile(file);
                        }}
                        className="rounded-xl py-3"
                      >
                        <Share2 className="w-4 h-4 mr-3" />
                        Delen
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => toggleFavorite(file, e)} className="rounded-xl py-3">
                        <Star className="w-4 h-4 mr-3" />
                        {file.is_favorite ? 'Uit favorieten verwijderen' : 'Voeg toe aan favorieten'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => startEditingName(file, e)} className="rounded-xl py-3">
                        <Edit2 className="w-4 h-4 mr-3" />
                        Bewerk naam
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(file.id, file.filename)}
                        className="text-destructive focus:text-destructive rounded-xl py-3"
                      >
                        <Trash2 className="w-4 h-4 mr-3" />
                        Verwijderen
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {shareDialogFile && (
        <ShareDialog
          file={shareDialogFile}
          open={!!shareDialogFile}
          onClose={() => setShareDialogFile(null)}
        />
      )}
    </div>
  );
};
