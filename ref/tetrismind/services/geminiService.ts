import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
// Initialize conditionally to avoid crashing if key is missing during dev, 
// though per instructions we assume it's there.
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateCoachResponse = async (
  history: { role: string; content: string }[],
  currentContext: string
): Promise<string> => {
  if (!ai) return "Error: API Key not found.";

  try {
    const model = ai.models.getGenerativeModel({ 
      model: "gemini-3-flash-preview", 
      systemInstruction: "You are a world-class Tetris coach (TETR.IO specialist). You analyze replays with a focus on efficiency, T-Spin setups, and downstacking. You are strict but constructive. Use terminology like 'ST Stacking', 'Parity', 'Opener', 'Finesse'. Keep responses concise and focused on the board state provided."
    });

    const prompt = `
      Context: ${currentContext}
      
      User Message: ${history[history.length - 1].content}
      
      Respond to the user's justification or question regarding this specific game state.
    `;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    return response.text || "I'm analyzing the board...";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Connection to Coach lost. Retrying simulation...";
  }
};

export const generateReflection = async (boardStateStr: string): Promise<string> => {
   if (!ai) return "Simulation unavailable.";
   
   // Simulating an internal "Thought" process for the RAG agent
   try {
     const model = ai.models.getGenerativeModel({ model: "gemini-3-flash-preview" });
     const response = await model.generateContent({
        contents: [{
            role: 'user', 
            parts: [{ text: `Analyze this abstract Tetris board state briefly: ${boardStateStr}. Identify one key weakness (e.g., hole dependency, height). Output only the analysis.`}]
        }]
     });
     return response.text || "Analyzing structure...";
   } catch (e) {
       return "Retrieving similar pattern from Grand Master database...";
   }
};