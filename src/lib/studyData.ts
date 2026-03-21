import { StudySet } from "@/types/study";

const STORAGE_KEY = "studyflow_sets";

const DEMO_SETS: StudySet[] = [
  {
    id: "demo-1",
    title: "Biology Basics",
    description: "Essential biology terms for beginners",
    emoji: "🧬",
    color: "indigo",
    createdAt: Date.now() - 86400000 * 3,
    lastStudied: Date.now() - 3600000,
    cards: [
      { id: "1", term: "Mitosis", definition: "The process of cell division that results in two identical daughter cells." },
      { id: "2", term: "Photosynthesis", definition: "The process by which green plants use sunlight, water, and CO₂ to produce oxygen and energy." },
      { id: "3", term: "DNA", definition: "Deoxyribonucleic acid — the molecule that carries genetic information." },
      { id: "4", term: "Osmosis", definition: "Movement of water through a semipermeable membrane from low to high solute concentration." },
      { id: "5", term: "Enzyme", definition: "A protein that acts as a biological catalyst, speeding up chemical reactions." },
      { id: "6", term: "Meiosis", definition: "Cell division producing four haploid cells — used in sexual reproduction." },
    ],
  },
  {
    id: "demo-2",
    title: "Spanish Vocabulary",
    description: "Common Spanish words and phrases",
    emoji: "🇪🇸",
    color: "orange",
    createdAt: Date.now() - 86400000,
    cards: [
      { id: "1", term: "Hola", definition: "Hello — a common greeting in Spanish." },
      { id: "2", term: "Gracias", definition: "Thank you — expressing gratitude." },
      { id: "3", term: "Por favor", definition: "Please — used when making a request." },
      { id: "4", term: "Buenos días", definition: "Good morning — a morning greeting." },
      { id: "5", term: "Buenas noches", definition: "Good night — an evening farewell." },
    ],
  },
  {
    id: "demo-3",
    title: "World Capitals",
    description: "Test your geography knowledge",
    emoji: "🌍",
    color: "teal",
    createdAt: Date.now() - 86400000 * 7,
    cards: [
      { id: "1", term: "France", definition: "Paris — located along the Seine river in north-central France." },
      { id: "2", term: "Japan", definition: "Tokyo — the most populous metropolitan area in the world." },
      { id: "3", term: "Brazil", definition: "Brasília — a planned city built in the 1950s as the new capital." },
      { id: "4", term: "Australia", definition: "Canberra — chosen as a compromise between Sydney and Melbourne." },
    ],
  },
];

export function getStudySets(): StudySet[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_SETS));
    return DEMO_SETS;
  }
  return JSON.parse(raw);
}

export function saveStudySets(sets: StudySet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
}

export function getStudySet(id: string): StudySet | undefined {
  return getStudySets().find((s) => s.id === id);
}

export function saveStudySet(set: StudySet): void {
  const sets = getStudySets();
  const idx = sets.findIndex((s) => s.id === set.id);
  if (idx >= 0) sets[idx] = set;
  else sets.unshift(set);
  saveStudySets(sets);
}

export function deleteStudySet(id: string): void {
  saveStudySets(getStudySets().filter((s) => s.id !== id));
}

export function updateLastStudied(id: string): void {
  const sets = getStudySets();
  const set = sets.find((s) => s.id === id);
  if (set) {
    set.lastStudied = Date.now();
    saveStudySets(sets);
  }
}

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
