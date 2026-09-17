import { z } from 'zod';

// Chat V1 Task 2 -- conversation management only. Message DTOs (send,
// list/paginate, mark-read) belong to Task 3.
//
// other_user_id is the only client-supplied identifier for direct-
// conversation creation. created_by and the conversation's own two
// participant rows are always derived server-side from req.user.userId in
// chat.service.ts -- never accepted from the request body.
//
// (Task 2's other two endpoints -- GET /api/chat/conversations and POST
// /api/chat/conversations/team/:teamId -- take no body/query input that
// needs a schema here: the list endpoint has no query parameters yet, and
// :teamId is validated by the existing shared validateUuidParams('teamId')
// middleware, the same way every other team-scoped route already does.)
export const createDirectConversationSchema = z.object({
  other_user_id: z.string().uuid('Invalid other_user_id'),
});

export type CreateDirectConversationRequest = z.infer<typeof createDirectConversationSchema>;

// Chat V1 Task 3 -- message list/send.
//
// cursor/limit follow the exact same "string of digits, business-rule
// range checking done in the service layer" split already established by
// notifications.dto.ts's listNotificationsQuerySchema -- format-safe-to-
// reject-plainly here (a non-numeric value is unambiguously a malformed
// request), range/default/cap logic in chat.service.ts (mirrors
// notifications.controller.ts's own limit clamping).
export const listMessagesQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/, 'Invalid cursor').optional(),
  limit: z.string().regex(/^\d+$/, 'Invalid limit').optional(),
});

// .trim() runs before .min()/.max(), so a whitespace-only body (e.g. "   ")
// is correctly rejected as empty rather than accepted as 3 characters, and
// the body actually stored is the same trimmed value min/max validated
// against -- no separate trim step anywhere else in the send path.
export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message body is required').max(4000, 'Message body must be 4000 characters or fewer'),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;
