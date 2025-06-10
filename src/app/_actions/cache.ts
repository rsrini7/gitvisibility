"use server";

import { db } from "~/server/db";
import { eq, and } from "drizzle-orm";
import { diagramCache } from "~/server/db/schema";
import { sql } from "drizzle-orm";

export async function getCachedDiagram(username: string, repo: string) {
  try {
    const cached = await db
      .select()
      .from(diagramCache)
      .where(
        and(eq(diagramCache.username, username), eq(diagramCache.repo, repo)),
      )
      .limit(1);

    if (cached[0]) {
      return {
        diagram: cached[0].diagram,
        explanation: cached[0].explanation,
        mapping: cached[0].mapping,
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching cached diagram:", error);
    return null;
  }
}

export async function getCachedExplanationAndMapping(username: string, repo: string) {
  try {
    const cached = await db
      .select()
      .from(diagramCache)
      .where(
        and(eq(diagramCache.username, username), eq(diagramCache.repo, repo)),
      )
      .limit(1);

    return cached[0] ?? null;
  } catch (error) {
    console.error("Error fetching cached explanation:", error);
    return null;
  }
}

export async function cacheDiagramAndExplanation(
  username: string,
  repo: string,
  diagram: string,
  explanation: string,
  mapping: string,
  usedOwnKey = false,
) {
  try {
    await db
      .insert(diagramCache)
      .values({
        username,
        repo,
        diagram,
        explanation,
        mapping,
        usedOwnKey,
      })
      .onConflictDoUpdate({
        target: [diagramCache.username, diagramCache.repo],
        set: {
          diagram,
          explanation,
          mapping,
          usedOwnKey,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error("Error caching diagram:", error);
  }
}

export async function getDiagramStats() {
  try {
    const stats = await db
      .select({
        totalDiagrams: sql`COUNT(*)`,
        ownKeyUsers: sql`COUNT(CASE WHEN ${diagramCache.usedOwnKey} = true THEN 1 END)`,
        freeUsers: sql`COUNT(CASE WHEN ${diagramCache.usedOwnKey} = false THEN 1 END)`,
      })
      .from(diagramCache);

    return stats[0];
  } catch (error) {
    console.error("Error getting diagram stats:", error);
    return null;
  }
}
