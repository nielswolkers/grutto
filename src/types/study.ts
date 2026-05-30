export interface Flashcard {
  id: string;
  term: string;
  definition: string;
}

export interface StudySet {
  id: string;
  title: string;
  description: string;
  emoji: string;
  cards: Flashcard[];
  createdAt: number;
  lastStudied?: number;
  color: string;
  subjectId?: string;
  ownerId?: string;
  isOwner?: boolean;
}

export type StudyMode = "flashcards" | "quiz" | "learn" | "match";
