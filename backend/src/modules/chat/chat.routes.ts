import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import { requireTeamMembership, teamIdFromParams } from '../../common/middleware/requireTeamRole';
import { requireConversationParticipant } from '../../common/middleware/requireConversationParticipant';
import { getRateLimitProvider } from '../../common/rateLimit/rateLimitProviderFactory';
import * as chatController from './chat.controller';
import { createDirectConversationSchema, listMessagesQuerySchema, sendMessageSchema } from './chat.dto';

// Chat V1 Task 2 (conversation management) + Task 3 (message list/send).
// Read state (mark-read) does not exist yet -- a later task.
//
// Mounted at /api/chat (see routes/index.ts) -- distinct from the
// existing, unrelated POST /api/ai/chat (AI assistant) endpoint, which
// lives under /api/ai and is untouched by this module.

const router = Router();

// Applied here (after `authenticate` below), not in app.ts -- each key
// generator reads req.user.userId, which does not exist yet if the
// middleware ran ahead of authentication (BUG-003's lesson, the same
// reason every other per-user limiter in this codebase is instantiated
// and mounted this way).
const chatConversationRateLimiter = getRateLimitProvider().createChatConversationLimiter();
const chatMessageSendRateLimiter = getRateLimitProvider().createChatMessageSendLimiter();

// GET /api/chat/conversations — list the authenticated user's accessible
// conversations (direct conversations they're a fixed participant of,
// team conversations for teams they are CURRENTLY a member of).
router.get('/chat/conversations', authenticate, asyncHandler(chatController.listConversations));

// POST /api/chat/conversations/direct — get-or-create the canonical direct
// conversation between the authenticated user and other_user_id. Requires
// the two users to share at least one current team (chat.service.ts).
router.post(
  '/chat/conversations/direct',
  authenticate,
  chatConversationRateLimiter,
  validate(createDirectConversationSchema),
  asyncHandler(chatController.createDirectConversation)
);

// POST /api/chat/conversations/team/:teamId — get-or-create the canonical
// team conversation for :teamId. requireTeamMembership re-queries
// team_members live (any role) -- the same authorization primitive every
// other team-scoped route in the app already uses; a coordinator's
// parent-team membership does not satisfy it for a child team's own ID.
router.post(
  '/chat/conversations/team/:teamId',
  authenticate,
  validateUuidParams('teamId'),
  chatConversationRateLimiter,
  requireTeamMembership(teamIdFromParams),
  asyncHandler(chatController.createTeamConversation)
);

// GET /api/chat/conversations/:conversationId/messages — cursor-paginated
// message history (newest first). requireConversationParticipant returns
// 404 (never 403) for a nonexistent conversation or a non-participant.
router.get(
  '/chat/conversations/:conversationId/messages',
  authenticate,
  validateUuidParams('conversationId'),
  validate(listMessagesQuerySchema, 'query'),
  requireConversationParticipant(),
  asyncHandler(chatController.listMessages)
);

// POST /api/chat/conversations/:conversationId/messages — send a message.
// sender_user_id is always req.user!.userId (chat.controller.ts) --
// never accepted from the request body.
router.post(
  '/chat/conversations/:conversationId/messages',
  authenticate,
  validateUuidParams('conversationId'),
  chatMessageSendRateLimiter,
  requireConversationParticipant(),
  validate(sendMessageSchema),
  asyncHandler(chatController.sendMessage)
);

// POST /api/chat/conversations/:conversationId/read — mark conversation as read
// up to the latest available message for the authenticated caller.
router.post(
  '/chat/conversations/:conversationId/read',
  authenticate,
  validateUuidParams('conversationId'),
  requireConversationParticipant(),
  asyncHandler(chatController.markConversationRead)
);

export default router;
