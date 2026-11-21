import { desc, eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import type { AdminApprovedMemberDto } from "@shared/contracts";
import { db } from "../../db";
import { adminAlumniColumns } from "./admin-alumni-record";

export async function getApprovedMemberDetails(): Promise<AdminApprovedMemberDto[]> {
  const members = await db
    .select({
      roster: adminAlumniColumns,
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      joinedAt: users.joinedAt,
      phoneNumber: users.phoneNumber,
      profileImage: users.profileImage,
      birthday: users.birthday,
      birthdayType: users.birthdayType,
      isLeapMonth: users.isLeapMonth,
      activityRegion: users.activityRegion,
    })
    .from(users)
    .where(eq(users.isVerified, true))
    .orderBy(sql`${users.joinedAt} desc nulls last`, desc(users.id));
  return members.map((member) => ({
    id: member.id,
    memberId: member.id,
    recordType: "member",
    status: "approved",
    name: member.name,
    email: member.email ?? "",
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.createdAt?.toISOString() ?? null,
    profile: {
      phoneNumber: member.phoneNumber,
      profileImage: member.profileImage,
      birthday: member.birthday,
      birthdayType: member.birthdayType,
      isLeapMonth: member.isLeapMonth,
      activityRegion: member.activityRegion,
    },
    linkedAlumni: member.roster.name ? [member.roster] : [],
  }));
}
