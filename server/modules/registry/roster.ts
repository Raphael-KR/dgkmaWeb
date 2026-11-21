import { alumniNameAliases, users } from "@shared/schema";
import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { normalizedPhoneSql } from "../identity/registration-support";
import { uniqueAlumniMatch } from "./alumni-match";

export const inRoster = isNotNull(users.alumniName);
export const rosterName = sql<string>`${users.alumniName}`;
export const normalizedRosterName = sql<string>`regexp_replace(${users.alumniName}, '[[:space:]]', '', 'g')`;
export const hasAccount = sql<boolean>`(${users.kakaoId} is not null or ${users.isVerified} is true)`;
export const rosterColumns = {
  id: users.id,
  name: rosterName,
  generation: users.generation,
  admissionDate: users.admissionDate,
  graduationDate: users.graduationDate,
  mobile: users.alumniMobile,
  status: users.alumniStatus,
  hasAccount,
};
// Keep the outer column qualified inside scalar subqueries of a single-table SELECT.
const ownerId = sql`${users}.${sql.identifier(users.id.name)}`;
export const preferredName = sql<string>`coalesce((select ${alumniNameAliases.name}
  from ${alumniNameAliases} where ${alumniNameAliases.userId} = ${ownerId}
  and ${alumniNameAliases.isPreferred}), ${users.alumniName})`;
export const normalizedAliases = sql<string[]>`array(select ${alumniNameAliases.normalizedName}
  from ${alumniNameAliases} where ${alumniNameAliases.userId} = ${ownerId})`;

export function matchesRosterName(name: string) {
  return sql`(${normalizedRosterName} = ${name} or ${name} = any(${normalizedAliases}))`;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockRegistrationMatch(tx: Transaction, name: string, phone: string) {
  const rows = await tx
    .select(rosterColumns)
    .from(users)
    .where(
      and(inRoster, matchesRosterName(name), eq(normalizedPhoneSql(users.alumniMobile), phone)),
    )
    .orderBy(asc(users.id))
    .limit(2)
    .for("update");
  return uniqueAlumniMatch(rows);
}

export async function registeredRosterCount() {
  const [{ total }] = await db.select({ total: count() }).from(users).where(inRoster);
  return total;
}
