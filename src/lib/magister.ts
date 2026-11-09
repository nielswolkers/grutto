import { supabase } from "@/integrations/supabase/client";

// Types mirror the MagImp desktop (Tauri) commands in src-tauri/src/lib.rs.
export type GradeRow = {
  course: string; title: string; grade: string; weight: string;
  subtitle?: string; date?: string; period?: string; pta?: boolean; passed?: boolean | null; column_id?: number;
};
export type CourseAverage = { course: string; average: string };
export type Attendance = { total_lessons: number; absent: number; sick: number; unauthorized: number; late: number; excused: number; present: number; percentage: number };
export type SchoolYear = { id: number; label: string; begin: string; end: string; grades: GradeRow[]; course_averages: CourseAverage[]; attendance: Attendance };
export type YearInfo = { id: number; class_label: string; period: string; begin: string };

export function numericGrade(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) && number <= 10 ? number : null;
}

/** Class name from MagImp labels like "5va · 2024–2025". */
export const classOf = (label: string) => label.split(" · ")[0];

async function tauri() {
  const { invoke, isTauri } = await import("@tauri-apps/api/core");
  if (!isTauri()) throw new Error("Magister koppelen werkt alleen in de Grutto desktop-app.");
  return invoke;
}
export async function isDesktop() {
  try { const { isTauri } = await import("@tauri-apps/api/core"); return isTauri(); } catch { return false; }
}

export async function magisterLogin() {
  const invoke = await tauri();
  return invoke<{ refresh_token: string | null; years: YearInfo[] }>("magister_login");
}
export async function magisterFetch(refreshToken: string, yearIds: number[] | null) {
  const invoke = await tauri();
  return invoke<{ refresh_token: string | null; years: SchoolYear[] }>("magister_fetch", { refreshToken, yearIds });
}

export async function getConnection() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("magister_connections").select("*").eq("user_id", user.id).maybeSingle();
  return data;
}

export async function saveImport(refreshToken: string | null, yearIds: number[], years: SchoolYear[]) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Niet ingelogd");
  const now = new Date().toISOString();
  const { error } = await supabase.from("magister_connections").upsert({
    user_id: user.id, refresh_token: refreshToken, selected_year_ids: yearIds, last_synced_at: now, updated_at: now,
  });
  if (error) throw error;
  if (years.length) {
    const { error: e2 } = await supabase.from("magister_years").upsert(years.map((y) => ({
      user_id: user.id, year_id: y.id, label: y.label, begin_date: y.begin, end_date: y.end,
      grades: y.grades as any, course_averages: y.course_averages as any, attendance: y.attendance as any, synced_at: now,
    })), { onConflict: "user_id,year_id" });
    if (e2) throw e2;
  }
  window.dispatchEvent(new Event("magister-updated"));
}

export async function loadYears(): Promise<SchoolYear[]> {
  const { data } = await supabase.from("magister_years").select("*").order("begin_date", { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: Number(r.year_id), label: r.label, begin: r.begin_date ?? "", end: r.end_date ?? "",
    grades: r.grades ?? [], course_averages: r.course_averages ?? [], attendance: r.attendance ?? {},
  }));
}

export async function disconnectMagister() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("magister_years").delete().eq("user_id", user.id);
  await supabase.from("magister_connections").delete().eq("user_id", user.id);
  window.dispatchEvent(new Event("magister-updated"));
}

let syncing = false;
/** Re-sync stored classes on app start/reload (desktop only). */
export async function autoSync() {
  if (syncing || !(await isDesktop())) return;
  syncing = true;
  try {
    const conn = await getConnection();
    if (!conn?.refresh_token) return;
    const ids = (conn.selected_year_ids ?? []).map(Number);
    const res = await magisterFetch(conn.refresh_token, ids.length ? ids : null);
    await saveImport(res.refresh_token ?? conn.refresh_token, ids, res.years);
  } catch (e) { console.warn("Magister sync mislukt", e); }
  finally { syncing = false; }
}
