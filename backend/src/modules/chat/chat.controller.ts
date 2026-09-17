import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ConversationRequest } from '../../common/middleware/requireConversationParticipant';
import { ok, created } from '../../common/http/respond';
import { chatService } from './chat.service';

// Chat V1 Task 2 -- conversation management only. sender_user_id/
// created_by are never read from req.body anywhere in this module --
// always req.user!.userId, matching every other module's create pattern.
//
// Both POST endpoints below are get-or-create and respond 200 either way
// (never 201) -- the caller cannot tell, and does not need to tell,
// whether this call created the conversation or returned an existing one;
// that is exactly what "idempotent" means here.

export const listConversations = async (req: AuthRequest, res: Response) => {
  const conversations = await chatService.listConversations(req.user!.userId);
  ok(res, conversations);
};

export const createDirectConversation = async (req: AuthRequest, res: Response) => {
  const { other_user_id } = req.body;
  const conversation = await chatService.getOrCreateDirectConversation(req.user!.userId, other_user_id);
  ok(res, conversation);
};

export const createTeamConversation = async (req: AuthRequest, res: Response) => {
  const { teamId } = req.params;
  const conversation = await chatService.getOrCreateTeamConversation(teamId, req.user!.userId);
  ok(res, conversation);
};

// Task 3 -- message list/send. requireConversationParticipant has already
// run (chat.routes.ts) and returned 404 for any non-participant/
// nonexistent conversation before either of these executes.

export const listMessages = async (req: AuthRequest, res: Response) => {
  const { conversationId } = req.params;
  const { cursor, limit } = req.query as { cursor?: string; limit?: string };
  const result = await chatService.listMessages(conversationId, req.user!.userId, cursor, limit);
  ok(res, result);
};

// Unlike the get-or-create conversation endpoints (which respond 200
// either way, since the caller cannot distinguish and does not need to),
// sending a message genuinely creates a new resource on every call -- 201
// is correct here.
export const sendMessage = async (req: ConversationRequest, res: Response) => {
  const { body } = req.body;
  // req.conversation was fetched and authorized by
  // requireConversationParticipant -- passed through as-is, never
  // re-fetched or re-derived here or in the service.
  const message = await chatService.sendMessage(req.conversation!, req.user!.userId, body);
  created(res, { message });
};

export const markConversationRead = async (req: ConversationRequest, res: Response) => {
  const { conversationId } = req.params;
  await chatService.markConversationRead(conversationId, req.user!.userId);
  ok(res, { success: true });
};
