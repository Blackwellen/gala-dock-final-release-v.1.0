// Gala Dock — set-time scheduling (EB-F). Pure helpers for multi-room line-ups: overlap +
// conflict detection per room. Used by the line-up tab and the Copilot /event-lineup command.

export interface SetSlot {
  id: string;
  roomId: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
}

export interface SetConflict {
  aId: string;
  bId: string;
  roomId: string;
}

/** Half-open interval overlap: [aStart,aEnd) intersects [bStart,bEnd). */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Two sets in the SAME room whose times overlap are a scheduling conflict. */
export function detectRoomConflicts(sets: SetSlot[]): SetConflict[] {
  const conflicts: SetConflict[] = [];
  const byRoom = new Map<string, SetSlot[]>();
  for (const s of sets) {
    if (!s.roomId) continue;
    const arr = byRoom.get(s.roomId) ?? [];
    arr.push(s);
    byRoom.set(s.roomId, arr);
  }
  for (const [roomId, arr] of byRoom) {
    const sorted = [...arr].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (overlaps(sorted[i].startsAt, sorted[i].endsAt, sorted[j].startsAt, sorted[j].endsAt)) {
          conflicts.push({ aId: sorted[i].id, bId: sorted[j].id, roomId });
        }
      }
    }
  }
  return conflicts;
}

export function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000));
}
