// Privacy Configuration and Data Classification

export const PRIVACY_CONFIG = {
  // Core principle: Users own their data
  DATA_OWNERSHIP: 'USER',
  AI_ROLE: 'TEMPORARY_PROCESSOR',
  
  // Data retention
  AI_SESSION_TIMEOUT: 3600000, // 1 hour
  CHAT_HISTORY_RETENTION: 30, // days
  AUTO_DELETE_ENABLED: true,
  
  // AI processing
  AI_TRAINING_ALLOWED: false,
  CROSS_USER_LEARNING: false,
  CROSS_TEAM_LEARNING: false,
  
  // Privacy modes
  STRICT_MODE: true,
  ANONYMIZE_ANALYTICS: true,
  ENCRYPTION_REQUIRED: true,
};

export const DATA_CLASSIFICATION = {
  HIGHLY_SENSITIVE: [
    'work_logs',
    'private_notes',
    'blocker_descriptions',
    'team_messages',
    'ai_conversations',
    'sentiment_content',
    'project_details',
    'client_names',
    'documents',
    'source_code',
  ],
  
  PII: [
    'name',
    'email',
    'role',
    'organization',
    'ip_address',
    'user_id',
  ],
  
  BEHAVIORAL_METADATA: [
    'activity_timestamps',
    'log_frequency',
    'streak_data',
    'productivity_scores',
    'sentiment_scores',
  ],
};

export const AI_USAGE_RULES = {
  ALLOWED: [
    'summarize_text',
    'create_bullet_points',
    'provide_suggestions',
    'writing_improvements',
    'project_planning',
    'blocker_resolution',
  ],
  
  FORBIDDEN: [
    'store_data_permanently',
    'use_for_training',
    'share_across_users',
    'refer_other_teams',
    'infer_hidden_attributes',
    'build_psychological_profiles',
    'assign_performance_grades',
    'competitive_comparison',
    'employment_decisions',
    'reveal_internal_metrics',
  ],
};

export const PRIVACY_LABELS = {
  FORBIDDEN_LABELS: [
    'Low performer',
    'Negative personality',
    'Unproductive member',
    'At-risk employee',
    'Likely to quit',
  ],
  
  ALLOWED_PHRASES: [
    'You may consider taking a break',
    'Your logs indicate increased stress language',
    'Would you like support?',
    'Consider reviewing your workload',
  ],
};

export const USER_RIGHTS = {
  VIEW_DATA: true,
  EXPORT_DATA: true,
  DELETE_DATA: true,
  DISABLE_AI: true,
  DISABLE_SENTIMENT: true,
  DELETE_AI_HISTORY: true,
  LEAVE_WITH_WIPE: true,
  OPT_OUT_ANALYTICS: true,
  OPT_OUT_LEADERBOARD: true,
};

export const maskPII = (text: string): string => {
  // Mask email addresses
  text = text.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]');
  
  // Mask phone numbers
  text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
  
  // Mask IP addresses
  text = text.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
  
  return text;
};

export const sanitizeForAI = (data: any, userId: string): any => {
  return {
    text: maskPII(data.text || ''),
    context: 'user_request',
    user_id_hash: hashUserId(userId),
    timestamp: Date.now(),
    session_only: true,
  };
};

const hashUserId = (userId: string): string => {
  // Simple hash for anonymization
  return Buffer.from(userId).toString('base64').substring(0, 8);
};

export const AI_DISCLAIMERS = {
  SUGGESTION: 'This is an AI-generated suggestion. Please review before using.',
  ANALYSIS: 'AI analysis is provided for assistance only and should not replace professional judgment.',
  SENTIMENT: 'Sentiment analysis is automated and may not reflect actual emotional state.',
  PLANNING: 'AI project planning is a starting point. Adjust based on your specific needs.',
};
