import { asc, desc, eq, inArray } from "drizzle-orm";
import { alumniDatabase, users } from "@shared/schema";
import type { AdminApprovedMemberDto, AdminLinkedAlumniRecordDto } from "@shared/contracts";
import { db } from "../../db";
import { linkedAlumniColumns } from "./admin-alumni-record";

export async function getApprovedMemberDetails(): Promise<AdminApprovedMemberDto[]> {
  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      phoneNumber: users.phoneNumber,
      profileImage: users.profileImage,
      birthday: users.birthday,
      birthdayType: users.birthdayType,
      isLeapMonth: users.isLeapMonth,
      activityRegion: users.activityRegion,
    })
    .from(users)
    .where(eq(users.isVerified, true))
    .orderBy(desc(users.createdAt), desc(users.id));
  if (members.length === 0) return [];

  // 이름·전화번호가 바뀌어도 확정된 회원 연결을 기준으로 조회한다.
  const linkedRows = await db
    .select({ ...linkedAlumniColumns, memberId: alumniDatabase.matchedUserId })
    .from(alumniDatabase)
    .where(
      inArray(
        alumniDatabase.matchedUserId,
        members.map((member) => member.id),
      ),
    )
    .orderBy(asc(alumniDatabase.id));
  const linkedByMember = new Map<number, AdminLinkedAlumniRecordDto[]>();
  for (const { memberId, ...record } of linkedRows) {
    if (memberId === null) continue;
    const records = linkedByMember.get(memberId) ?? [];
    records.push(record);
    linkedByMember.set(memberId, records);
  }

  return members.map((member) => ({
    id: member.id,
    memberId: member.id,
    recordType: "member",
    status: "approved",
    name: member.name,
    email: member.email,
    createdAt: member.createdAt?.toISOString() ?? null,
    profile: {
      phoneNumber: member.phoneNumber,
      profileImage: member.profileImage,
      birthday: member.birthday,
      birthdayType: member.birthdayType,
      isLeapMonth: member.isLeapMonth,
      activityRegion: member.activityRegion,
    },
    linkedAlumni: linkedByMember.get(member.id) ?? [],
  }));
}
