import { GoogleGenAI, Type } from "@google/genai";

// Safely retrieve the API key, handling environments where process might be undefined
const getApiKey = () => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore error if process is not defined
  }
  return '';
};

const apiKey = getApiKey();

let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({ apiKey });
}

export interface GeneratedTileContent {
  description: string;
  emoji: string;
  suggestedLinks: { label: string; url: string }[];
}

export const generateTileContent = async (topic: string): Promise<GeneratedTileContent> => {
  if (!aiClient) {
    throw new Error("API Key not configured");
  }

  const prompt = `
    You are a helpful assistant for a bookmark manager app.
    The user wants to create a new category tile for: "${topic}".
    
    1. Write a short, punchy description (max 15 words).
    2. Pick a single relevant emoji.
    3. Suggest 3-5 high-quality, real, popular URLs related to this topic.
  `;

  try {
    const response = await aiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            emoji: { type: Type.STRING },
            suggestedLinks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  url: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    if (response.text) {
        return JSON.parse(response.text) as GeneratedTileContent;
    }
    throw new Error("No response text");

  } catch (error) {
    console.error("Gemini generation failed:", error);
    throw error;
  }
};

export const suggestLinksForTile = async (tileTitle: string, existingLinks: string[]): Promise<{ label: string; url: string }[]> => {
    if (!aiClient) {
        throw new Error("API Key not configured");
    }

    const prompt = `
      The user has a bookmark category called "${tileTitle}".
      They already have these links: ${existingLinks.join(', ')}.
      Suggest 3 NEW, distinct, high-quality links relevant to this category.
    `;
  
    try {
      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    label: { type: Type.STRING },
                    url: { type: Type.STRING }
                }
            }
          }
        }
      });
  
      if (response.text) {
          return JSON.parse(response.text);
      }
      return [];
    } catch (error) {
      console.error("Gemini suggestion failed:", error);
      return [];
    }
  };