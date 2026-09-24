export type ListenTogetherAuthor = "user" | "character";

export type ListenTogetherTrack = {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  lyrics?: string;
};

export type ListenTogetherMessage = {
  id: string;
  author: ListenTogetherAuthor;
  text: string;
  createdAt: string;
};

export type ListenTogetherSession = {
  id: string;
  characterId: string;
  characterName: string;
  startedAt: string;
  endedAt?: string;
  tracks: ListenTogetherTrack[];
  messages: ListenTogetherMessage[];
  status: "active" | "ended";
};
