export interface ModerationResult {
  status: 'safe' | 'warning' | 'block';
  reason?: string;
}

async function callAI(messages: any[], model: string = "google/gemini-2.0-flash-001", responseFormat?: any) {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      model,
      response_format: responseFormat
    })
  });
  
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "AI Stream Error");
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function moderateMessage(text: string): Promise<ModerationResult> {
  try {
    const content = await callAI([
      {
        role: "system",
        content: "Audit the following message for safety in a college-age dating/chat app. Return JSON with 'status' (safe, warning, block) and 'reason'."
      },
      {
        role: "user",
        content: text
      }
    ], "google/gemini-2.0-flash-001", { type: "json_object" });

    const result = JSON.parse(content || '{}');
    return {
      status: result.status || 'safe',
      reason: result.reason
    };
  } catch (error) {
    console.error("AI Moderation Error:", error);
    return { status: 'safe' };
  }
}

export async function matchProfiles(user1: any, user2: any): Promise<number> {
  try {
    const content = await callAI([
      {
        role: "system",
        content: "Calculate a matching score (0-100) between two user profiles. Return JSON with 'score' key."
      },
      {
        role: "user",
        content: `Profile 1: Bio: "${user1.bio}", Interests: ${JSON.stringify(user1.interests)}
        Profile 2: Bio: "${user2.bio}", Interests: ${JSON.stringify(user2.interests)}`
      }
    ], "google/gemini-2.0-flash-001", { type: "json_object" });

    const result = JSON.parse(content || '{}');
    return result.score || 0;
  } catch (error) {
    console.error("AI Matching Error:", error);
    return 0;
  }
}

export async function generateIcebreaker(interests: string[]): Promise<string> {
  try {
    return await callAI([
      {
        role: "system",
        content: "Generate 1 creative, Gen-Z friendly icebreaker message based on shared interests."
      },
      {
        role: "user",
        content: interests.join(', ')
      }
    ]);
  } catch (error) {
    console.error("AI Icebreaker Error:", error);
    return "Hey! How's it going?";
  }
}

export async function generateSuggestions(messages: any[]): Promise<string[]> {
  try {
    const chatHistory = messages
      .slice(-3)
      .map(m => `${m.senderId === 'me' ? 'User' : 'Match'}: ${m.text}`)
      .join('\n');

    const content = await callAI([
      {
        role: "system",
        content: "Suggest 3 short, natural replies to the chat. No inappropriate content. Return JSON list 'suggestions'."
      },
      {
        role: "user",
        content: chatHistory
      }
    ], "google/gemini-2.0-flash-001", { type: "json_object" });

    const result = JSON.parse(content || '{}');
    return result.suggestions || [];
  } catch (error) {
    console.error("AI Suggestion Error:", error);
    return [];
  }
}
