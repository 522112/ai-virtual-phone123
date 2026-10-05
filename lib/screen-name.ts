// lib/screen-name.ts
// 网名生成：按角色人设自动起一个符合人设的网名（2~8 字）。
// 调用方式照抄 lib/brief-persona.ts：simpleLLMCall + 角色聊天绑定配置。
// 本模块只负责“生成文本”，不直接写角色存储——档案编辑器把网名当普通表单字段随 SAVE 持久化。
import { simpleLLMCall } from "./api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "./settings-storage";
import type { Character } from "./character-types";

/** 按传入的角色资料（可以是编辑器里未保存的表单态）生成网名。失败抛错（含用户可读信息）。 */
export async function generateScreenNameText(character: Character): Promise<string> {
    if (!character.persona?.trim() && !character.personality?.trim()) {
        throw new Error("角色还没有设定内容，先填写人设再生成网名。");
    }

    const bindings = loadBindingConfig();
    const slot = resolveBinding(bindings, character.id, "chat");
    if (!slot.apiConfigId) throw new Error("尚未绑定 API 配置，请先在绑定设置中配置。");
    const apiConfig = loadApiConfigs().find(c => c.id === slot.apiConfigId);
    if (!apiConfig) throw new Error("绑定的 API 配置不存在。");

    const name = character.name?.trim() || "该角色";
    const systemPrompt = [
        `你是角色档案助手。以下是角色「${name}」的设定，请为 TA 起一个符合人设的网名（微信昵称）。`,
        "",
        `【角色设定】\n${character.persona?.trim() || "（暂无）"}`,
        ...(character.personality?.trim() ? ["", `【性格】\n${character.personality.trim()}`] : []),
        "",
        "要求：",
        "- 只输出网名本身，2~8 个字，不要引号、不要解释、不要多余标点",
        "- 风格必须贴合人设（比如病娇带占有欲、温柔带暖意、高冷带距离感、活泼带元气）",
        "- 不要和本名完全相同，可以是昵称、外号、叠词或意象化名字",
        "- 只能输出一个网名，不要给多个候选",
    ].join("\n");

    const result = await simpleLLMCall(
        apiConfig,
        [
            { role: "system", content: systemPrompt },
            { role: "user", content: `请为「${name}」生成网名。` },
        ],
        { temperature: 0.9, max_tokens: 256 },
    );

    if (result.error || !result.content) {
        throw new Error(result.error || "模型返回了空内容，请重试。");
    }
    // 取第一行、去掉可能的引号与空白，最多保留 12 字
    const first = result.content
        .split("\n")
        .map(line => line.trim().replace(/^["「『【\s]+|["」』】\s]+$/g, ""))
        .find(line => line.length > 0);
    if (!first) throw new Error("模型返回了空内容，请重试。");
    return first.slice(0, 12);
}
