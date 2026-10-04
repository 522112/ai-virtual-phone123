import type { Character } from "./character-types";
import type { CheckPhoneDouyinPayload } from "./checkphone-config";
import { readPhoneSnapshotCache } from "./checkphone-storage";

export function resolveCharacterDouyinDisplayName(character: Pick<Character, "id" | "name">): string {
  const snapshot = readPhoneSnapshotCache<CheckPhoneDouyinPayload>(character.id, "douyin");
  const profileName = snapshot?.payload?.profile?.name?.trim();
  return profileName || character.name;
}

export function resolveCharacterDouyinPersona(character: Pick<Character, "id" | "name" | "persona" | "personality">): string {
  const snapshot = readPhoneSnapshotCache<CheckPhoneDouyinPayload>(character.id, "douyin");
  const bio = snapshot?.payload?.profile?.bio?.trim();
  if (bio) return bio;
  const personality = String(character.personality || "").trim();
  if (personality) return personality.slice(0, 160);
  const persona = String(character.persona || "").trim();
  if (persona) return persona.slice(0, 160);
  return `${character.name}的抖音账号`;
}

export function estimateDouyinStatsFromPersona(persona: string, seed = 0): {
  followers: number;
  following: number;
  avgLikes: number;
  publishChance: number;
} {
  const text = `${persona}|${seed}`;
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  const fame = (hash % 100) / 100;
  const followers = Math.round(80 + fame * fame * 480000 + (hash % 900));
  const following = 12 + (hash % 220);
  const avgLikes = Math.round(followers * (0.01 + (hash % 17) / 1000));
  const publishChance = 0.25 + (hash % 50) / 100;
  return { followers, following, avgLikes, publishChance };
}
