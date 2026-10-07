import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/server/account-auth";

const RESOURCE_BUCKET = "resource-library";
const MAX_BYTES = 15 * 1024 * 1024;

const IMAGE_MIMES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function authHeaders(config: { key: string }): HeadersInit {
  return { apikey: config.key, Authorization: `Bearer ${config.key}` };
}

export async function POST(request: Request) {
  try {
    const account = await getCurrentAccount(request);
    if (!account) {
      return NextResponse.json({ ok: false, error: "请先登录账号。" }, { status: 401 });
    }
    const config = getSupabaseConfig();
    if (!config) {
      return NextResponse.json({ ok: false, error: "missing_supabase_env" }, { status: 503 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "请选择图片文件。" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "图片超过 15MB。" }, { status: 400 });
    }
    const lowerName = String((file as File).name || "").toLowerCase();
    const ext = (lowerName.split(".").pop() || "").replace(/[^a-z]/g, "");
    const mime = IMAGE_MIMES[ext] || "image/webp";
    await fetch(`${config.url}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...authHeaders(config), "Content-Type": "application/json" },
      body: JSON.stringify({ name: RESOURCE_BUCKET, public: true }),
    }).catch(() => {});
    const id = `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const objectPath = `${account.id}/${id}.${ext || "webp"}`;
    const upload = await fetch(
      `${config.url}/storage/v1/object/${RESOURCE_BUCKET}/${objectPath}`,
      {
        method: "POST",
        headers: { ...authHeaders(config), "Content-Type": mime, "x-upsert": "true" },
        body: file,
      },
    );
    if (!upload.ok) {
      const text = await upload.text().catch(() => "");
      return NextResponse.json({ ok: false, error: `云端上传失败：${upload.status} ${text}`.slice(0, 200) }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      url: `${config.url}/storage/v1/object/public/${RESOURCE_BUCKET}/${objectPath}`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "上传失败。" },
      { status: getSupabaseConfig() ? 400 : 503 },
    );
  }
}
