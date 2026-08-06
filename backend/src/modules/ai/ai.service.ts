import { env } from '../../config/env';
import { GROQ_API_URL, GROQ_MODEL } from '../../common/constants';
import { maskPII, AI_DISCLAIMERS, PRIVACY_CONFIG } from './privacy-config';

// Moved from services/aiService.ts. Behavior is unchanged -- only the API
// key/URL/model went from being re-declared per file to the shared
// config/env.ts and common/constants.ts.

interface LogAnalysis {
  tasks_identified: string[];
  sentiment_score: number;
  summary: string;
  bullet_points: string[];
  achievements: string[];
  blockers_detected: string[];
  quality_score: number;
}

const callGroq = async (messages: { role: string; content: string }[], options: { temperature?: number; max_tokens?: number } = {}) => {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 500,
    }),
  });

  const data = (await response.json()) as any;
  return data.choices[0].message.content as string;
};

export const analyzeLog = async (entryText: string, userContext: any): Promise<LogAnalysis> => {
  const sanitizedText = maskPII(entryText);

  const prompt = `Analyze this work log and extract key information.

Work Log:
"${sanitizedText}"

Return ONLY valid JSON:
{
  "tasks_identified": ["task 1", "task 2"],
  "sentiment_score": -1 to 1,
  "summary": "1 sentence summary",
  "bullet_points": ["key point 1", "key point 2", "key point 3"],
  "achievements": ["achievement 1"],
  "blockers_detected": ["blocker if any"],
  "quality_score": 0-10
}

Note: ${AI_DISCLAIMERS.ANALYSIS}`;

  try {
    const content = await callGroq([{ role: 'user', content: prompt }], { max_tokens: 800 });
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('AI Analysis Error:', error);
    return {
      tasks_identified: [],
      sentiment_score: 0,
      summary: entryText.substring(0, 100) + '...',
      bullet_points: [],
      achievements: [],
      blockers_detected: [],
      quality_score: 5,
    };
  }
};

export const generateMentorAdvice = async (blockerText: string, chatHistory: any[], projectContext: string): Promise<string> => {
  const prompt = `Provide brief technical advice (2-3 sentences max).

Blocker:
${blockerText}

Recent Chat:
${chatHistory.slice(-3).map((m) => `${m.username}: ${m.message_text}`).join('\n')}

Advice:`;

  try {
    const content = await callGroq([{ role: 'user', content: prompt }], { max_tokens: 200 });
    return content || 'Unable to generate advice at this time.';
  } catch (error) {
    console.error('AI Mentor Error:', error);
    return 'I apologize, but I encountered an error generating advice. Please try again.';
  }
};

export const analyzeProjectWithAI = async (projectName: string, description: string, requirements?: string) => {
  const prompt = `You are a project planning AI. Analyze this project and suggest tasks.

Project: ${projectName}
Description: ${description}
${requirements ? `Requirements: ${requirements}` : ''}

Return ONLY valid JSON:
{
  "suggested_tasks": [{"title": "task", "description": "details", "priority": "high/medium/low", "estimated_hours": 4}],
  "tech_stack": ["technologies"],
  "risks": ["potential risks"],
  "timeline_estimate": "X weeks",
  "team_size_recommendation": 3
}`;

  try {
    const content = await callGroq([{ role: 'user', content: prompt }], { max_tokens: 1500 });
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('AI Project Analysis Error:', error);
    return {
      suggested_tasks: [],
      tech_stack: [],
      risks: ['Unable to analyze at this time'],
      timeline_estimate: 'Unknown',
      team_size_recommendation: 1,
    };
  }
};

export const generateLogSuggestions = async (recentLogs: string[], currentTasks: any[]) => {
  const prompt = `Based on recent work, suggest 3 brief writing prompts for today's log.

Recent Work:
${recentLogs.slice(0, 2).join('\n')}

Return ONLY valid JSON:
{
  "suggestions": ["brief suggestion 1", "brief suggestion 2", "brief suggestion 3"],
  "focus_areas": ["area 1", "area 2"],
  "productivity_tip": "short tip"
}`;

  try {
    const content = await callGroq([{ role: 'user', content: prompt }], { temperature: 0.8, max_tokens: 300 });
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('AI Suggestions Error:', error);
    return {
      suggestions: ['Describe your main task', 'Note any challenges', 'List accomplishments'],
      focus_areas: ['Tasks', 'Progress'],
      productivity_tip: 'Be specific and concise',
    };
  }
};

export const generateProductivityInsights = async (logs: any[], tasks: any[], streakCount: number) => {
  const prompt = `Analyze productivity data briefly.

Logs: ${logs.length}, Completed: ${tasks.filter((t) => t.status === 'done').length}, Streak: ${streakCount}

Return ONLY valid JSON:
{
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["area 1", "area 2"],
  "recommendations": ["action 1", "action 2"],
  "overall_assessment": "brief assessment"
}`;

  try {
    const content = await callGroq([{ role: 'user', content: prompt }], { max_tokens: 400 });
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('AI Insights Error:', error);
    return {
      strengths: ['Consistent logging', 'Task completion'],
      improvements: ['Time management', 'Documentation'],
      recommendations: ['Set daily goals', 'Review progress weekly'],
      overall_assessment: 'Keep up the good work!',
    };
  }
};

export const chatWithAI = async (message: string, context: string) => {
  if (!PRIVACY_CONFIG.AI_TRAINING_ALLOWED) {
    console.log('[PRIVACY] AI processing in session-only mode');
  }

  const sanitizedMessage = maskPII(message);
  const sanitizedContext = maskPII(context);

  const prompt = `Answer in 2-3 sentences max. Be brief and actionable.

Context: ${sanitizedContext}

User: ${sanitizedMessage}

Assistant: ${AI_DISCLAIMERS.SUGGESTION}`;

  try {
    const content = await callGroq([{ role: 'user', content: prompt }], { max_tokens: 150 });
    return content || 'I apologize, I could not generate a response.';
  } catch (error) {
    console.error('AI Chat Error:', error);
    return 'I apologize, I encountered an error. Please try again.';
  }
};

export const analyzeBlocker = async (title: string, description: string, type: string, attempted: string) => {
  const prompt = `Analyze this blocker and provide 3-5 brief solutions.

Title: ${title}
Description: ${description}
Type: ${type}
Attempted: ${attempted}

Return ONLY valid JSON:
{
  "suggestions": ["solution 1", "solution 2", "solution 3"],
  "root_cause": "likely cause",
  "estimated_time": "time estimate"
}`;

  try {
    const content = await callGroq([{ role: 'user', content: prompt }], { max_tokens: 400 });
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { suggestions: [], root_cause: '', estimated_time: '' };
  } catch (error) {
    console.error('AI Blocker Analysis Error:', error);
    return { suggestions: [], root_cause: '', estimated_time: '' };
  }
};

export const generateStandup = async (logs: any[], teamMembers: any[]) => {
  const standupData = logs.map((log) => ({
    member: log.username,
    yesterday: log.bullet_points?.slice(0, 3) || [],
    sentiment: log.sentiment_score || 0,
  }));

  const prompt = `Generate a team standup report.

Team Updates:
${JSON.stringify(standupData, null, 2)}

Return ONLY valid JSON:
{
  "summary": "brief team summary",
  "highlights": ["highlight 1", "highlight 2"],
  "blockers": ["blocker if any"],
  "team_mood": "positive/neutral/needs attention"
}`;

  try {
    const content = await callGroq([{ role: 'user', content: prompt }], { max_tokens: 500 });
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { summary: '', highlights: [], blockers: [], team_mood: 'neutral' };
  } catch (error) {
    console.error('AI Standup Error:', error);
    return { summary: 'Unable to generate standup', highlights: [], blockers: [], team_mood: 'neutral' };
  }
};
