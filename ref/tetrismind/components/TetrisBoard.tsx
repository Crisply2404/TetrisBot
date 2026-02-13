import React from 'react';
import { GridState } from '../types';

interface TetrisBoardProps {
  grid: GridState;
  size?: 'sm' | 'lg'; // Small for tree, Large for main stage
  ghostGrid?: GridState | null;
  className?: string;
}

// Four.lol / Guideline inspired flat colors (less neon, more pastel/clean)
const MINO_COLORS: Record<string, string> = {
  I: 'bg-[#42afe1]', // Light Blue
  J: 'bg-[#1983bf]', // Darker Blue
  L: 'bg-[#f48924]', // Orange
  O: 'bg-[#ffc82e]', // Yellow
  S: 'bg-[#85c636]', // Green
  T: 'bg-[#c0469d]', // Purple
  Z: 'bg-[#f04e57]', // Red
};

// Ghost colors using opacity
const GHOST_COLORS: Record<string, string> = {
  I: 'bg-[#42afe1]/40',
  J: 'bg-[#1983bf]/40',
  L: 'bg-[#f48924]/40',
  O: 'bg-[#ffc82e]/40',
  S: 'bg-[#85c636]/40',
  T: 'bg-[#c0469d]/40',
  Z: 'bg-[#f04e57]/40',
};

const TetrisBoard: React.FC<TetrisBoardProps> = ({ grid, size = 'lg', ghostGrid, className = '' }) => {
  // Sizing:
  // lg: 320px width x 640px height (32px cells)
  // sm: 80px width x 160px height (8px cells)
  // Aspect ratio is always 1:2
  const dimensionsClass = size === 'lg' ? 'w-[320px] h-[640px]' : 'w-[80px] h-[160px]';

  return (
    <div className={`relative inline-block bg-white border border-gray-100 p-1 rounded-sm shrink-0 ${className}`}>
      <div 
        className={`grid grid-cols-10 gap-0 bg-white ${dimensionsClass}`}
        style={{
             // Ensure exactly 20 rows are rendered
             gridTemplateRows: 'repeat(20, minmax(0, 1fr))'
        }}
      >
        {grid.map((row, y) => (
          row.map((cell, x) => {
             let cellClass = '';
             let isGhost = false;

             if (cell) {
                 cellClass = MINO_COLORS[cell];
             } else if (ghostGrid && ghostGrid[y][x]) {
                 cellClass = GHOST_COLORS[ghostGrid[y][x] as string];
                 isGhost = true;
             }

             return (
               <div 
                key={`${y}-${x}`} 
                className={`
                  w-full h-full 
                  flex items-center justify-center
                  ${cellClass}
                  /* Subtle grid lines for empty cells to match four.lol style */
                  ${!cell && !isGhost ? 'border-[0.5px] border-gray-100' : ''} 
                `}
               >
               </div>
             );
          })
        ))}
      </div>
    </div>
  );
};

export default TetrisBoard;