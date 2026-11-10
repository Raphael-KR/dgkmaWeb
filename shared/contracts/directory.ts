// 회원 명부 목록의 노출 허용 필드. 연락처·주소·메모는 포함하지 않는다.
export type DirectoryAlumni = {
  id: number;
  name: string;
  generation: string;
  department: string;
  graduationYear: number | null;
  position: string | null;
  isMatched: boolean;
};

export type DirectoryResult = {
  alumni: DirectoryAlumni[];
  total: number; // 검색어와 무관한 열람 범위 전체 인원.
  hasScope: boolean;
  scope: { generation: string | null; region: string | null };
};
