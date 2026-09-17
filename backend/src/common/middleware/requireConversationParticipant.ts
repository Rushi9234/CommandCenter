import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { chatRepository, Conversation } from '../../modules/chat/chat.repository';
import { teamsRepository } from '../../modules/teams/teams.repository';

export interface ConversationRequest extends AuthRequest {
  conversation?: Conversation;
}

// The reusable Chat authorization primitive (CHAT_ARCHITECTURE_AUDIT.md
// section D/G) -- built in Task 2 for Task 3's message endpoints
// (:conversationId-scoped) to mount. No Task 2 route uses this yet: none
// of GET /api/chat/conversations, POST /api/chat/conversations/direct, or
// POST /api/chat/conversations/team/:teamId take a conversationId at all.
//
// Deliberately returns 404 (never 403) for every unauthorized case --
// unlike requireTeamRole/requireTeamMembership (which 403 a non-member,
// because team existence itself is not meant to be secret on a
// discoverable-teams product), conversation existence should not be
// confirmable to a non-participant at all. A wrong answer here must look
// identical to "no such conversation."
//
// CRITICAL, unchanged from the schema/audit: for type='team' conversations,
// conversation_participants is NEVER consulted -- authorization is always
// the same live team_members query requireTeamRole/getMemberRole already
// use everywhere else (teamsRepository.canAccessTeam), which has no
// parent-team shortcut (a coordinator's parent-team membership does not
// grant child-team chat access, matching the existing Milestone 50 rule).
// Removing a user's team_members row revokes team-chat access on their
// very next request, with no separate sync step, because there is nothing
// to keep in sync -- this middleware reads team_members fresh every time.
export const requireConversationParticipant = () => {
  return async (req: ConversationRequest, res: Response, next: NextFunction) => {
    try {
      const conversationId = req.params.conversationId;
      const conversation = await chatRepository.getConversationById(conversationId);

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const userId = req.user!.userId;

      if (conversation.type === 'direct') {
        const isParticipant = await chatRepository.isDirectParticipant(conversationId, userId);
        if (!isParticipant) {
          return res.status(404).json({ error: 'Conversation not found' });
        }
      } else {
        const isCurrentTeamMember = await teamsRepository.canAccessTeam(userId, conversation.team_id!);
        if (!isCurrentTeamMember) {
          return res.status(404).json({ error: 'Conversation not found' });
        }
      }

      req.conversation = conversation;
      next();
    } catch (error) {
      next(error);
    }
  };
};
