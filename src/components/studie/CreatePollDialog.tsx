import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, X, BarChart3 } from "lucide-react";
import { toast } from "sonner";

interface CreatePollDialogProps {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPollCreated: () => void;
}

export function CreatePollDialog({ groupId, open, onOpenChange, onPollCreated }: CreatePollDialogProps) {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [creating, setCreating] = useState(false);

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, ""]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const createPoll = async () => {
    if (!user || !question.trim()) return;
    
    const validOptions = options.filter(o => o.trim());
    if (validOptions.length < 2) {
      toast.error("Voeg minimaal 2 opties toe");
      return;
    }

    setCreating(true);
    try {
      // Create poll
      const { data: poll, error: pollError } = await supabase
        .from("polls")
        .insert({
          group_id: groupId,
          created_by: user.id,
          question: question.trim(),
        })
        .select()
        .single();

      if (pollError) throw pollError;

      // Create options
      const optionsToInsert = validOptions.map((opt, index) => ({
        poll_id: poll.id,
        option_text: opt.trim(),
        sort_order: index,
      }));

      const { error: optionsError } = await supabase
        .from("poll_options")
        .insert(optionsToInsert);

      if (optionsError) throw optionsError;

      toast.success("Poll aangemaakt!");
      setQuestion("");
      setOptions(["", ""]);
      onOpenChange(false);
      onPollCreated();
    } catch (error) {
      console.error("Create poll error:", error);
      toast.error("Kon poll niet aanmaken");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Poll aanmaken
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Vraag</Label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Stel een vraag..."
            />
          </div>

          <div className="space-y-2">
            <Label>Opties</Label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    placeholder={`Optie ${index + 1}`}
                  />
                  {options.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 rounded-full h-8 w-8"
                      onClick={() => removeOption(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            
            {options.length < 6 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={addOption}
              >
                <Plus className="w-4 h-4" />
                Optie toevoegen
              </Button>
            )}
          </div>

          <Button
            onClick={createPoll}
            disabled={creating || !question.trim() || options.filter(o => o.trim()).length < 2}
            className="w-full"
          >
            {creating ? "Aanmaken..." : "Poll aanmaken"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
