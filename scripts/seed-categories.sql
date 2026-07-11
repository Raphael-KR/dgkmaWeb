INSERT INTO categories (
  name,
  display_name,
  color,
  badge_variant,
  is_active,
  sort_order
)
VALUES
  ('all', '전체', '#6b7280', 'secondary', true, 0),
  ('notice', '공지', '#ef4444', 'destructive', true, 1),
  ('free', '자유', '#3b82f6', 'default', true, 2),
  ('event', '행사', '#22c55e', 'secondary', true, 3),
  ('news', '소식', '#f59e0b', 'outline', true, 4)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  color = EXCLUDED.color,
  badge_variant = EXCLUDED.badge_variant,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
