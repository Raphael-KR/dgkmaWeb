import { users } from "@shared/schema";
import { rosterName } from "./roster";

export const adminAlumniColumns = {
  id: users.id,
  name: rosterName,
  department: users.department,
  generation: users.generation,
  admissionDate: users.admissionDate,
  graduationDate: users.graduationDate,
  mobile: users.alumniMobile,
  group: users.alumniGroup,
  status: users.alumniStatus,
  alumniPosition: users.alumniPosition,
  memo: users.alumniMemo,
};
