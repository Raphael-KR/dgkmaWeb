import { alumniDatabase, type User } from "@shared/schema";
import { eq, and, like, or, asc, count, type SQL } from "drizzle-orm";
import { db } from "../../db";
import type { DirectoryAlumni, DirectoryResult } from "@shared/contracts/directory";
import type { AlumniRecordStorage } from "./alumni-record-storage";

// 목록만 제한한다. 총원은 같은 열람 범위의 별도 count로 계산한다.
const DIRECTORY_LIST_LIMIT = 5000;

// 회원 활동지역(시/도) → 동문 DB 주소 텍스트 매칭 패턴.
// 주소가 약칭/정식 혼재("충북 청주" vs "충청북도")이므로 가능한 표기를 함께 검사.
// '해외'는 주소 형식이 일정치 않아 매칭 불가(빈 배열).
const REGION_PATTERNS: Record<string, string[]> = {
  서울특별시: ["서울"],
  부산광역시: ["부산"],
  대구광역시: ["대구"],
  인천광역시: ["인천"],
  광주광역시: ["광주"],
  대전광역시: ["대전"],
  울산광역시: ["울산"],
  세종특별자치시: ["세종"],
  경기도: ["경기"],
  강원특별자치도: ["강원"],
  충청북도: ["충청북", "충북"],
  충청남도: ["충청남", "충남"],
  전북특별자치도: ["전북", "전라북"],
  전라남도: ["전라남", "전남"],
  경상북도: ["경상북", "경북"],
  경상남도: ["경상남", "경남"],
  제주특별자치도: ["제주"],
  해외: [],
};

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
    const regionPatterns = region ? (REGION_PATTERNS[region] ?? []) : [];

    // 열람 범위를 산출할 수 없으면(기수·지역 모두 없음, 관리자 아님) 빈 결과 + 안내 플래그
    const hasScope = isAdmin || !!generation || regionPatterns.length > 0;
    if (!hasScope) {
      return { alumni: [], total: 0, hasScope: false, scope: { generation, region } };
    }

    // 3) 열람 범위 조건 (관리자는 제한 없음 = 전체). 검색어와 무관한 "통계용" 조건.
    let scopeCond: SQL | undefined = undefined;
    if (!isAdmin) {
      const scopeOrs: SQL[] = [];
      if (generation) scopeOrs.push(eq(alumniDatabase.generation, generation));
      for (const p of regionPatterns) {
        scopeOrs.push(like(alumniDatabase.address, `%${p}%`));
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
