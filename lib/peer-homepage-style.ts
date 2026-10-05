// lib/peer-homepage-style.ts
// 个人主页人设派生：封面渐变 + 置顶动态选择规则，纯函数、无副作用。
import type { Character } from "./character-types";
import type { MomentPost } from "./moments-types";

export type PeerCoverTheme = {
    background: string;
    label: string;
};

const COVER_THEMES: { keywords: string[]; background: string; label: string }[] = [
    { keywords: ["病娇", "偏执", "占有", "黑化", "疯"], background: "linear-gradient(135deg, #2b0a12 0%, #7a1020 55%, #1a1a22 100%)", label: "暗红" },
    { keywords: ["温柔", "体贴", "治愈", "暖", "贤惠"], background: "linear-gradient(135deg, #f6ecd9 0%, #e8cfae 55%, #c9a87c 100%)", label: "暖阳" },
    { keywords: ["活泼", "元气", "开朗", "话痨", "可爱", "元气"], background: "linear-gradient(135deg, #ffe29f 0%, #ffa99f 55%, #ff719a 100%)", label: "糖果" },
    { keywords: ["高冷", "冷漠", "淡", "疏离", "冰"], background: "linear-gradient(135deg, #0f2027 0%, #203a43 55%, #2c5364 100%)", label: "墨蓝" },
    { keywords: ["傲娇", "傲", "毒舌"], background: "linear-gradient(135deg, #41295a 0%, #c471a5 60%, #f5af19 100%)", label: "紫霞" },
    { keywords: ["优雅", "贵", "大小姐", "少爷", "古典"], background: "linear-gradient(135deg, #232526 0%, #8e8e6e 60%, #d8c690 100%)", label: "鎏金" },
    { keywords: ["阳光", "运动", "少年", "热血"], background: "linear-gradient(135deg, #43cea2 0%, #38b6c9 55%, #1a6fa0 100%)", label: "青空" },
    { keywords: ["神秘", "腹黑", "夜", "孤"], background: "linear-gradient(135deg, #141e30 0%, #4a3f6b 60%, #0f0c29 100%)", label: "夜幕" },
];

const DEFAULT_THEME: PeerCoverTheme = {
    background: "linear-gradient(135deg, #3a3f4b 0%, #6b7280 60%, #23262d 100%)",
    label: "默认",
};

/** 按人设/性格关键词派生封面主题，无匹配走默认。 */
export function derivePeerCoverTheme(character: Pick<Character, "persona" | "personality">): PeerCoverTheme {
    const text = `${character.persona || ""} ${character.personality || ""}`;
    for (const theme of COVER_THEMES) {
        if (theme.keywords.some(keyword => text.includes(keyword))) {
            return { background: theme.background, label: theme.label };
        }
    }
    return DEFAULT_THEME;
}

/**
 * 按人设自动挑选置顶动态：手动 pinnedMomentId 优先（调用方先处理）；
 * 自动规则取正文最长的那条（人设味最浓的一条通常最有表达欲），无动态返回 null。
 */
export function pickPersonaPinnedPost(posts: MomentPost[]): MomentPost | null {
    if (posts.length === 0) return null;
    let best = posts[0];
    for (const post of posts) {
        if ((post.content || "").length > (best.content || "").length) best = post;
    }
    return best;
}
