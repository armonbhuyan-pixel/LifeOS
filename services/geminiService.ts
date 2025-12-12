
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AppFeature, ChatMessage } from "../types";

export const checkApiKey = (): boolean => {
  return !!process.env.API_KEY && process.env.API_KEY.length > 0;
};

// --- Model Selection Logic ---
const getModelConfig = (featureId: string, hasFile: boolean) => {
    // Complex features needing deep reasoning (Thinking Mode)
    // 2: Kidney Buddy, medical-lens: Medical Lens
    const complexIds = ['2', 'medical-lens']; 
    
    // If a file is attached (image or PDF), use gemini-3-pro-preview
    if (hasFile) {
        return { 
            model: 'gemini-3-pro-preview',
            thinkingBudget: 0 
        };
    }

    // "You MUST add thinking mode... gemini-3-pro-preview ... thinkingBudget to 32768"
    if (complexIds.includes(featureId)) {
        return {
            model: 'gemini-3-pro-preview',
            thinkingBudget: 32768
        };
    }

    // "You MUST add low-latency responses... using model gemini-2.5-flash-lite"
    return {
        model: 'gemini-2.5-flash-lite',
        thinkingBudget: 0
    };
};

export const interactWithFeature = async (
    feature: AppFeature, 
    history: ChatMessage[], 
    currentMessage: string,
    currentFile?: { data: string; mimeType: string } // Updated to support generic files
): Promise<{ text: string; image?: string }> => {
    if (!checkApiKey()) throw new Error("API Key missing");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { model, thinkingBudget } = getModelConfig(feature.id, !!currentFile);

    // Prepare History
    const formattedHistory = history.map(msg => {
      const parts: any[] = [{ text: msg.text }];
      if (msg.image) {
        parts.unshift({
           inlineData: {
             mimeType: msg.mimeType || "image/jpeg", // Default to jpeg if undefined for backward compatibility
             data: msg.image
           }
        });
      }
      return {
        role: msg.role,
        parts: parts
      };
    });

    const config: any = {
        systemInstruction: feature.systemInstruction,
    };

    // Apply thinking config if budget > 0
    if (thinkingBudget > 0) {
        config.thinkingConfig = { thinkingBudget };
    }

    const chat = ai.chats.create({
        model,
        config,
        history: formattedHistory
    });

    // Prepare current message parts
    const messageParts: any[] = [{ text: currentMessage }];
    
    if (currentFile) {
        messageParts.unshift({
            inlineData: {
                mimeType: currentFile.mimeType,
                data: currentFile.data
            }
        });
    }

    const result = await chat.sendMessage({ 
        message: messageParts
    });
    
    return { text: result.text || '' };
};

// --- Audio Services ---

export const transcribeAudio = async (audioBase64: string, mimeType: string): Promise<string> => {
    if (!checkApiKey()) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // "You MUST add audio transcription ... using model gemini-2.5-flash"
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: audioBase64
                    }
                },
                { text: "Transcribe this audio strictly. Do not add any conversational filler." }
            ]
        }
    });

    return response.text || "";
};

export const generateSpeech = async (text: string): Promise<string | undefined> => {
    if (!checkApiKey()) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // "You MUST add TTS ... using model gemini-2.5-flash-preview-tts"
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: {
            parts: [{ text: text }]
        },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        }
    });

    // Returns raw PCM base64
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
