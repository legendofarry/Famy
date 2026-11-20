export interface ValidationResult {
  ok: boolean;
  normalized: string;
  error?: string;
}

const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export function validateUsername(raw: string): ValidationResult {
  const normalized = raw.trim().toLowerCase().replace(/^@+/, '');
  if (!normalized) {
    return { ok: false, normalized, error: 'Username is required.' };
  }
  if (normalized.length < 3 || normalized.length > 24) {
    return {
      ok: false,
      normalized,
      error: 'Username must be 3 to 24 characters.',
    };
  }
  if (!USERNAME_REGEX.test(normalized)) {
    return {
      ok: false,
      normalized,
      error: 'Use only letters, numbers, and underscores.',
    };
  }
  return { ok: true, normalized };
}

export function validatePassword(raw: string): { ok: boolean; error?: string } {
  if (!raw || raw.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }
  if (raw.length > 128) {
    return { ok: false, error: 'Password must be 128 characters or fewer.' };
  }
  return { ok: true };
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of matches) {
    const trimmed = item.replace(/[),.!?;:]+$/, '');
    try {
      const parsed = new URL(trimmed);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !seen.has(parsed.href)) {
        seen.add(parsed.href);
        cleaned.push(parsed.href);
      }
    } catch {
      // Ignore malformed URLs
    }
  }
  return cleaned;
}

export function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

export function formatMessageTime(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const current = new Date(now);
  const sameDay =
    d.getFullYear() === current.getFullYear() &&
    d.getMonth() === current.getMonth() &&
    d.getDate() === current.getDate();

  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(current);
  yesterday.setDate(current.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  if (isYesterday) {
    return 'Yesterday';
  }

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function getInitials(username: string): string {
  const clean = username.replace(/^@+/, '').trim();
  if (!clean) return 'FM';
  const parts = clean.split(/[_\s-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}
