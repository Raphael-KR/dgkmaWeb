import assert from "node:assert/strict";
import test from "node:test";
import { MemberActorContractMachine, validateMemberActorManifest } from "./member-actor-contract";

const ADMIN_UID = "11111111-1111-4111-8111-111111111111";
const MEMBER_UID = "22222222-2222-4222-8222-222222222222";

function seeded(withRateLimit = true) {
  const machine = new MemberActorContractMachine();
  const admin = machine.addUser(1, ADMIN_UID, "관리자", true, "admin-kakao");
  machine.addUser(2, MEMBER_UID, "회원", false, "target-kakao");
  machine.addAlumni(101, 2);
  machine.sessions.set("current-sid", 2);
  machine.sessions.set("stale-sid", 2);
  machine.sessions.set("unrelated-sid", 1);
  machine.pending.push(
    { id: 1, kakaoId: "target-kakao", email: "target@example.invalid", name: "회원" },
    { id: 2, kakaoId: "other-kakao", email: "target@example.invalid", name: "회원" },
  );
  if (withRateLimit) machine.rateLimits.add(2);
  return { machine, admin };
}

test("Todo 12 manifest closes member tables and both deletion registries", () => {
  const result = validateMemberActorManifest();
  assert.equal(result.memberTableCount, 4);
  assert.ok(result.userFkCount >= 100);
  assert.equal(result.nonFkCount, 3);
});

test("member links are globally unique and match approval requires a live admin plus non-name evidence", () => {
  const { machine, admin } = seeded();
  machine.createMember({ memberUid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", displayName: "회원", generation: "22", memberKind: "member", userId: 2, alumniRecordId: 101, joinedAt: "2024-03-01T00:00:00Z" }, admin);
  assert.throws(() => machine.createMember({ memberUid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", displayName: "중복", generation: "22", memberKind: "member", userId: 2, alumniRecordId: null, joinedAt: "2024-03-01T00:00:00Z" }, admin), /member_user_link_duplicate/);
  assert.throws(() => machine.approveCandidate(null, "existing_fk"), /match_decision_live_admin_required/);
  assert.throws(() => machine.approveCandidate(admin, "name_only"), /match_name_only_unapprovable/);
  machine.approveCandidate(admin, "existing_fk");
});

test("end and reactivate cycles retain alternating intervals across a dues-year boundary", () => {
  const { machine, admin } = seeded();
  const member = machine.createMember({ memberUid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", displayName: "회원", generation: "22", memberKind: "member", userId: 2, alumniRecordId: 101, joinedAt: "2024-03-01T00:00:00Z" }, admin);
  machine.transitionMember(member.id, "end", "2024-12-31T15:00:00Z", admin);
  machine.transitionMember(member.id, "reactivate", "2025-01-02T00:00:00Z", admin);
  machine.transitionMember(member.id, "end", "2025-12-31T15:00:00Z", admin);
  machine.transitionMember(member.id, "reactivate", "2026-01-02T00:00:00Z", admin);
  assert.deepEqual(machine.activityIntervals(member.id), [
    { startsAt: "2024-03-01T00:00:00Z", endsAt: "2024-12-31T15:00:00Z" },
    { startsAt: "2025-01-02T00:00:00Z", endsAt: "2025-12-31T15:00:00Z" },
    { startsAt: "2026-01-02T00:00:00Z", endsAt: null },
  ]);
  assert.equal(machine.members.get(member.id)?.endedAt, null);
});

for (const withRateLimit of [true, false]) {
  test(`account delete is atomic and exact-keyed (rate limit ${withRateLimit ? "present" : "absent"})`, () => {
    const { machine, admin } = seeded(withRateLimit);
    const member = machine.createMember({ memberUid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", displayName: "회원", generation: "22", memberKind: "member", userId: 2, alumniRecordId: 101, joinedAt: "2024-03-01T00:00:00Z" }, admin);
    const result = machine.deleteAccount({ userId: 2, actor: { userId: 2, userUid: MEMBER_UID, name: "회원", isAdmin: false }, authenticatedSid: "current-sid", targetKakaoId: "target-kakao", reservedOperationUid: "op-delete-1", expectedMechanicalKeys: [`association_members.user_id:${member.id}`], prospectiveOperationUid: "op-delete-1" });
    assert.equal(result.rateLimitDeleteEvents, withRateLimit ? 1 : 0);
    assert.equal(machine.sessions.has("current-sid"), false);
    assert.equal(machine.sessions.has("stale-sid"), true);
    assert.equal(machine.sessions.has("unrelated-sid"), true);
    assert.deepEqual(machine.pending.map((row) => row.kakaoId), ["other-kakao"]);
    assert.equal(machine.members.get(member.id)?.userId, null);
    assert.equal(machine.members.get(member.id)?.alumniRecordId, 101);
    assert.deepEqual(machine.alumni.get(101), { matchedUserId: null, isMatched: false });
    assert.equal(machine.links.at(-1)?.operation, "unlink_user");
    assert.equal(machine.links.at(-1)?.resultLinkKind, "alumni");
  });
}

test("failed account-delete variants roll back every partial mutation", () => {
  const variants = [
    { selectSessionsByUserInference: true }, { selectPendingByCollision: true }, { deleteRateLimitByCascade: true },
    { prospectiveOperationUid: "other-operation" }, { expectedMechanicalKeys: [] }, { clearAlumniLink: true },
    { retainLegacyMatchedUser: true }, { retainLegacyIsMatched: true },
  ];
  for (const variant of variants) {
    const { machine, admin } = seeded();
    machine.createMember({ memberUid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", displayName: "회원", generation: "22", memberKind: "member", userId: 2, alumniRecordId: 101, joinedAt: "2024-03-01T00:00:00Z" }, admin);
    const before = JSON.stringify({ members: [...machine.members], pending: machine.pending, sessions: [...machine.sessions], rateLimits: [...machine.rateLimits], audit: machine.audit });
    assert.throws(() => machine.deleteAccount({ userId: 2, actor: { userId: 2, userUid: MEMBER_UID, name: "회원", isAdmin: false }, authenticatedSid: "current-sid", targetKakaoId: "target-kakao", reservedOperationUid: "op-delete-1", prospectiveOperationUid: "op-delete-1", expectedMechanicalKeys: ["association_members.user_id:1"], ...variant }));
    assert.equal(JSON.stringify({ members: [...machine.members], pending: machine.pending, sessions: [...machine.sessions], rateLimits: [...machine.rateLimits], audit: machine.audit }), before);
  }
});

test("member-less accounts delete without inventing an association member", () => {
  const { machine } = seeded(false);
  const result = machine.deleteAccount({ userId: 2, actor: { userId: 2, userUid: MEMBER_UID, name: "회원", isAdmin: false }, authenticatedSid: "current-sid", targetKakaoId: "target-kakao", reservedOperationUid: "op-delete-2", expectedMechanicalKeys: [] });
  assert.equal(result.linkedMembers, 0);
  assert.equal(machine.members.size, 0);
  assert.deepEqual(machine.alumni.get(101), { matchedUserId: null, isMatched: false });
});

test("rank-15 Kakao identity lock blocks a same-identity phantom and leaves another identity writable", () => {
  const { machine } = seeded(false);
  machine.beginKakaoIdentityMutation("target-kakao");
  assert.throws(() => machine.createPending({ id: 3, kakaoId: "target-kakao", email: "new@example.invalid", name: "대기" }), /kakao_identity_lock_wait_required/);
  machine.createPending({ id: 4, kakaoId: "independent-kakao", email: "other@example.invalid", name: "독립" });
  machine.finishKakaoIdentityDeletion("target-kakao");
  assert.throws(() => machine.createPending({ id: 5, kakaoId: "target-kakao", email: "new@example.invalid", name: "대기" }), /kakao_identity_terminated/);
  assert.deepEqual(machine.pending.map((row) => row.kakaoId).sort(), ["independent-kakao", "other-kakao"]);
});

test("user-only, alumni-only, both, and ended-member link shapes preserve their identity boundaries", () => {
  const shapes = [
    { name: "user-only", userId: 2, alumniRecordId: null, ended: false },
    { name: "alumni-only", userId: null, alumniRecordId: 101, ended: false },
    { name: "both", userId: 2, alumniRecordId: 101, ended: false },
    { name: "ended-member", userId: 2, alumniRecordId: 101, ended: true },
  ] as const;
  for (const [index, shape] of shapes.entries()) {
    const { machine, admin } = seeded(false);
    const member = machine.createMember({ memberUid: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, displayName: shape.name, generation: "22", memberKind: "member", userId: shape.userId, alumniRecordId: shape.alumniRecordId, joinedAt: "2024-03-01T00:00:00Z" }, admin);
    if (shape.ended) machine.transitionMember(member.id, "end", "2025-03-01T00:00:00Z", admin);
    machine.deleteAccount({ userId: 2, actor: { userId: 2, userUid: MEMBER_UID, name: "회원", isAdmin: false }, authenticatedSid: "current-sid", targetKakaoId: "target-kakao", reservedOperationUid: `op-${shape.name}`, expectedMechanicalKeys: shape.userId === 2 ? [`association_members.user_id:${member.id}`] : [] });
    assert.equal(machine.members.get(member.id)?.alumniRecordId, shape.alumniRecordId);
    assert.equal(machine.members.get(member.id)?.status, shape.ended ? "ended" : "active");
  }
});
