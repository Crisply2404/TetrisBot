import React, { useState, useEffect, useRef } from 'react';
import { useReplay } from '../context/ReplayContext';
import { ChatThread } from '../types';
import { Send, Terminal, MessageSquare, Plus, ChevronDown, ChevronRight, Hash, Quote } from 'lucide-react';
import { generateCoachResponse } from '../services/geminiService';

const DebateHub: React.FC = () => {
  const { 
      messages, 
      addMessage, 
      reflectionLogs, 
      addReflectionLog, 
      isSimulating, 
      setIsSimulating, 
      threads,
      activeThreadId,
      switchThread,
      createThread,
      pendingReference,
      setPendingReference
  } = useReplay();
  
  const [inputText, setInputText] = useState('');
  const [showThreadList, setShowThreadList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom effect
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [reflectionLogs]);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg = { 
        id: Date.now().toString(), 
        role: 'user', 
        content: inputText, 
        timestamp: Date.now(),
        referencedMove: pendingReference || undefined
    };
    
    addMessage(userMsg as any);
    setInputText('');
    setPendingReference(null); // Clear reference after sending
    setIsSimulating(true);

    addReflectionLog({
        id: Date.now().toString(),
        stage: 'Thought',
        content: pendingReference 
            ? `Contextualizing query with Frame ${pendingReference.timestamp}...`
            : `Analyzing user intent: "${inputText.substring(0, 20)}..."`,
        timestamp: Date.now()
    });

    // Simulate RAG lookup time
    setTimeout(async () => {
        const boardSummary = pendingReference 
            ? `User is asking about ${pendingReference.description} at ${pendingReference.timestamp}.` 
            : "General board state analysis.";

        const responseText = await generateCoachResponse([...messages, userMsg] as any, boardSummary);
        
        addMessage({
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: responseText,
            timestamp: Date.now()
        });
        
        addReflectionLog({
            id: (Date.now() + 3).toString(),
            stage: 'Reflection',
            content: 'Response generated.',
            timestamp: Date.now()
        });

        setIsSimulating(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
      }
  };

  const handleNewChat = () => {
      createThread(`Analysis ${Object.keys(threads).length + 1}`);
      setShowThreadList(false);
  };

  const activeThread = activeThreadId ? threads[activeThreadId] : null;

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      
      {/* Top: Reflection Log (The "Brain") */}
      <div className="h-1/3 bg-[#0a0a0a] text-green-400 font-mono text-xs p-4 flex flex-col border-b border-gray-800">
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-800 text-gray-400 uppercase tracking-widest">
            <Terminal className="w-3 h-3" />
            <span>Agent Kernel</span>
            {isSimulating && <span className="ml-auto animate-pulse text-yellow-500">PROCESSING...</span>}
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
            {reflectionLogs.map((log) => (
                <div key={log.id} className="opacity-90">
                    <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString([], {hour12: false, second:'2-digit'})}]</span>
                    <span className={`mx-2 font-bold ${
                        log.stage === 'Thought' ? 'text-blue-400' : 
                        log.stage === 'Action' ? 'text-yellow-400' : 'text-purple-400'
                    }`}>
                        {log.stage}&gt;
                    </span>
                    <span className="text-gray-300">{log.content}</span>
                </div>
            ))}
            <div ref={logEndRef} />
        </div>
      </div>

      {/* Thread Header / Toggle */}
      <div className="h-12 border-b border-gray-200 bg-white flex items-center justify-between px-4 shadow-sm z-20 relative">
          <button 
            onClick={() => setShowThreadList(!showThreadList)}
            className="flex items-center gap-2 font-semibold text-gray-800 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
          >
              <MessageSquare className="w-4 h-4" />
              <span className="truncate max-w-[150px]">{activeThread?.title || 'Chat'}</span>
              {showThreadList ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          </button>
          
          <button 
            onClick={handleNewChat}
            className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600"
            title="New Chat"
          >
              <Plus className="w-5 h-5" />
          </button>

          {/* Thread List Dropdown */}
          {showThreadList && (
              <div className="absolute top-full left-0 w-full bg-white border-b border-gray-200 shadow-lg py-2 max-h-60 overflow-y-auto">
                  {(Object.values(threads) as ChatThread[]).map(thread => (
                      <button
                        key={thread.id}
                        onClick={() => { switchThread(thread.id); setShowThreadList(false); }}
                        className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 hover:bg-gray-50 ${activeThreadId === thread.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                      >
                          <Hash className="w-4 h-4 opacity-50" />
                          <div>
                              <div className="font-medium">{thread.title}</div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                  {new Date(thread.createdAt).toLocaleTimeString()}
                              </div>
                          </div>
                      </button>
                  ))}
              </div>
          )}
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      {/* Referenced Move Pill */}
                      {msg.referencedMove && (
                          <div className={`
                             mb-1 text-xs px-2 py-1 rounded-md flex items-center gap-1 opacity-80
                             ${msg.role === 'user' ? 'bg-black/10 text-black' : 'bg-gray-200 text-gray-600'}
                          `}>
                              <Quote className="w-3 h-3" />
                              Re: {msg.referencedMove.description} ({msg.referencedMove.timestamp})
                          </div>
                      )}

                      <div className={`
                          max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm
                          ${msg.role === 'user' 
                              ? 'bg-black text-white rounded-br-none' 
                              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'}
                      `}>
                          {msg.content}
                      </div>
                  </div>
              ))}
              {isSimulating && (
                  <div className="flex justify-start">
                      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75" />
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150" />
                      </div>
                  </div>
              )}
              <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-gray-200">
              {/* Citation Preview */}
              {pendingReference && (
                  <div className="mb-2 flex items-center justify-between bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg text-xs text-blue-700">
                      <div className="flex items-center gap-2">
                          <Quote className="w-3 h-3" />
                          <span className="font-mono">{pendingReference.timestamp}</span>
                          <span className="font-semibold">{pendingReference.description}</span>
                      </div>
                      <button onClick={() => setPendingReference(null)} className="hover:text-blue-900 font-bold px-2">×</button>
                  </div>
              )}

              <div className="relative">
                  <input
                    type="text"
                    className="w-full bg-gray-100 border-0 rounded-lg pl-4 pr-12 py-3 focus:ring-2 focus:ring-black focus:bg-white transition-all text-sm"
                    placeholder="Debate this move..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSimulating}
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || isSimulating}
                    className="absolute right-2 top-2 p-1.5 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                      <Send className="w-4 h-4" />
                  </button>
              </div>
          </div>
      </div>

    </div>
  );
};

export default DebateHub;