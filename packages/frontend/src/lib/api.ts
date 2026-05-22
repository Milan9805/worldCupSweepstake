const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data.data;
}

export async function getGroup(key: string) {
  return fetchApi(`/api/group/${encodeURIComponent(key)}`);
}

export async function getMatches() {
  return fetchApi('/api/matches');
}

export async function getTeams() {
  return fetchApi('/api/teams');
}

export async function getTree() {
  return fetchApi('/api/tree');
}

export async function refreshScores() {
  return fetchApi<{
    matches: unknown[];
    teams: unknown[];
    source?: 'api' | 'bbc' | 'cache';
    refreshedAt?: string;
  }>('/api/refresh', { method: 'POST' });
}

export async function adminLogin(secret: string) {
  return fetchApi<{ token: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ secret }),
  });
}

export async function adminUpdateMembers(
  token: string,
  groupKey: string,
  members: { name: string; imageUrl: string | null; teams: string[] }[]
) {
  return fetchApi('/api/admin/members', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupKey, members }),
  });
}

export async function adminAssignTeams(
  token: string,
  groupKey: string,
  assignments: { personName: string; teams: string[] }[]
) {
  return fetchApi('/api/admin/assign', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupKey, assignments }),
  });
}

export async function adminGetUploadUrl(
  token: string,
  groupKey: string,
  personName: string,
  contentType: string
) {
  return fetchApi<{ uploadUrl: string; imageUrl: string }>(
    '/api/admin/upload-avatar',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groupKey, personName, contentType }),
    }
  );
}


