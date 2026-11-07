import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import StudySetDetail from "@/components/study/StudySetDetail";

export default function StudySetView() {
  const { setId } = useParams<{ setId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || !setId) return;
    (async () => {
      const { data } = await supabase.from("study_sets").select("id").eq("id", setId).maybeSingle();
      setExists(!!data);
      const { data: subs } = await supabase
        .from("subjects").select("*").eq("user_id", user.id).order("sort_order");
      setSubjects(subs || []);
    })();
  }, [user, setId]);

  if (loading || exists === null) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!user) { navigate("/auth"); return null; }
  if (!exists || !setId) return (
    <div className="p-12 text-center">
      <p className="text-muted-foreground mb-4">Studieset niet gevonden.</p>
      <Button onClick={() => navigate("/studiesets")}><ArrowLeft className="w-4 h-4 mr-2" /> Terug</Button>
    </div>
  );

  return (
    <div className="w-full">
      <StudySetDetail
        setId={setId}
        subjects={subjects}
        onBack={() => navigate("/studiesets")}
      />
    </div>
  );
}
