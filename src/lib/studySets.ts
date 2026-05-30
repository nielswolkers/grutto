import { supabase } from "@/integrations/supabase/client";
import { StudySet, Flashcard } from "@/types/study";

export const COLOR_MAP: Record<string, string> = {
  indigo: "from-primary to-blue-400",
  orange: "from-orange-500 to-amber-400",
  teal: "from-emerald-500 to-teal-400",
  rose: "from-rose-500 to-pink-400",
  violet: "from-violet-500 to-purple-400",
  sky: "from-sky-500 to-cyan-400",
};

export const COLOR_BG_MAP: Record<string, string> = {
  indigo: "bg-primary/10 text-primary",
  orange: "bg-orange-50 text-orange-600",
  teal: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
  sky: "bg-sky-50 text-sky-600",
};

function rowToSet(row: any, cards: any[], currentUserId?: string): StudySet {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    emoji: row.emoji || "📚",
    color: row.color || "indigo",
    subjectId: row.subject_id || undefined,
    cards: (cards || [])
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, term: c.term, definition: c.definition })),
    createdAt: new Date(row.created_at).getTime(),
    lastStudied: undefined,
    ownerId: row.owner_id,
    isOwner: currentUserId ? row.owner_id === currentUserId : false,
  };
}

/** Returns all study sets in the user's library (incl. owned ones via trigger). */
export async function getLibrarySets(userId: string): Promise<StudySet[]> {
  const { data: lib, error } = await supabase
    .from("study_set_library")
    .select("set_id, subject_id, last_studied, study_sets(*)")
    .eq("user_id", userId);
  if (error) throw error;
  if (!lib || lib.length === 0) return [];

  const setIds = lib.map((l: any) => l.set_id);
  const { data: cards } = await supabase
    .from("study_cards")
    .select("*")
    .in("set_id", setIds);

  return lib
    .filter((l: any) => l.study_sets)
    .map((l: any) => {
      const setCards = (cards || []).filter((c: any) => c.set_id === l.set_id);
      const s = rowToSet({ ...l.study_sets, subject_id: l.subject_id || l.study_sets.subject_id }, setCards, userId);
      s.lastStudied = l.last_studied ? new Date(l.last_studied).getTime() : undefined;
      return s;
    });
}

export async function getStudySet(id: string, currentUserId?: string): Promise<StudySet | null> {
  const { data: set, error } = await supabase.from("study_sets").select("*").eq("id", id).maybeSingle();
  if (error || !set) return null;
  const { data: cards } = await supabase.from("study_cards").select("*").eq("set_id", id);
  return rowToSet(set, cards || [], currentUserId);
}

export async function createStudySet(input: {
  title: string;
  description?: string;
  emoji?: string;
  subjectId: string;
  cards: { term: string; definition: string }[];
}): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: set, error } = await supabase
    .from("study_sets")
    .insert({
      owner_id: user.id,
      title: input.title,
      description: input.description || "",
      emoji: input.emoji || "📚",
      subject_id: input.subjectId,
    })
    .select()
    .single();
  if (error) throw error;
  if (input.cards.length > 0) {
    const { error: cErr } = await supabase.from("study_cards").insert(
      input.cards.map((c, i) => ({ set_id: set.id, term: c.term, definition: c.definition, position: i })),
    );
    if (cErr) throw cErr;
  }
  return set.id;
}

export async function updateStudySet(
  id: string,
  patch: { title?: string; description?: string; emoji?: string; subjectId?: string; cards?: { term: string; definition: string }[] },
) {
  const upd: any = {};
  if (patch.title !== undefined) upd.title = patch.title;
  if (patch.description !== undefined) upd.description = patch.description;
  if (patch.emoji !== undefined) upd.emoji = patch.emoji;
  if (patch.subjectId !== undefined) upd.subject_id = patch.subjectId;
  if (Object.keys(upd).length) {
    const { error } = await supabase.from("study_sets").update(upd).eq("id", id);
    if (error) throw error;
  }
  if (patch.cards) {
    await supabase.from("study_cards").delete().eq("set_id", id);
    if (patch.cards.length > 0) {
      await supabase.from("study_cards").insert(
        patch.cards.map((c, i) => ({ set_id: id, term: c.term, definition: c.definition, position: i })),
      );
    }
  }
}

/** Deletes the set entirely (owner only). */
export async function deleteStudySetAsOwner(id: string) {
  const { error } = await supabase.from("study_sets").delete().eq("id", id);
  if (error) throw error;
}

/** Removes the set from current user's library. */
export async function removeFromLibrary(setId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("study_set_library")
    .delete()
    .eq("user_id", user.id)
    .eq("set_id", setId);
  if (error) throw error;
}

export async function addToLibrary(setId: string, subjectId?: string | null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("study_set_library")
    .upsert(
      { user_id: user.id, set_id: setId, subject_id: subjectId ?? null },
      { onConflict: "user_id,set_id", ignoreDuplicates: true },
    );
}

export async function touchLastStudied(setId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("study_set_library")
    .update({ last_studied: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("set_id", setId);
}

export function studySetShareUrl(id: string): string {
  return `${window.location.origin}/studieset/${id}`;
}
