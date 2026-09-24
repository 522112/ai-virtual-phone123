export const RELATIONSHIP_KINDS = ["couple", "bestie", "buddy", "bros"] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export type RelationshipStatus = "pending" | "active" | "declined" | "dissolved";

export const RELATIONSHIP_KIND_META: Record<RelationshipKind, {
  label: string;
  short: string;
  inviteTitle: string;
  inviteHint: string;
  accent: string;
}> = {
  couple: {
    label: "情侣",
    short: "恋人",
    inviteTitle: "邀请成为情侣",
    inviteHint: "两个人的专属空间，纪念日和日常都记在一起",
    accent: "#ff5c8a",
  },
  bestie: {
    label: "闺蜜",
    short: "闺蜜",
    inviteTitle: "邀请成为闺蜜",
    inviteHint: "无话不谈的那种，空间里只给你们看",
    accent: "#a78bfa",
  },
  buddy: {
    label: "死党",
    short: "死党",
    inviteTitle: "邀请成为死党",
    inviteHint: "过命的交情，打卡、吐槽、纪念日都能记",
    accent: "#f59e0b",
  },
  bros: {
    label: "基友",
    short: "基友",
    inviteTitle: "邀请成为基友",
    inviteHint: "铁磁专属空间，动态只在你们之间流转",
    accent: "#38bdf8",
  },
};

export function isRelationshipKind(value: unknown): value is RelationshipKind {
  return typeof value === "string" && (RELATIONSHIP_KINDS as readonly string[]).includes(value);
}

export function relationshipKindLabel(kind: RelationshipKind | string | undefined): string {
  if (isRelationshipKind(kind)) return RELATIONSHIP_KIND_META[kind].label;
  return "关系";
}

export type RelationshipBinding = {
  id: string;
  characterId: string;
  kind: RelationshipKind;
  status: RelationshipStatus;
  invitedBy: "user" | "character";
  inviteMessageId?: string;
  invitedAt: string;
  acceptedAt?: string;
  dissolvedAt?: string;
  coverImage?: string;
  coverUpdatedBy?: "user" | "character";
  coverUpdatedAt?: string;
};

export type RelationshipPostLike = {
  authorType: "user" | "character";
  authorId: string;
  createdAt: string;
};

export type RelationshipPost = {
  id: string;
  relationshipId: string;
  authorType: "user" | "character";
  authorId: string;
  content: string;
  photoAssetId?: string;
  fromChat?: boolean;
  chatExcerpt?: string;
  likes: RelationshipPostLike[];
  createdAt: string;
};

export type RelationshipComment = {
  id: string;
  postId: string;
  relationshipId: string;
  authorType: "user" | "character";
  authorId: string;
  content: string;
  replyToCommentId?: string;
  replyToAuthorName?: string;
  createdAt: string;
};

export type RelationshipCheckin = {
  id: string;
  relationshipId: string;
  authorType: "user" | "character";
  authorId: string;
  date: string;
  note?: string;
  createdAt: string;
};

export type RelationshipAnniversary = {
  id: string;
  relationshipId: string;
  title: string;
  date: string;
  createdAt: string;
};
