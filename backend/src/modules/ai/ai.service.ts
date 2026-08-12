import { maskPII, AI_DISCLAIMERS, PRIVACY_CONFIG } from './privacy-config';
import { getAIProvider } from './providers/aiProviderFactory';

// Milestone 13 (Engineering Charter rules 2/5/13): this file no longer
// knows Groq exists. Every function below calls callAI(), which asks
// aiProviderFactory for whichever AIProvider is configured (AI_PROVIDER
// env var) and calls its generateCompletion(). Swapping providers, or
// adding a new one later, never touches this file.

interface LogAnalysis {
  tasks_identified: string[];
  sentiment_score: number;
  summary: string;
  bullet_points: string[];
  achievements: string[];
  blockers_detected: string[];
  quality_score: number;
}

const callAI = (messages: { role: string; content: string }[], options: { temperature?: number; max_tokens?: number } = {}) => {
  return getAIProvider().generateCompletion(messages, options);
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
    const content = await callAI([{ role: 'user', content: prompt }], { max_tokens: 800 });
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

// Phase 3 security audit: blockerText and each chat message's text are
// free-form, user-authored content (same class as analyzeLog's entryText)
// that previously went straight into the prompt unmasked. Masked here at
// the same boundary analyzeLog/chatWithAI/generateWorkSummary already
// use. `username` is left as-is -- it's an identifier, not free text, and
// maskPII's email/phone/IP regexes have nothing to strip from it.
export const generateMentorAdvice = async (blockerText: string, chatHistory: any[], projectContext: string): Promise<string> => {
  const sanitizedBlockerText = maskPII(blockerText);
  const sanitizedChatLines = chatHistory.slice(-3).map((m) => `${m.username}: ${maskPII(m.message_text)}`);

  const prompt = `Provide brief technical advice (2-3 sentences max).

Blocker:
${sanitizedBlockerText}

Recent Chat:
${sanitizedChatLines.join('\n')}

Advice:`;

  try {
    const content = await callAI([{ role: 'user', content: prompt }], { max_tokens: 200 });
    return content || 'Unable to generate advice at this time.';
  } catch (error) {
    console.error('AI Mentor Error:', error);
    return 'I apologize, but I encountered an error generating advice. Please try again.';
  }
};

// Phase 3 security audit: projectName/description/requirements are all
// free-form, user-authored fields (a description or requirements list can
// easily contain a client's email/phone/IP) that previously reached the
// prompt unmasked. Masked at the same boundary this file already uses
// elsewhere.
export const analyzeProjectWithAI = async (projectName: string, description: string, requirements?: string) => {
  const sanitizedProjectName = maskPII(projectName);
  const sanitizedDescription = maskPII(description);
  const sanitizedRequirements = requirements ? maskPII(requirements) : undefined;

  const prompt = `You are a project planning AI. Analyze this project and suggest tasks.

Project: ${sanitizedProjectName}
Description: ${sanitizedDescription}
${sanitizedRequirements ? `Requirements: ${sanitizedRequirements}` : ''}

Return ONLY valid JSON:
{
  "suggested_tasks": [{"title": "task", "description": "details", "priority": "high/medium/low", "estimated_hours": 4}],
  "tech_stack": ["technologies"],
  "risks": ["potential risks"],
  "timeline_estimate": "X weeks",
  "team_size_recommendation": 3
}`;

  try {
    const content = await callAI([{ role: 'user', content: prompt }], { max_tokens: 1500 });
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

// Phase 3 security audit: recentLogs is the same free-form log text
// analyzeLog already masks -- this function previously sent it unmasked.
export const generateLogSuggestions = async (recentLogs: string[], currentTasks: any[]) => {
  const sanitizedLogs = recentLogs.map((l) => maskPII(l));

  const prompt = `Based on recent work, suggest 3 brief writing prompts for today's log.

Recent Work:
${sanitizedLogs.slice(0, 2).join('\n')}

Return ONLY valid JSON:
{
  "suggestions": ["brief suggestion 1", "brief suggestion 2", "brief suggestion 3"],
  "focus_areas": ["area 1", "area 2"],
  "productivity_tip": "short tip"
}`;

  try {
    const content = await callAI([{ role: 'user', content: prompt }], { temperature: 0.8, max_tokens: 300 });
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
    const content = await callAI([{ role: 'user', content: prompt }], { max_tokens: 400 });
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
    const content = await callAI([{ role: 'user', content: prompt }], { max_tokens: 150 });
    return content || 'I apologize, I could not generate a response.';
  } catch (error) {
    console.error('AI Chat Error:', error);
    return 'I apologize, I encountered an error. Please try again.';
  }
};

// Phase 3 security audit: title/description/attempted are free-form
// user-authored text, previously sent unmasked. `type` is a short
// category label (e.g. 'technical'), not free text -- left as-is, since
// maskPII's regexes have nothing to strip from it and it isn't the kind
// of content this fix targets. `attempted` is declared as `string` here
// but blockers.service.ts's real caller passes body.attemptedSolutions
// straight through (optional per blockers.dto.ts) -- guard against
// undefined/null so masking a legitimately-omitted field can't throw
// before the function's own try/catch ever runs.
export const analyzeBlocker = async (title: string, description: string, type: string, attempted: string) => {
  const sanitizedTitle = maskPII(title || '');
  const sanitizedDescription = maskPII(description || '');
  const sanitizedAttempted = maskPII(attempted || '');

  const prompt = `Analyze this blocker and provide 3-5 brief solutions.

Title: ${sanitizedTitle}
Description: ${sanitizedDescription}
Type: ${type}
Attempted: ${sanitizedAttempted}

Return ONLY valid JSON:
{
  "suggestions": ["solution 1", "solution 2", "solution 3"],
  "root_cause": "likely cause",
  "estimated_time": "time estimate"
}`;

  try {
    const content = await callAI([{ role: 'user', content: prompt }], { max_tokens: 400 });
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

// Milestone 49: drafts a same-day work summary from a user's OWN raw
// entries only -- unlike generateStandup (which aggregates every team
// member's data into one prompt, an already-documented, deliberately
// accepted residual, see docs/security/SECURITY_FINDINGS.md), this never
// crosses a user boundary, so it carries none of that finding's cross-
// user prompt-injection/data-mixing concern. maskPII applied per-entry,
// matching analyzeLog's own precedent, since these are still user-
// authored free text. Returns a draft only -- the caller (logs.service.ts)
// never persists this return value directly; the user must separately
// confirm/edit it before anything is written, enforced at the service
// layer, not here.
export const generateWorkSummary = async (entries: string[]): Promise<string> => {
  const sanitizedEntries = entries.map((e) => maskPII(e));

  const prompt = `Summarize today's work log entries into a concise, professional summary (2-4 sentences or a short bullet list).

Entries (in chronological order):
${sanitizedEntries.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Return ONLY the summary text, no preamble, no JSON.

Note: ${AI_DISCLAIMERS.SUGGESTION}`;

  try {
    const content = await callAI([{ role: 'user', content: prompt }], { max_tokens: 400 });
    return content?.trim() || sanitizedEntries.join(' | ');
  } catch (error) {
    console.error('AI Work Summary Error:', error);
    // Milestone 49: a safe, always-available fallback -- joining the raw
    // entries verbatim -- rather than failing the request outright. The
    // user reviews and can edit/rewrite this before confirming either
    // way, so a degraded (non-AI) draft is still a usable starting point,
    // not a broken feature.
    return sanitizedEntries.join(' | ');
  }
};

// Phase 3 security audit: bullet_points are AI-derived from analyzeLog's
// own already-masked input, so they're already indirectly protected --
// this is a defense-in-depth mask at the boundary where this function's
// own prompt is actually built, matching the "mask at the point content
// enters a prompt" rule uniformly rather than relying on an upstream
// guarantee. `member`/`sentiment` are an identifier and a number, not
// free text -- left as-is.
export const generateStandup = async (logs: any[], teamMembers: any[]) => {
  const standupData = logs.map((log) => ({
    member: log.username,
    yesterday: (log.bullet_points?.slice(0, 3) || []).map((point: string) => maskPII(point)),
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
    const content = await callAI([{ role: 'user', content: prompt }], { max_tokens: 500 });
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
