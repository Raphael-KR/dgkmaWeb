import { sql } from "drizzle-orm";
import { users } from "../../db/schema";

// Read the profile in the same SQL statement that first publishes the byline.
export function affiliationAtWriting(authorId: string) {
  return sql<
    string | null
  >`(select ${users.affiliation} from ${users} where ${users.id} = ${authorId})`;
}
