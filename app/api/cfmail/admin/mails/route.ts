import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emails, messages } from "@/lib/schema"
import { eq, and, or, like, sql, desc } from "drizzle-orm"
import { verifyCfMailAuth } from "@/lib/cfmail"

export const runtime = "edge"

export async function GET(request: Request) {
  const auth = await verifyCfMailAuth(request)
  if ("error" in auth) return auth.error

  const { searchParams } = new URL(request.url)
  const address = searchParams.get("address")
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20"), 1), 100)
  const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0)
  const keyword = searchParams.get("keyword") || null

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 })
  }

  const db = createDb()

  const email = await db.query.emails.findFirst({
    where: eq(sql`LOWER(${emails.address})`, address.toLowerCase()),
  })

  if (!email) {
    return NextResponse.json([])
  }

  const baseCondition = eq(messages.emailId, email.id)
  const keywordCondition = keyword
    ? or(
        like(messages.subject, `%${keyword}%`),
        like(messages.content, `%${keyword}%`),
        like(sql`coalesce(${messages.html}, '')`, `%${keyword}%`)
      )
    : undefined

  const results = await db
    .select({
      id: messages.id,
      from_address: messages.fromAddress,
      to_address: messages.toAddress,
      subject: messages.subject,
      content: messages.content,
      html: messages.html,
      received_at: messages.receivedAt,
    })
    .from(messages)
    .where(keywordCondition ? and(baseCondition, keywordCondition) : baseCondition)
    .orderBy(desc(messages.receivedAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json(results)
}
