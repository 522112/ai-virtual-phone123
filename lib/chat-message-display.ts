/** Shared display helpers so listen-together and chat strip the same prefixes. */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseChatBubbleDisplay(text: string, knownNames: string[] = []): {
  whisper: boolean;
  body: string;
} {
  let body = (text || "").replace(/\r\n/g, "\n").trim();
  let whisper = false;

  const whisperPrefix = /^(?:【私聊】|\[私聊(?:[^\]]*)?\])[ \t]*/;
  while (whisperPrefix.test(body)) {
    whisper = true;
    body = body.replace(whisperPrefix, "").replace(/^\n+/, "").trim();
  }

  const names = knownNames.filter(Boolean).sort((left, right) => right.length - left.length);
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const named = new RegExp(`^(?:\\[${escaped}\\]\\s*:\\s*|${escaped}\\s*[:：]\\s*)`);
    if (named.test(body)) {
      body = body.replace(named, "").trim();
      break;
    }
  }

  return { whisper, body };
}

export function chatBubbleBody(text: string, knownNames: string[] = []): string {
  return parseChatBubbleDisplay(text, knownNames).body;
}
