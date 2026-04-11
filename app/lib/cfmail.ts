import { createDb } from "./db"
import { apiKeys } from "./schema"
import { eq, and, gt } from "drizzle-orm"
import { NextResponse } from "next/server"

/**
 * 验证 x-admin-auth 请求头（对应系统 api_keys 表中的 API Key）。
 * 认证通过返回 { userId }，失败返回 { error: NextResponse }。
 */
export async function verifyCfMailAuth(
  request: Request
): Promise<{ userId: string } | { error: NextResponse }> {
  const adminAuth = request.headers.get("x-admin-auth")
  if (!adminAuth) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  }

  const db = createDb()
  const apiKey = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.key, adminAuth),
      eq(apiKeys.enabled, true),
      gt(apiKeys.expiresAt, new Date())
    ),
    with: { user: true },
  })

  if (!apiKey?.user?.id) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  }

  return { userId: apiKey.user.id }
}
