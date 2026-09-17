import Avatar from '../common/Avatar';
import { ChatConversation, getConversationTitle } from './types';

export default function ConversationAvatar({
  conversation,
  size = 'md',
}: {
  conversation: ChatConversation;
  size?: 'sm' | 'md' | 'lg';
}) {
  const title = getConversationTitle(conversation);
  const avatarSize = size === 'sm' ? 'md' : 'lg';

  if (conversation.type === 'direct') {
    return (
      <Avatar
        name={title}
        src={conversation.other_user?.avatar_url}
        size={avatarSize}
        isGroup={false}
      />
    );
  }

  return (
    <Avatar
      name={conversation.team_name || 'Team'}
      size={avatarSize}
      isGroup={true}
    />
  );
}
