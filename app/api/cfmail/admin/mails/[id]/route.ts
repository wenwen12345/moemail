import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { messages } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { verifyCfMailAuth } from "@/lib/cfmail"

export const runtime = "edge"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyCfMailAuth(request)
  if ("error" in auth) return auth.error

  const db = createDb()
  const { id } = await params

  try {
    const deleted = await db
      .delete(messages)
      .where(eq(messages.id, id))
      .returning({ id: messages.id })

    if (deleted.length === 0) {
      return NextResponse.json({ error: "message not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[cfmail] delete mail error:", error)
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }
}
