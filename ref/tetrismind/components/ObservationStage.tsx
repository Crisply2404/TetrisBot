import React, { useState, useEffect, useRef } from 'react';
import { useReplay } from '../context/ReplayContext';
import { DecisionNode } from '../types';
import TetrisBoard from './TetrisBoard';
import { Play, Pause, SkipBack, SkipForward, AlertTriangle, Edit3 } from 'lucide-react';

const ObservationStage: React.FC = () => {
  const { currentGrid, ghostGrid, isPlaying, setIsPlaying, activeNodeId, nodes, setActiveNodeId } = useReplay();
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const currentNode = nodes[activeNodeId];
  
  // Flatten nodes to array for indexing
  const sortedNodeIds = Object.keys(nodes).sort((a, b) => nodes[a].frame - nodes[b].frame);
  const currentIndex = sortedNodeIds.indexOf(activeNodeId);
  const totalFrames = sortedNodeIds.length;

  useEffect(() => {
    if (isEditingTime && inputRef.current) {
        inputRef.current.focus();
    }
  }, [isEditingTime]);

  const handleNext = () => {
    if (currentIndex < totalFrames - 1) {
        setActiveNodeId(sortedNodeIds[currentIndex + 1]);
    }
  };

  const handlePrev = () => {
      if (currentIndex > 0) {
        setActiveNodeId(sortedNodeIds[currentIndex - 1]);
      }
  };

  const handleTimeClick = () => {
      if (currentNode) {
          setTimeInput(currentNode.timestamp);
          setIsEditingTime(true);
      }
  };

  const handleTimeSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // Simple parse logic: Look for matching timestamp in nodes or closest
      // Input format expected: m:ss.ms
      // Ideally convert input to ms, find closest node frame
      const targetNode = (Object.values(nodes) as DecisionNode[]).find(n => n.timestamp.startsWith(timeInput));
      if (targetNode) {
          setActiveNodeId(targetNode.id);
      } else {
          alert("Exact timestamp not found in replay data.");
      }
      setIsEditingTime(false);
  };

  return (
    <div className="h-full bg-gray-50 flex flex-col items-center relative overflow-hidden">
      
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

      {/* Header Info */}
      <div className="w-full p-4 flex justify-between items-center z-10">
         <div>
             <h1 className="text-xl font-bold tracking-tight text-gray-900">Observation Stage</h1>
             <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-500 font-mono">Frame: {currentNode?.frame || 0}</span>
                <span className="text-gray-300">|</span>
                
                {/* Editable Time Display */}
                {isEditingTime ? (
                    <form onSubmit={handleTimeSubmit}>
                        <input 
                            ref={inputRef}
                            type="text" 
                            className="text-sm font-mono bg-white border border-blue-500 rounded px-1 w-24 outline-none"
                            value={timeInput}
                            onChange={(e) => setTimeInput(e.target.value)}
                            onBlur={() => setIsEditingTime(false)}
                        />
                    </form>
                ) : (
                    <button 
                        onClick={handleTimeClick}
                        className="text-sm text-gray-500 font-mono hover:bg-gray-200 px-1 rounded transition-colors flex items-center gap-1 group"
                        title="Click to jump to time"
                    >
                        {currentNode?.timestamp || '0:00.000'}
                        <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                    </button>
                )}
             </div>
         </div>
         
         {isPlaying && (
             <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold animate-pulse">
                 <div className="w-2 h-2 bg-red-600 rounded-full" />
                 REPLAYING
             </div>
         )}
      </div>

      {/* Main Board Container */}
      <div className="flex-1 flex items-center justify-center p-8 z-10">
          <div className="relative shadow-2xl shadow-gray-200/50 rounded-lg p-2 bg-white border border-gray-100">
             <TetrisBoard 
                grid={currentGrid} 
                ghostGrid={ghostGrid}
                size="lg" 
             />
             
             {/* Overlay for "Miss" */}
             {currentNode && currentNode.score < 50 && (
                 <div className="absolute top-4 right-[-140px] bg-red-50 border border-red-200 p-3 rounded-lg w-32 shadow-sm animate-bounce">
                     <div className="flex items-center text-red-600 font-bold text-sm mb-1">
                         <AlertTriangle className="w-4 h-4 mr-1"/> BLUNDER
                     </div>
                     <p className="text-xs text-red-800 leading-snug">
                         Missed a clean downstack opportunity.
                     </p>
                 </div>
             )}
          </div>
      </div>

      {/* Controls */}
      <div className="w-full bg-white border-t border-gray-200 p-4 z-20">
          <div className="max-w-md mx-auto flex flex-col gap-4">
              
              {/* Interactive Progress Bar */}
              <div className="relative w-full h-6 group cursor-pointer flex items-center">
                  <div className="absolute w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="bg-black h-full transition-all duration-100 ease-linear" 
                        style={{ width: `${(currentIndex / totalFrames) * 100}%` }} 
                      />
                  </div>
                  {/* Scrubber Knob */}
                  <div 
                    className="absolute h-3 w-1 bg-black rounded-full transition-all duration-100 ease-linear shadow-sm"
                    style={{ left: `${(currentIndex / totalFrames) * 100}%` }}
                  />
                  
                  {/* Tooltip on hover would go here */}
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-center gap-6">
                  <button onClick={handlePrev} className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 rounded-full transition-colors">
                      <SkipBack className="w-6 h-6" />
                  </button>
                  
                  <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform active:scale-95"
                  >
                      {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-1" />}
                  </button>

                  <button onClick={handleNext} className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 rounded-full transition-colors">
                      <SkipForward className="w-6 h-6" />
                  </button>
              </div>
          </div>
      </div>

    </div>
  );
};

export default ObservationStage;