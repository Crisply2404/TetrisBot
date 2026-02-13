import React from 'react';
import { ReplayProvider, useReplay } from './context/ReplayContext';
import DecisionForest from './components/DecisionForest';
import ObservationStage from './components/ObservationStage';
import DebateHub from './components/DebateHub';
import FileUploadOverlay from './components/FileUploadOverlay';
import { Settings, User, Box } from 'lucide-react';

const AppContent: React.FC = () => {
  const { fileLoaded } = useReplay();

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden text-gray-900 font-sans">
       {/* Navbar */}
       <header className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0 z-40">
           <div className="flex items-center gap-2">
               <div className="w-8 h-8 bg-black text-white flex items-center justify-center rounded-lg font-bold text-lg">T</div>
               <span className="font-bold text-lg tracking-tight">TetrisMind</span>
           </div>
           
           <div className="flex items-center gap-4 text-sm font-medium text-gray-600">
               <button className="hover:text-black flex items-center gap-1 transition-colors">
                   <Box className="w-4 h-4" /> 
                   <span>Knowledge Base</span>
               </button>
               <button className="hover:text-black flex items-center gap-1 transition-colors">
                   <Settings className="w-4 h-4" />
               </button>
               <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
                   <User className="w-4 h-4" />
               </div>
           </div>
       </header>

       {/* Main Layout */}
       <div className="flex-1 flex overflow-hidden relative">
          
          {/* Overlay for file upload */}
          {!fileLoaded && <FileUploadOverlay />}

          {/* Left Column: Decision Forest */}
          <div className="w-[30%] min-w-[300px] h-full">
              <DecisionForest />
          </div>

          {/* Middle Column: Observation Stage */}
          <div className="w-[40%] min-w-[400px] h-full border-r border-gray-200">
              <ObservationStage />
          </div>

          {/* Right Column: Debate Hub */}
          <div className="w-[30%] min-w-[300px] h-full">
              <DebateHub />
          </div>
       </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ReplayProvider>
      <AppContent />
    </ReplayProvider>
  );
};

export default App;