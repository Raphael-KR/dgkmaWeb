import { alumniDatabase } from "@shared/schema";

// 연결 명부는 주소·전화를 조회하지 않는다. 심사 후보에서만 두 항목을 추가한다.
export const linkedAlumniColumns = {
  id: alumniDatabase.id,
  name: alumniDatabase.name,
  department: alumniDatabase.department,
  generation: alumniDatabase.generation,
  admissionDate: alumniDatabase.admissionDate,
  graduationDate: alumniDatabase.graduationDate,
  mobile: alumniDatabase.mobile,
  group: alumniDatabase.group,
  status: alumniDatabase.status,
  alumniPosition: alumniDatabase.alumniPosition,
  memo: alumniDatabase.memo,
};

export const adminAlumniColumns = {
  ...linkedAlumniColumns,
  address: alumniDatabase.address,
  phone: alumniDatabase.phone,
};
