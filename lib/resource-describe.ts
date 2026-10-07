import { sendLLMRequest } from "./chat-engine";
import { loadApiConfigs } from "./settings-storage";

/**
 * 图片识图（手动触发）：用第一个可用 API 配置看图，
 * 返回一句内容描述，用于填资源备注。
 */
export async function describeResourceImage(dataUrl: string): Promise<string> {
  const configs = loadApiConfigs();
  const config = configs.find(c => c.enableImageRecognition && c.apiKey)
    || configs.find(c => c.apiKey)
    || configs[0];
  if (!config) throw new Error("还没有可用的 API 配置，先去设置里配一个");
  const raw = await sendLLMRequest(
    config,
    null,
    [
      {
        role: "user",
        content: [
          { type: "text", text: "用一句话描述这张图片的内容（主体、场景、风格），再补一句建议用途，不超过80字，直接输出描述不要寒暄。" },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ],
      },
    ],
    [],
    { characterName: "资源库识图" },
    { appId: "resource-library", appTags: ["resource-library", "vision"] },
  );
  const text = String(raw || "").trim();
  if (!text) throw new Error("模型没有返回描述（该模型可能不支持看图）");
  return text.slice(0, 200);
}
