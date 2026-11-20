import React, { useState } from 'react';
import { getInitials } from '../shared/validation';

interface AvatarProps {
  username: string;
  avatarUrl?: string | null;
  online?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-24 h-24 text-2xl',
};

const DOT_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-2.5 h-2.5 border-2',
  md: 'w-3 h-3 border-2',
  lg: 'w-3.5 h-3.5 border-2',
  xl: 'w-4 h-4 border-[3px]',
};

export const Avatar: React.FC<AvatarProps> = ({
  username,
  avatarUrl,
  online = false,
  size = 'md',
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="relative inline-flex shrink-0">
      {avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt={`${username} avatar`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${SIZE_CLASSES[size]} rounded-full object-cover bg-[#E4E9E5] dark:bg-[#1E2B27]`}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`${SIZE_CLASSES[size]} rounded-full bg-[#0F766E]/12 text-[#0F766E] dark:bg-[#14B8A6]/18 dark:text-[#5EEAD4] font-display font-semibold flex items-center justify-center select-none`}
        >
          {getInitials(username)}
        </div>
      )}
      {online && (
        <span
          title="Online now"
          className={`absolute bottom-0 right-0 rounded-full bg-[#10B981] border-white dark:border-[#111917] ${DOT_CLASSES[size]}`}
        />
      )}
    </div>
  );
};
