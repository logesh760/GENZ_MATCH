import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface ModerationResult {
  status: 'safe' | 'warning' | 'block';
  reason?: string;
}

export async function moderateMessage(text: string): Promise<ModerationResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Audit the following message for safety in a college-age dating/chat app. 
      Check for abusive language, spam, inappropriate/sexual content, or harm.
      Message: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ["safe", "warning", "block"] },
            reason: { type: Type.STRING }
          },
          required: ["status"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return {
      status: result.status || 'safe',
      reason: result.reason
    };
  } catch (error) {
    console.error("AI Moderation Error:", error);
    return { status: 'safe' }; // Fail-safe
  }
}

export async function matchProfiles(user1: any, user2: any): Promise<number> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Calculate a matching score (0-100) between two user profiles for a social app.
      Profile 1: Bio: "${user1.bio}", Interests: ${JSON.stringify(user1.interests)}
      Profile 2: Bio: "${user2.bio}", Interests: ${JSON.stringify(user2.interests)}
      Consider semantic similarity, shared interests, and overall vibe.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER }
          },
          required: ["score"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return result.score || 0;
  } catch (error) {
    console.error("AI Matching Error:", error);
    return 0;
  }
}

export async function generateIcebreaker(interests: string[]): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a creative, light-hearted icebreaker message for two people who share these interests: ${interests.join(', ')}. 
      Keep it casual and Gen-Z friendly.`,
    });

    return response.text || "Hey! What's up?";
  } catch (error) {
    console.error("AI Icebreaker Error:", error);
    return "Hey! How's it going?";
  }
}

export async function generateSuggestions(messages: any[]): Promise<string[]> {
  try {
    const chatHistory = messages
      .slice(-3)
      .map(m => `Sender_${m.senderId === 'me' ? 'A' : 'B'}: ${m.text}`)
      .join('\n');

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a helpful chat assistant for a secure college dating/chat app.
      Based on the conversation below, suggest 3 short, natural, and friendly replies.
      
      Rules:
      - Keep replies under 15 words
      - Make it casual and human-like
      - No offensive or inappropriate content
      - Match the language of the conversation. If the conversation is in Tamil, reply in Tamil (Tanglish or Tamil script).
      
      Conversation:
      ${chatHistory}
      
      Return as a JSON list of 3 strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["suggestions"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return result.suggestions || [];
  } catch (error) {
    console.error("AI Suggestion Error:", error);
    return [];
  }
}
