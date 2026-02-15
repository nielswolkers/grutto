import { useState } from "react";
import { MoreVertical, Edit2, Trash2, Copy, Download, Share2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { FolderRenameDialog } from "./FolderRenameDialog";
import { FolderShareDialog } from "./FolderShareDialog";
import folderOrange from "@/assets/folder-orange.png";
import folderPink from "@/assets/folder-pink.png";
import folderRed from "@/assets/folder-red.png";
import folderBlue from "@/assets/folder-blue.png";
import folderGreen from "@/assets/folder-green.png";
import folderYellow from "@/assets/folder-yellow.png";
import folderPurple from "@/assets/folder-purple.png";
import folderDarkblue from "@/assets/folder-darkblue.png";

interface FolderCardProps {
  folder: {
    id: string;
    name: string;
    color: string;
    owner_id: string;
    parent_folder_id?: string | null;
  };
  fileCount: number;
  onUpdate: () => void;
}

const FOLDER_ICON_MAP: Record<string, string> = {
  "#E8A54B": folderOrange,
  "#E4B4E6": folderPink,
  "#A8C5E8": folderBlue,
  "#E8D347": folderYellow,
  "#6BC497": folderGreen,
  "#D96B5B": folderRed,
  "#9B7DC4": folderPurple,
  "#5B8DC4": folderDarkblue,
  // Legacy color mappings for backwards compatibility
  "#E8C547": folderYellow,
  "#ECA869": folderOrange,
  "#E86C6C": folderRed,
  "#7FABDB": folderBlue,
  "#FFB6B6": folderPink,
  "#9CA3AF": folderDarkblue,
};

export const FolderCard = ({ folder, fileCount, onUpdate }: FolderCardProps) => {
  const navigate = useNavigate();
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const getFolderIcon = (color: string) => {
    return FOLDER_ICON_MAP[color] || folderOrange;
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`Map "${folder.name}" naar prullenbak verplaatsen?`)) return;

    try {
      const { error } = await supabase
        .from('folders')
        .update({ deleted_at: new Date().toISOString(), deleted_by: folder.owner_id })
        .eq('id', folder.id);

      if (error) throw error;

      await supabase.from('notifications').insert({
        type: 'folder_deleted',
        message: `Map "${folder.name}" is naar de prullenbak verplaatst`,
        recipient_id: folder.owner_id,
        sender_id: folder.owner_id,
      });

      toast.success("Map naar prullenbak verplaatst");
      onUpdate();
    } catch (error: any) {
      toast.error("Kon map niet verwijderen");
      console.error(error);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const fileId = e.dataTransfer.getData('application/grutto-file-id');
    const draggedFolderId = e.dataTransfer.getData('application/grutto-folder-id');

    try {
      if (fileId) {
        const { error } = await supabase
          .from('files')
          .update({ folder_id: folder.id })
          .eq('id', fileId);

        if (error) throw error;
        toast.success('Bestand verplaatst naar map');
      } else if (draggedFolderId && draggedFolderId !== folder.id) {
        const { error } = await supabase
          .from('folders')
          .update({ parent_folder_id: folder.id })
          .eq('id', draggedFolderId);

        if (error) throw error;
        toast.success('Map verplaatst naar map');
      }

      onUpdate();
    } catch (error: any) {
      toast.error('Kon item niet verplaatsen');
      console.error(error);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/grutto-folder-id', folder.id);
  };

  const handleCopyFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newName = `${folder.name} (kopie)`;

      const { data: newFolder, error: folderError } = await supabase
        .from('folders')
        .insert({
          name: newName,
          color: folder.color,
          owner_id: folder.owner_id,
          parent_folder_id: folder.parent_folder_id,
        })
        .select()
        .single();

      if (folderError) throw folderError;

      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('*')
        .eq('folder_id', folder.id);

      if (filesError) throw filesError;

      for (const file of files || []) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('user-files')
          .download(file.storage_url);

        if (downloadError) {
          console.error('Failed to download file:', downloadError);
          continue;
        }

        const newFilePath = `${folder.owner_id}/${Date.now()}_${file.filename}`;
        const { error: uploadError } = await supabase.storage
          .from('user-files')
          .upload(newFilePath, fileData, {
            contentType: file.file_type,
          });

        if (uploadError) {
          console.error('Failed to upload file:', uploadError);
          continue;
        }

        await supabase
          .from('files')
          .insert({
            filename: file.filename,
            file_type: file.file_type,
            file_size: file.file_size,
            storage_url: newFilePath,
            owner_id: folder.owner_id,
            folder_id: newFolder.id,
          });
      }

      toast.success('Map en inhoud gekopieerd');
      onUpdate();
    } catch (error: any) {
      toast.error('Kon map niet kopiëren');
      console.error(error);
    }
  };

  const handleDownloadZip = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const JSZip = (await import('jszip')).default;
      const { saveAs } = await import('file-saver');

      const zip = new JSZip();

      const { data: files, error } = await supabase
        .from('files')
        .select('*')
        .eq('folder_id', folder.id);

      if (error) throw error;

      for (const file of files || []) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('user-files')
          .download(file.storage_url);

        if (downloadError) throw downloadError;
        zip.file(file.filename, fileData);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folder.name}.zip`);
      toast.success('Map als ZIP gedownload');
    } catch (error: any) {
      toast.error('Kon ZIP-download niet voltooien');
      console.error(error);
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="group relative bg-card rounded-3xl p-6 shadow-md border border-border/60 cursor-pointer transition-all hover:shadow-lg min-w-[160px]"
      onClick={() => navigate(`/materialen/folder/${folder.id}`)}
    >
      <div
        className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DropdownMenu modal={true}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-secondary/80 hover:bg-secondary"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 rounded-2xl p-2"
            onClick={(e) => e.stopPropagation()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowRenameDialog(true);
              }}
              className="rounded-xl py-3"
              onSelect={(e) => e.preventDefault()}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Wijzigen
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowShareDialog(true);
              }}
              className="rounded-xl py-3"
              onSelect={(e) => e.preventDefault()}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Deel map
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleCopyFolder}
              className="rounded-xl py-3"
              onSelect={(e) => e.preventDefault()}
            >
              <Copy className="w-4 h-4 mr-2" />
              Kopiëren
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDownloadZip}
              className="rounded-xl py-3"
              onSelect={(e) => e.preventDefault()}
            >
              <Download className="w-4 h-4 mr-2" />
              Download als ZIP
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive rounded-xl py-3"
              onSelect={(e) => e.preventDefault()}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Verwijderen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="w-24 h-20">
          <img
            src={getFolderIcon(folder.color)}
            alt={folder.name}
            className="w-full h-full object-contain"
          />
        </div>
        <div className="text-center w-full">
          <p className="font-medium text-base truncate">{folder.name}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {fileCount} bestand{fileCount !== 1 ? 'en' : ''}
          </p>
        </div>
      </div>

      <FolderRenameDialog
        open={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        onSuccess={onUpdate}
        folderId={folder.id}
        currentName={folder.name}
        currentColor={folder.color}
      />

      <FolderShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        onSuccess={onUpdate}
        folderId={folder.id}
        folderName={folder.name}
      />
    </div>
  );
};
