import { sql } from "drizzle-orm";
import { posts } from "../../db/schema";
import { POST_TEXT_BOUNDARIES } from "@shared/contracts/post-document";

/** Mirrors postDocumentText: ordered text leaves, with a newline before each text block. */
export function postBodyTextExpression() {
  return sql<string>`(WITH RECURSIVE body_nodes(node, position) AS (
    SELECT ${posts.content}, ARRAY[]::integer[]
    UNION ALL
    SELECT child.value, body_nodes.position || child.ordinality::integer
    FROM body_nodes
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(body_nodes.node->'content', '[]'::jsonb))
      WITH ORDINALITY AS child(value, ordinality)
  ) SELECT coalesce(string_agg(CASE
    WHEN node->>'type' = 'text' THEN node->>'text'
    WHEN node->>'type' IN (${sql.join(
      POST_TEXT_BOUNDARIES.map((type) => sql`${type}`),
      sql`, `,
    )}) THEN E'\n'
    ELSE '' END, '' ORDER BY position), '') FROM body_nodes)`;
}
