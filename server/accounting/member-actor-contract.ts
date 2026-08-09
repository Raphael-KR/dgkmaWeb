import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const TODO_12_MANIFEST_SHA256 = "24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a";
const MEMBER_TABLES = ["association_members", "member_match_cases", "member_match_candidates", "member_identity_link_history"] as const;

function fail(code: string): never { throw new Error(code); }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }

export function validateMemberActorManifest(manifestPath = "docs/database-manifest.yaml") {
  const bytes = readFileSync(manifestPath);
  if (sha256(bytes) !== TODO_12_MANIFEST_SHA256) fail("todo_12_manifest_digest_mismatch");
  const manifest = JSON.parse(bytes.toString("utf8")) as Record<string, any>;
  const tables = manifest.tables as Array<Record<string, any>>;
  const foreignKeys = manifest.foreign_keys as Array<Record<string, any>>;
  const userRegistry = manifest.account_delete_user_fk_registry as Array<Record<string, any>>;
  const nonFkRegistry = manifest.account_delete_non_fk_registry as Array<Record<string, any>>;
  if (![tables, foreignKeys, userRegistry, nonFkRegistry].every(Array.isArray)) fail("todo_12_manifest_registry_missing");
  for (const tableName of MEMBER_TABLES) if (!tables.some((entry) => entry.table === tableName)) fail(`todo_12_table_missing:${tableName}`);
  const members = tables.find((entry) => entry.table === "association_members")!;
  const memberColumns = new Map<string, Record<string, any>>(
    members.columns.map((column: Record<string, any>) => [String(column.name), column]),
  );
  for (const columnName of ["member_uid", "display_name", "generation", "member_kind", "status", "user_id", "alumni_record_id", "recorded_actor_user_id", "recorded_actor_uid_snapshot", "recorded_actor_name_snapshot"]) {
    if (!memberColumns.has(columnName)) fail(`todo_12_member_column_missing:${columnName}`);
  }
  if (memberColumns.get("user_id")?.nullable !== true || memberColumns.get("alumni_record_id")?.nullable !== true) fail("todo_12_live_links_must_be_nullable");
  for (const forbidden of ["address", "workplace", "phone", "mobile", "email"]) {
    if ([...memberColumns.keys()].some((name) => String(name).toLowerCase().includes(forbidden))) fail(`todo_12_contact_copy_forbidden:${forbidden}`);
  }
  const requiredFks = [
    ["association_members", "user_id", "users", "SET NULL"],
    ["association_members", "alumni_record_id", "alumni_database", "RESTRICT"],
    ["member_match_candidates", "member_id", "association_members", "RESTRICT"],
    ["member_identity_link_history", "member_id", "association_members", "RESTRICT"],
  ];
  for (const [table, column, referencedTable, onDelete] of requiredFks) {
    if (!foreignKeys.some((fk) => fk.table === table && fk.columns?.[0] === column && fk.referenced_table === referencedTable && fk.on_delete === onDelete)) fail(`todo_12_fk_missing:${table}.${column}`);
  }
  for (const [column, predicate] of [["user_id", "user_id IS NOT NULL"], ["alumni_record_id", "alumni_record_id IS NOT NULL"]]) {
    if (!manifest.unique_constraints.some((entry: Record<string, any>) => entry.table === "association_members" && entry.columns?.[0] === column && entry.predicate_sql === predicate)) fail(`todo_12_partial_unique_missing:${column}`);
  }
  const manifestUserFks = foreignKeys.filter((fk) => fk.referenced_table === "users" && fk.referenced_columns?.[0] === "id").map((fk) => `${fk.table}.${fk.columns[0]}.${fk.on_delete}.${fk.on_update}`).sort();
  const registeredUserFks = userRegistry.map((entry) => `${entry.table}.${entry.column}.${entry.on_delete}.${entry.on_update}`).sort();
  if (JSON.stringify(manifestUserFks) !== JSON.stringify(registeredUserFks)) fail("todo_12_user_fk_registry_not_bidirectional");
  const rateLimit = userRegistry.find((entry) => entry.table === "event_parse_rate_limits" && entry.column === "user_id");
  if (!rateLimit || rateLimit.on_delete !== "CASCADE" || rateLimit.mechanical_or_explicit !== "explicit" || rateLimit.rank !== 23) fail("todo_12_rate_limit_registry_mismatch");
  const expectedNonFks = ["kakao_identity_terminations.identity_hash.prospective_insert.24", "session.sid.explicit_delete.25", "pending_registrations.kakao_id.explicit_delete.40"].sort();
  const actualNonFks = nonFkRegistry.map((entry) => `${entry.table}.${entry.column_or_identity}.${entry.action}.${entry.rank}`).sort();
  if (JSON.stringify(actualNonFks) !== JSON.stringify(expectedNonFks)) fail("todo_12_non_fk_registry_mismatch");
  if (manifest.kakao_identity_lock?.rank !== 15 || manifest.kakao_identity_lock?.row_selection_sql !== "pending_registrations.kakao_id = locked_target_kakao_id") fail("todo_12_kakao_lock_mismatch");
  return { memberTableCount: MEMBER_TABLES.length, userFkCount: userRegistry.length, nonFkCount: nonFkRegistry.length };
}

export type Actor = Readonly<{ userId: number; userUid: string; name: string; isAdmin: boolean }>;
type Member = { id: number; memberUid: string; displayName: string; generation: string; memberKind: "member" | "honorary"; status: "active" | "ended"; userId: number | null; alumniRecordId: number | null; joinedAt: string; endedAt: string | null };
type Activity = { memberId: number; activityNo: number; state: "active" | "inactive"; effectiveAt: string };
type Link = { memberId: number; version: number; operation: "link" | "correct" | "unlink_user" | "unlink_all"; userIdSnapshot: number | null; alumniRecordIdSnapshot: number | null; resultLinkKind: "user" | "alumni" | "both" | "none"; actorUserId: number | null };
export type DeleteCommand = { userId: number; actor: Actor; authenticatedSid: string; targetKakaoId: string; reservedOperationUid: string; expectedMechanicalKeys?: string[]; prospectiveOperationUid?: string; selectSessionsByUserInference?: boolean; selectPendingByCollision?: boolean; deleteRateLimitByCascade?: boolean; clearAlumniLink?: boolean; retainLegacyMatchedUser?: boolean; retainLegacyIsMatched?: boolean };

export class MemberActorContractMachine {
  users = new Map<number, { uid: string; name: string; isAdmin: boolean; kakaoId: string }>();
  alumni = new Map<number, { matchedUserId: number | null; isMatched: boolean }>();
  members = new Map<number, Member>();
  activities: Activity[] = [];
  links: Link[] = [];
  sessions = new Map<string, number>();
  pending: Array<{ id: number; kakaoId: string; email: string; name: string }> = [];
  rateLimits = new Set<number>();
  audit: Array<{ entity: string; action: string; operationUid: string }> = [];
  terminatedKakaoIds = new Set<string>();
  #kakaoLocks = new Set<string>();
  #nextMemberId = 1;

  addUser(id: number, uid: string, name: string, isAdmin: boolean, kakaoId: string): Actor { this.users.set(id, { uid, name, isAdmin, kakaoId }); return Object.freeze({ userId: id, userUid: uid, name, isAdmin }); }
  addAlumni(id: number, matchedUserId: number | null): void { this.alumni.set(id, { matchedUserId, isMatched: matchedUserId !== null }); }
  beginKakaoIdentityMutation(kakaoId: string): void {
    if (this.#kakaoLocks.has(kakaoId)) fail("kakao_identity_lock_wait_required");
    this.#kakaoLocks.add(kakaoId);
  }
  finishKakaoIdentityDeletion(kakaoId: string): void {
    if (!this.#kakaoLocks.has(kakaoId)) fail("kakao_identity_lock_not_held");
    this.pending = this.pending.filter((row) => row.kakaoId !== kakaoId);
    this.terminatedKakaoIds.add(kakaoId);
    this.#kakaoLocks.delete(kakaoId);
  }
  createPending(row: { id: number; kakaoId: string; email: string; name: string }): void {
    if (this.#kakaoLocks.has(row.kakaoId)) fail("kakao_identity_lock_wait_required");
    if (this.terminatedKakaoIds.has(row.kakaoId)) fail("kakao_identity_terminated");
    this.pending.push(row);
  }
  createMember(input: Omit<Member, "id" | "status" | "endedAt">, actor: Actor): Member {
    this.#requireAdmin(actor);
    if (input.userId !== null && [...this.members.values()].some((row) => row.userId === input.userId)) fail("member_user_link_duplicate");
    if (input.alumniRecordId !== null && [...this.members.values()].some((row) => row.alumniRecordId === input.alumniRecordId)) fail("member_alumni_link_duplicate");
    const member = { ...input, id: this.#nextMemberId++, status: "active" as const, endedAt: null };
    this.members.set(member.id, member);
    this.activities.push({ memberId: member.id, activityNo: 1, state: "active", effectiveAt: member.joinedAt });
    this.#appendLink(member, "link", actor.userId);
    return member;
  }
  transitionMember(memberId: number, action: "end" | "reactivate", effectiveAt: string, actor: Actor): void {
    this.#requireAdmin(actor);
    const member = this.members.get(memberId) ?? fail("member_not_found");
    if (member.status !== (action === "end" ? "active" : "ended")) fail("member_same_state_transition");
    member.status = action === "end" ? "ended" : "active";
    member.endedAt = action === "end" ? effectiveAt : null;
    const last = this.activities.filter((row) => row.memberId === memberId).at(-1)!;
    const state = action === "end" ? "inactive" : "active";
    if (last.state === state) fail("member_activity_same_state");
    this.activities.push({ memberId, activityNo: last.activityNo + 1, state, effectiveAt });
  }
  approveCandidate(actor: Actor | null, evidenceKind: string): void {
    if (!actor || !this.users.has(actor.userId) || !actor.isAdmin) fail("match_decision_live_admin_required");
    if (evidenceKind === "name_only") fail("match_name_only_unapprovable");
  }
  deleteAccount(command: DeleteCommand) {
    const snapshot = structuredClone({ users: this.users, alumni: this.alumni, members: this.members, activities: this.activities, links: this.links, sessions: this.sessions, pending: this.pending, rateLimits: this.rateLimits, audit: this.audit });
    try {
      const user = this.users.get(command.userId) ?? fail("delete_target_missing");
      if (command.actor.userId !== command.userId || command.actor.userUid !== user.uid) fail("delete_actor_target_mismatch");
      if (command.selectSessionsByUserInference) fail("session_user_inference_forbidden");
      if (command.selectPendingByCollision) fail("pending_collision_selection_forbidden");
      if (command.deleteRateLimitByCascade) fail("rate_limit_cascade_forbidden");
      if (command.prospectiveOperationUid && command.prospectiveOperationUid !== command.reservedOperationUid) fail("prospective_operation_mismatch");
      const linked = [...this.members.values()].filter((member) => member.userId === command.userId);
      const mechanical = linked.map((member) => `association_members.user_id:${member.id}`).sort();
      if (command.expectedMechanicalKeys && JSON.stringify([...command.expectedMechanicalKeys].sort()) !== JSON.stringify(mechanical)) fail("mechanical_registry_set_mismatch");
      if (this.rateLimits.has(command.userId)) { this.audit.push({ entity: "event_parse_rate_limit", action: "delete", operationUid: command.reservedOperationUid }); this.rateLimits.delete(command.userId); }
      if (!this.sessions.has(command.authenticatedSid) || this.sessions.get(command.authenticatedSid) !== command.userId) fail("authenticated_sid_mismatch");
      this.sessions.delete(command.authenticatedSid);
      this.pending = this.pending.filter((row) => row.kakaoId !== command.targetKakaoId);
      for (const member of linked) {
        const alumniRecordId = member.alumniRecordId;
        member.userId = null;
        if (command.clearAlumniLink) member.alumniRecordId = null;
        if (member.alumniRecordId !== alumniRecordId) fail("member_alumni_link_must_survive_delete");
        this.#appendLink(member, "unlink_user", command.userId);
      }
      for (const alumni of this.alumni.values()) {
        if (alumni.matchedUserId !== command.userId) continue;
        if (!command.retainLegacyMatchedUser) alumni.matchedUserId = null;
        if (!command.retainLegacyIsMatched) alumni.isMatched = false;
        if (alumni.matchedUserId !== null || alumni.isMatched) fail("legacy_alumni_match_not_cleared");
      }
      this.users.delete(command.userId);
      this.audit.push({ entity: "account", action: "delete", operationUid: command.reservedOperationUid });
      return { rateLimitDeleteEvents: this.audit.filter((row) => row.operationUid === command.reservedOperationUid && row.entity === "event_parse_rate_limit").length, deletedPendingRows: snapshot.pending.length - this.pending.length, deletedSession: command.authenticatedSid, linkedMembers: linked.length };
    } catch (error) {
      this.users = snapshot.users; this.alumni = snapshot.alumni; this.members = snapshot.members; this.activities = snapshot.activities; this.links = snapshot.links; this.sessions = snapshot.sessions; this.pending = snapshot.pending; this.rateLimits = snapshot.rateLimits; this.audit = snapshot.audit;
      throw error;
    }
  }
  activityIntervals(memberId: number): Array<{ startsAt: string; endsAt: string | null }> {
    const rows = this.activities.filter((row) => row.memberId === memberId).sort((a, b) => a.activityNo - b.activityNo);
    rows.forEach((row, index) => { if (row.activityNo !== index + 1) fail("member_activity_number_gap"); if (index > 0 && rows[index - 1].state === row.state) fail("member_activity_not_alternating"); });
    return rows.filter((row) => row.state === "active").map((row) => ({ startsAt: row.effectiveAt, endsAt: rows.find((candidate) => candidate.activityNo === row.activityNo + 1)?.effectiveAt ?? null }));
  }
  #requireAdmin(actor: Actor): void { const live = this.users.get(actor.userId); if (!live || live.uid !== actor.userUid || !live.isAdmin || !actor.isAdmin) fail("live_admin_actor_required"); }
  #appendLink(member: Member, operation: Link["operation"], actorUserId: number | null): void {
    const existing = this.links.filter((row) => row.memberId === member.id);
    const resultLinkKind = member.userId !== null && member.alumniRecordId !== null ? "both" : member.userId !== null ? "user" : member.alumniRecordId !== null ? "alumni" : "none";
    this.links.push({ memberId: member.id, version: existing.length + 1, operation, userIdSnapshot: member.userId, alumniRecordIdSnapshot: member.alumniRecordId, resultLinkKind, actorUserId });
  }
}
