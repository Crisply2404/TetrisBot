import React, { createContext, useContext, useState, useEffect } from 'react';
import { DecisionNode, GridState, ChatMessage, ReflectionLogItem, Minos, ChatThread, MoveReference } from '../types';

interface ReplayContextType {
  fileLoaded: boolean;
  loadFile: (file: File) => void;
  activeNodeId: string;
  setActiveNodeId: (id: string) => void;
  nodes: Record<string, DecisionNode>;
  rootNodeId: string;
  currentGrid: GridState;
  ghostGrid: GridState | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  
  // Chat / Debate System
  threads: Record<string, ChatThread>;
  activeThreadId: string | null;
  createThread: (title?: string, startMessage?: ChatMessage) => string;
  switchThread: (threadId: string) => void;
  addMessage: (msg: ChatMessage) => void;
  messages: ChatMessage[]; // Computed property for current thread
  
  // References
  pendingReference: MoveReference | null;
  setPendingReference: (ref: MoveReference | null) => void;

  reflectionLogs: ReflectionLogItem[];
  addReflectionLog: (item: ReflectionLogItem) => void;
  isSimulating: boolean;
  setIsSimulating: (sim: boolean) => void;
}

const ReplayContext = createContext<ReplayContextType | undefined>(undefined);

// --- Mock Data Helpers ---
const createEmptyGrid = (): GridState => Array(20).fill(null).map(() => Array(10).fill(null));

const mockGrid = (filledRows: number): GridState => {
    const grid = createEmptyGrid();
    const colors: Minos[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    const wellX = 9; 
    for(let y = 19; y >= 20 - filledRows; y--) {
        for(let x = 0; x < 10; x++) {
            if (x !== wellX) {
                grid[y][x] = colors[(Math.abs(x + y)) % colors.length];
            }
        }
    }
    return grid;
};

// Generate a mock decision tree
const generateMockNodes = (): { nodes: Record<string, DecisionNode>, root: string } => {
    const rootId = 'node-0';
    const nodes: Record<string, DecisionNode> = {};
    
    // Create a linear "Actual" path
    for (let i = 0; i < 20; i++) {
        const id = `node-${i}`;
        // Randomly assign scores to simulate mistakes
        const isMistake = i === 4 || i === 12;
        const score = isMistake ? 45 : 70 + Math.floor(Math.random() * 25);
        
        nodes[id] = {
            id,
            frame: i * 60, 
            score: score,
            type: i === 0 ? 'root' : 'actual',
            parentId: i === 0 ? null : `node-${i-1}`,
            children: i < 19 ? [`node-${i+1}`] : [],
            boardState: mockGrid(2 + (i % 10)),
            description: isMistake ? `Move ${i + 1}: Inefficient Stack` : `Move ${i + 1}: Standard Drop`,
            timestamp: `0:${(i).toString().padStart(2, '0')}.000`,
        };

        // Add an AI branch at mistake nodes
        if (isMistake) {
            const aiId = `node-${i}-ai`;
            nodes[aiId] = {
                id: aiId,
                frame: i * 60,
                score: 95,
                type: 'ai-suggestion',
                parentId: `node-${i-1}`,
                children: [],
                boardState: mockGrid(5),
                description: "Better: T-Spin Double Setup",
                timestamp: `0:${(i).toString().padStart(2, '0')}.000`,
            };
            if(nodes[`node-${i-1}`]) {
                nodes[`node-${i-1}`].children.push(aiId);
            }
        }
    }
    
    return { nodes, root: rootId };
};

export const ReplayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fileLoaded, setFileLoaded] = useState(false);
  const [nodes, setNodes] = useState<Record<string, DecisionNode>>({});
  const [rootNodeId, setRootNodeId] = useState('');
  const [activeNodeId, setActiveNodeId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Chat State
  const [threads, setThreads] = useState<Record<string, ChatThread>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pendingReference, setPendingReference] = useState<MoveReference | null>(null);

  const [reflectionLogs, setReflectionLogs] = useState<ReflectionLogItem[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // Initialize default thread
  useEffect(() => {
      if (!activeThreadId && Object.keys(threads).length === 0) {
          const defaultId = 'thread-init';
          setThreads({
              [defaultId]: {
                  id: defaultId,
                  title: 'General Analysis',
                  messages: [{
                      id: 'init', 
                      role: 'assistant', 
                      content: 'Replay loaded. I am ready to debate your moves. Click "Discuss" on any move to start a specific topic.', 
                      timestamp: Date.now()
                  }],
                  createdAt: Date.now()
              }
          });
          setActiveThreadId(defaultId);
      }
  }, [activeThreadId, threads]);

  const loadFile = (file: File) => {
    setTimeout(() => {
        const { nodes: mockNodes, root } = generateMockNodes();
        setNodes(mockNodes);
        setRootNodeId(root);
        setActiveNodeId(root);
        setFileLoaded(true);
        addReflectionLog({
            id: Date.now().toString(),
            stage: 'Thought',
            content: 'Parsing .ttrm binary stream...',
            timestamp: Date.now()
        });
        setTimeout(() => {
             addReflectionLog({
                id: (Date.now() + 1).toString(),
                stage: 'Action',
                content: 'Identified key diverging paths.',
                timestamp: Date.now()
            });
        }, 800);
    }, 1000);
  };

  const createThread = (title: string = 'New Conversation', startMessage?: ChatMessage) => {
      const newId = `thread-${Date.now()}`;
      setThreads(prev => ({
          ...prev,
          [newId]: {
              id: newId,
              title,
              messages: startMessage ? [startMessage] : [],
              createdAt: Date.now()
          }
      }));
      setActiveThreadId(newId);
      return newId;
  };

  const switchThread = (threadId: string) => {
      if (threads[threadId]) setActiveThreadId(threadId);
  };

  const addMessage = (msg: ChatMessage) => {
      if (!activeThreadId) return;
      setThreads(prev => ({
          ...prev,
          [activeThreadId]: {
              ...prev[activeThreadId],
              messages: [...prev[activeThreadId].messages, msg]
          }
      }));
  };

  const addReflectionLog = (item: ReflectionLogItem) => {
      setReflectionLogs(prev => [item, ...prev]);
  };

  const currentGrid = nodes[activeNodeId]?.boardState || createEmptyGrid();
  
  const parentId = nodes[activeNodeId]?.parentId;
  let ghostGrid: GridState | null = null;
  if (parentId) {
      const siblings = nodes[parentId].children;
      const aiSiblingId = siblings.find(id => nodes[id].type === 'ai-suggestion');
      if (aiSiblingId && aiSiblingId !== activeNodeId) {
          ghostGrid = nodes[aiSiblingId].boardState;
      }
  }

  return (
    <ReplayContext.Provider value={{
      fileLoaded,
      loadFile,
      activeNodeId,
      setActiveNodeId,
      nodes,
      rootNodeId,
      currentGrid,
      ghostGrid,
      isPlaying,
      setIsPlaying,
      threads,
      activeThreadId,
      createThread,
      switchThread,
      messages: activeThreadId ? threads[activeThreadId].messages : [],
      addMessage,
      pendingReference,
      setPendingReference,
      reflectionLogs,
      addReflectionLog,
      isSimulating,
      setIsSimulating
    }}>
      {children}
    </ReplayContext.Provider>
  );
};

export const useReplay = () => {
  const context = useContext(ReplayContext);
  if (!context) throw new Error('useReplay must be used within a ReplayProvider');
  return context;
};
