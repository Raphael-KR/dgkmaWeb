import { users, type User } from "@shared/schema";
import { eq, and, like, or, asc, count, sql } from "drizzle-orm";
import { db } from "../../db";
import type { DirectoryResult } from "@shared/contracts/directory";
import { inRoster, rosterName } from "./roster";

export class DirectoryStorage {
  async getDirectoryAlumni(viewer: User, q?: string): Promise<DirectoryResult> {
    const [self] = await db
      .select({ generation: users.generation })
      .from(users)
      .where(eq(users.id, viewer.id));
    const generation = self?.generation || null;
    const region = viewer.activityRegion || null;
    const scope = { generation, region };
    if (!viewer.isAdmin && !generation && !region)
      return { alumni: [], total: 0, hasScope: false, scope };

    const visible = and(
      inRoster,
      viewer.isAdmin
        ? undefined
        : or(
            generation ? eq(users.generation, generation) : undefined,
            region ? and(eq(users.isVerified, true), eq(users.activityRegion, region)) : undefined,
          ),
    );
    const term = q?.trim();
    const [{ total }] = await db.select({ total: count() }).from(users).where(visible);
    const rows = await db
      .select({
        name: rosterName,
        generation: users.generation,
        department: users.department,
        graduationDate: users.graduationDate,
        position: viewer.isAdmin
          ? users.alumniPosition
          : sql<
              string | null
            >`case when ${users.alumniStatus} <> '동문회 탈퇴자' then ${users.alumniPosition} end`,
        isMatched: users.isVerified,
      })
      .from(users)
      .where(
        and(
          visible,
          term
            ? or(like(users.alumniName, `%${term}%`), like(users.generation, `%${term}%`))
            : undefined,
        ),
      )
      .orderBy(asc(users.generation), asc(users.alumniName), asc(users.id))
      .limit(5000);

    return {
      total,
      scope,
      hasScope: true,
      alumni: rows.map(({ graduationDate, generation, department, isMatched, ...row }) => ({
        ...row,
        generation: generation ?? "",
        department: department ?? "",
        graduationYear: graduationDate
          ? parseInt(graduationDate.substring(0, 4), 10) || null
          : null,
        isMatched: isMatched === true,
      })),
    };
  }
}
