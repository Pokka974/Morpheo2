export function generateId(): string {
  // dreams.id (and recurrence_patterns.id) are Postgres uuid columns — must be a valid
  // UUID, not a local-only string.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
