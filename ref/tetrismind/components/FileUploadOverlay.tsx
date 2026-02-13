import React, { useState } from 'react';
import { useReplay } from '../context/ReplayContext';
import { UploadCloud, FileType } from 'lucide-react';

const FileUploadOverlay: React.FC = () => {
  const { loadFile } = useReplay();
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFakeUpload = () => {
      // Mock file for demo
      const file = new File(["mock"], "replay.ttrm");
      loadFile(file);
  }

  return (
    <div 
      className={`absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center transition-all duration-500`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div 
        className={`
            w-[600px] h-[400px] border-4 border-dashed rounded-3xl flex flex-col items-center justify-center
            transition-all duration-300
            ${isDragging ? 'border-blue-500 bg-blue-50 scale-105' : 'border-gray-300 bg-gray-50 hover:border-gray-400'}
        `}
      >
          <div className="bg-white p-6 rounded-full shadow-lg mb-6">
             <UploadCloud className={`w-12 h-12 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
          </div>
          
          <h1 className="text-3xl font-bold text-gray-800 mb-2">TetrisMind</h1>
          <p className="text-gray-500 mb-8 text-lg">Drop your .ttrm or .ttr file to start analysis</p>
          
          <div className="flex gap-4">
              <button 
                onClick={handleFakeUpload}
                className="px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors shadow-lg flex items-center gap-2"
              >
                  <FileType className="w-4 h-4"/> Load Demo Replay
              </button>
          </div>
          
          <p className="mt-8 text-xs text-gray-400">Supports TETR.IO replay format (Protocol V1/V2)</p>
      </div>
    </div>
  );
};

export default FileUploadOverlay;