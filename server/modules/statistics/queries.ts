import { sql } from "drizzle-orm";
import {
  ADMIN_STATISTICS_TIME_ZONE,
  type AdminStatistics,
  type AdminStatisticsPeriod,
  type PublicationCategory,
  type PublicationDay,
} from "@shared/contracts/admin-statistics";
import { db } from "../../db";
import { users, pendingRegistrations, alumniDatabase, posts, categories } from "../../db/schema";

type StatisticsRow = {
  asOf: string;
  membersTotal: number;
  membersLinked: number;
  pending: number;
  alumniTotal: number;
  alumniLinked: number;
  undatedPosts: number;
  postsTotal: number;
  postsHidden: number;
  byCategory: PublicationCategory[];
  byDay: PublicationDay[];
};

export async function getAdminStatistics(period: AdminStatisticsPeriod): Promise<AdminStatistics> {
  // One SELECT gives all counts the same snapshot without loading personal records.
  // Existing timestamp-without-time-zone columns hold UTC values; convert both
  // boundaries and daily buckets explicitly, independent of the DB session timezone.
  const result = await db.execute<StatisticsRow>(sql`
    WITH published_posts AS (
      SELECT coalesce(${posts.publishedAt}, ${posts.createdAt}) AS published_at,
             ${posts.categoryId} AS category_id, ${posts.isHidden} AS is_hidden
      FROM ${posts} WHERE ${posts.isPublished} = true
    ), period_posts AS (
      SELECT * FROM published_posts
      WHERE published_at >= (
        ${period.from}::date::timestamp AT TIME ZONE ${ADMIN_STATISTICS_TIME_ZONE}
      ) AT TIME ZONE 'UTC'
      AND published_at < (
        (${period.to}::date + 1)::timestamp AT TIME ZONE ${ADMIN_STATISTICS_TIME_ZONE}
      ) AT TIME ZONE 'UTC'
    )
    SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",
      (SELECT count(*)::integer FROM ${users}) AS "membersTotal",
      (SELECT count(*)::integer FROM ${users} WHERE EXISTS (
        SELECT 1 FROM ${alumniDatabase} WHERE ${alumniDatabase.matchedUserId} = ${users.id}
      )) AS "membersLinked",
      (SELECT count(*)::integer FROM ${pendingRegistrations}
        WHERE ${pendingRegistrations.status} = 'pending') AS pending,
      (SELECT count(*)::integer FROM ${alumniDatabase}) AS "alumniTotal",
      (SELECT count(*)::integer FROM ${alumniDatabase}
        WHERE ${alumniDatabase.matchedUserId} IS NOT NULL) AS "alumniLinked",
      (SELECT count(*)::integer FROM published_posts
        WHERE published_at IS NULL) AS "undatedPosts",
      (SELECT count(*)::integer FROM period_posts) AS "postsTotal",
      (SELECT count(*)::integer FROM period_posts WHERE is_hidden) AS "postsHidden",
      (SELECT coalesce(jsonb_agg(counts ORDER BY total DESC, label, "categoryId"), '[]'::jsonb)
        FROM (
          SELECT p.category_id AS "categoryId", coalesce(${categories.displayName}, '미분류') AS label,
            count(*)::integer AS total,
            (count(*) FILTER (WHERE p.is_hidden))::integer AS hidden
          FROM period_posts p LEFT JOIN ${categories} ON ${categories.id} = p.category_id
          GROUP BY p.category_id, ${categories.displayName}
        ) counts
      ) AS "byCategory",
      (SELECT coalesce(jsonb_agg(counts ORDER BY date), '[]'::jsonb)
        FROM (
          SELECT to_char(published_at AT TIME ZONE 'UTC'
            AT TIME ZONE ${ADMIN_STATISTICS_TIME_ZONE}, 'YYYY-MM-DD') AS date,
            count(*)::integer AS total,
            (count(*) FILTER (WHERE is_hidden))::integer AS hidden
          FROM period_posts GROUP BY date
        ) counts
      ) AS "byDay"
  `);
  const row = result.rows[0];
  const countsByDay = new Map(row.byDay.map((item) => [item.date, item]));
  const byDay: PublicationDay[] = [];
  const day = new Date(`${period.from}T00:00:00Z`);
  const lastDay = Date.parse(`${period.to}T00:00:00Z`);
  while (day.getTime() <= lastDay) {
    const date = day.toISOString().slice(0, 10);
    byDay.push(countsByDay.get(date) ?? { date, total: 0, hidden: 0 });
    day.setUTCDate(day.getUTCDate() + 1);
  }

  return {
    asOf: row.asOf,
    period: { ...period, timeZone: ADMIN_STATISTICS_TIME_ZONE },
    snapshot: {
      members: {
        total: row.membersTotal,
        linked: row.membersLinked,
        unlinked: row.membersTotal - row.membersLinked,
      },
      pendingRegistrations: row.pending,
      alumni: {
        total: row.alumniTotal,
        linked: row.alumniLinked,
        unlinked: row.alumniTotal - row.alumniLinked,
      },
      undatedPosts: row.undatedPosts,
    },
    posts: {
      total: row.postsTotal,
      hidden: row.postsHidden,
      byCategory: row.byCategory,
      byDay,
    },
  };
}
