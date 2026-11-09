// Mock auth for route tests
export const mockAuthSession = {
  current: null, // null = unauthenticated, or { user: { id: 'usr-1', email: 'test@example.com' } }
};

export async function auth() {
  return mockAuthSession.current;
}

export function setMockSession(session) {
  mockAuthSession.current = session;
}

export function clearMockSession() {
  mockAuthSession.current = null;
}
