
// Tetromino Types
export type Minos = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z' | null;

// The Grid is 20 rows x 10 cols
export type GridState = Minos[][];

export interface DecisionNode {
  id: string;
  frame: number;
  score: number; // 0-100 evaluation score
  type: 'actual' | 'ai-suggestion' | 'root';
  parentId: string | null;
  children: string[];
  boardState: GridState;
  description: string; // e.g., "T-Spin Double Setup"
  timestamp: string; // Display string e.g. "00:04"
}

export interface MoveReference {
  nodeId: string;
  description: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  referencedMove?: MoveReference; // Optional citation
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

export interface ReflectionLogItem {
  id: string;
  stage: 'Thought' | 'Action' | 'Reflection';
  content: string;
  timestamp: number;
}
