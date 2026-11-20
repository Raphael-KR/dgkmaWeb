import { alumniDatabase, users, type User } from "@shared/schema";
import { eq, and, like, or, asc, count, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import type { DirectoryAlumni, DirectoryResult } from "@shared/contracts/directory";
import type { AlumniRecordStorage } from "./alumni-record-storage";

// 목록만 제한한다. 총원은 같은 열람 범위의 별도 count로 계산한다.
const DIRECTORY_LIST_LIMIT = 5000;

export class DirectoryStorage {
  // 실제 호출 receiver는 RegistryStorage/DatabaseStorage의 공통 facade다.
  declare findAlumniByMobile: AlumniRecordStorage["findAlumniByMobile"];

  // 회원 전용 동문 명부 — 본인 기수(동기회) 또는 지부(지역) 범위만 열람. 관리자는 전체.
  // q 가 있으면 그 범위 안에서 이름·기수로 추가 필터링. 노출 필드는 DirectoryAlumni 로 최소화.
  async getDirectoryAlumni(viewer: User, q?: string): Promise<DirectoryResult> {
    const isAdmin = !!viewer.isAdmin;

    // 1) 뷰어 기수 산출: 매칭된 동문 레코드 우선 → 없으면 휴대폰번호로 조회
    let generation: string | null = null;
    const [matched] = await db
      .select({ generation: alumniDatabase.generation })
      .from(alumniDatabase)
      .where(eq(alumniDatabase.matchedUserId, viewer.id))
      .limit(1);
    if (matched?.generation) {
      generation = matched.generation;
    } else if (viewer.phoneNumber) {
      const byMobile = await this.findAlumniByMobile(viewer.phoneNumber);
      if (byMobile?.generation) generation = byMobile.generation;
    }

    // 2) 뷰어 지부(지역) — users.activityRegion 기준
    const region = viewer.activityRegion ?? null;

    // 열람 범위를 산출할 수 없으면(기수·지역 모두 없음, 관리자 아님) 빈 결과 + 안내 플래그
    const hasScope = isAdmin || !!generation || !!region;
    if (!hasScope) {
      return { alumni: [], total: 0, hasScope: false, scope: { generation, region } };
    }

    // 3) 열람 범위 조건 (관리자는 제한 없음 = 전체). 검색어와 무관한 "통계용" 조건.
    let scopeCond: SQL | undefined = undefined;
    if (!isAdmin) {
      const scopeOrs: SQL[] = [];
      if (generation) scopeOrs.push(eq(alumniDatabase.generation, generation));
      if (region) {
        scopeOrs.push(sql`exists (select 1 from ${users}
          where ${users.id} = ${alumniDatabase.matchedUserId}
          and ${users.isVerified} = true and ${users.activityRegion} = ${region})`);
      }
      scopeCond = scopeOrs.length === 1 ? scopeOrs[0] : or(...scopeOrs)!;
    }

    // 통계용 총원 — 검색어(q) 미적용, 열람 범위 전체 기준 (목록이 상한에 걸려도 정확).
    const [{ n: totalCount }] = await db
      .select({ n: count() })
      .from(alumniDatabase)
      .where(scopeCond);
    const total = Number(totalCount);

    // 4) 목록 조건 = 열람 범위 AND 검색어(이름 또는 기수)
    let listCond = scopeCond;
    const term = q?.trim();
    if (term) {
      const qCond = or(
        like(alumniDatabase.name, `%${term}%`),
        like(alumniDatabase.generation, `%${term}%`),
      )!;
      listCond = scopeCond ? and(scopeCond, qCond) : qCond;
    }

    const rows = await db
      .select({
        id: alumniDatabase.id,
        name: alumniDatabase.name,
        generation: alumniDatabase.generation,
        department: alumniDatabase.department,
        graduationDate: alumniDatabase.graduationDate,
        alumniPosition: alumniDatabase.alumniPosition,
        isMatched: alumniDatabase.isMatched,
      })
      .from(alumniDatabase)
      .where(listCond)
      .orderBy(asc(alumniDatabase.generation), asc(alumniDatabase.name))
      .limit(DIRECTORY_LIST_LIMIT);

    const alumni: DirectoryAlumni[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      generation: r.generation,
      department: r.department,
      graduationYear: r.graduationDate
        ? parseInt(r.graduationDate.substring(0, 4), 10) || null
        : null,
      position: r.alumniPosition ?? null,
      isMatched: !!r.isMatched,
    }));

    return { alumni, total, hasScope: true, scope: { generation, region } };
  }
}
