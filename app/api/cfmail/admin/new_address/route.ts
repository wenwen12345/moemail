import { NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { createDb } from "@/lib/db"
import { emails } from "@/lib/schema"
import { eq, and, gt, sql } from "drizzle-orm"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { verifyCfMailAuth } from "@/lib/cfmail"
import { getUserRole } from "@/lib/auth"
import { ROLES } from "@/lib/permissions"
import { EMAIL_CONFIG } from "@/config"

export const runtime = "edge"

// cfmail 创建的邮箱默认 30 天过期，足以覆盖任何验证场景
const CFMAIL_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  const auth = await verifyCfMailAuth(request)
  if ("error" in auth) return auth.error

  const { userId } = auth
  const env = getRequestContext().env
  const db = createDb()

  try {
    const userRole = await getUserRole(userId)
    if (userRole !== ROLES.EMPEROR) {
      const maxEmails = await env.SITE_CONFIG.get("MAX_EMAILS") || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString()
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(emails)
        .where(and(eq(emails.userId, userId), gt(emails.expiresAt, new Date())))

      if (Number(count) >= Number(maxEmails)) {
        return NextResponse.json(
          { error: `已达到最大邮箱数量限制 (${maxEmails})` },
          { status: 403 }
        )
      }
    }

    const { name, domain } = await request.json<{ enablePrefix?: boolean; name?: string; domain: string }>()

    const domainString = await env.SITE_CONFIG.get("EMAIL_DOMAINS")
    const domains = domainString ? domainString.split(",").map((d: string) => d.trim()) : ["moemail.app"]
    if (!domains.includes(domain)) {
      return NextResponse.json({ error: "invalid domain" }, { status: 400 })
    }

    const localPart = name || nanoid(8)
    const address = `${localPart}@${domain}`

    const existing = await db.query.emails.findFirst({
      where: eq(sql`LOWER(${emails.address})`, address.toLowerCase()),
    })
    if (existing) {
      return NextResponse.json({ error: "address already exists" }, { status: 409 })
    }

    const now = new Date()
    const [result] = await db
      .insert(emails)
      .values({ address, createdAt: now, expiresAt: new Date(now.getTime() + CFMAIL_EXPIRY_MS), userId })
      .returning({ address: emails.address })

    return NextResponse.json({ address: result.address })
  } catch (error) {
    console.error("[cfmail] new_address error:", error)
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }
}
