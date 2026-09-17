import React from 'react';
import Avatar from './Avatar';

export interface AvatarGroupUser {
  user_id?: string;
  full_name?: string;
  avatar_url?: string;
  [key: string]: any;
}

export interface AvatarGroupProps {
  users?: AvatarGroupUser[];
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  users = [],
  max = 3,
  size = 'sm',
  className = '',
}) => {
  if (!users || users.length === 0) return null;

  const visibleUsers = users.slice(0, max);
  const remainingCount = users.length - max;

  return (
    <div className={`inline-flex items-center -space-x-2 overflow-hidden ${className}`}>
      {visibleUsers.map((user, index) => (
        <Avatar
          key={user.user_id || index}
          src={user.avatar_url}
          name={user.full_name || 'User'}
          size={size}
          className="ring-2 ring-white"
        />
      ))}
      {remainingCount > 0 && (
        <div
          className={`inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-700 font-semibold border border-gray-200 ring-2 ring-white ${
            size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'md' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
          }`}
          title={`+${remainingCount} more`}
          aria-label={`+${remainingCount} more users`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
};

export default AvatarGroup;
