export type CardType = 'note' | 'image' | 'link' | 'todo';

export interface Position {
  x: number;
  y: number;
}

export interface CardBase {
  id: string;
  type: CardType;
  position: Position;
  width?: number;
  height?: number;
  zIndex: number;
}

export interface NoteCard extends CardBase {
  type: 'note';
  title?: string;
  content: string;
  color?: string;
}

export interface ImageCard extends CardBase {
  type: 'image';
  src: string;
  alt?: string;
}

export interface LinkCard extends CardBase {
  type: 'link';
  url: string;
  title?: string;
  description?: string;
  favicon?: string;
  image?: string;
}

export interface TodoCard extends CardBase {
  type: 'todo';
  title?: string;
  items: TodoItem[];
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Connection {
  id: string;
  fromCardId: string;
  toCardId: string;
}

export type Card = NoteCard | ImageCard | LinkCard | TodoCard;

export interface Board {
  id: string;
  name: string;
  cards: Card[];
  connections: Connection[];
  parentId?: string | null;
}
