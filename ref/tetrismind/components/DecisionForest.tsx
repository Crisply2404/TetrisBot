import React from 'react';
import { useReplay } from '../context/ReplayContext';
import { DecisionNode } from '../types';
import TetrisBoard from './TetrisBoard';
import { GitCommit, AlertCircle, CheckCircle, MessageSquarePlus } from 'lucide-react';

const DecisionForest: React.FC = () => {
  const { nodes, activeNodeId, setActiveNodeId, createThread, setPendingReference } = useReplay();

  // Filter Logic: Show nodes that are AI suggestions OR have low scores (inefficiencies)
  // We also want to ensure we show the user's "bad move" if there is a corresponding AI move.
  const nodeList = (Object.values(nodes) as DecisionNode[])
    .filter(node => node.type === 'ai-suggestion' || node.score < 60)
    .sort((a, b) => a.frame - b.frame);

  const handleDiscuss = (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      const node = nodes[nodeId];
      // Set as pending reference (citation)
      setPendingReference({
          nodeId: node.id,
          description: node.description,
          timestamp: node.timestamp
      });
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Decision Forest</h2>
            <p className="text-xs text-gray-500 mt-1">Key moments & inefficiencies</p>
        </div>
        <span className="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-600 font-mono">
            {nodeList.length} Events
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {nodeList.length === 0 && (
            <div className="text-center p-8 text-gray-400 text-sm">
                No significant inefficiencies found. Clean game!
            </div>
        )}

        {nodeList.map((node) => {
          const isActive = activeNodeId === node.id;
          const isAI = node.type === 'ai-suggestion';
          
          return (
            <div 
              key={node.id}
              onClick={() => setActiveNodeId(node.id)}
              className={`
                relative flex items-start gap-4 p-3 rounded-lg border transition-all cursor-pointer group
                ${isActive ? 'border-black bg-gray-50 ring-1 ring-black' : 'border-gray-200 hover:border-gray-400'}
                ${isAI ? 'bg-purple-50/30' : ''}
              `}
            >
              {/* Node Visual */}
              <div className="flex-shrink-0 relative">
                  <TetrisBoard grid={node.boardState} size="sm" />
                  {/* Status Indicator Icon Overlay */}
                  <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-gray-100">
                      {isAI ? (
                          <CheckCircle className="w-4 h-4 text-purple-600 fill-purple-100" />
                      ) : (
                          <AlertCircle className="w-4 h-4 text-red-500 fill-red-100" />
                      )}
                  </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 pt-1 flex flex-col h-full justify-between">
                <div>
                    <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-mono text-gray-500">{node.timestamp}</span>
                    <div className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                        node.score >= 80 ? 'bg-green-100 text-green-700' : 
                        node.score < 60 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                        {node.score}/100
                    </div>
                    </div>
                    
                    <h3 className={`text-sm font-semibold truncate mb-1 ${isAI ? 'text-purple-700' : 'text-gray-900'}`}>
                        {isAI && <GitCommit className="inline w-3 h-3 mr-1"/>}
                        {node.description}
                    </h3>

                    <p className="text-xs text-gray-500 line-clamp-2">
                        {isAI ? 'AI suggests this path for better T-Spin setup.' : 'Detected inefficient block placement.'}
                    </p>
                </div>

                {/* Quick Action Buttons */}
                <div className="mt-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={(e) => handleDiscuss(e, node.id)}
                        className="text-xs flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 rounded hover:bg-black hover:text-white transition-colors shadow-sm"
                        title="Discuss this move"
                    >
                        <MessageSquarePlus className="w-3 h-3" />
                        Discuss
                    </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DecisionForest;