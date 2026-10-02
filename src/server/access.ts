import type { Queryable } from "./db";
export async function accessibleOutlets(db: Queryable, userId: string) {
  return (
    await db.query(
      `
 WITH permissions AS (
 SELECT b.id,b.organization_id,b.outlet_name,b.timezone,o.name organization_name,
 COALESCE(m.role,CASE WHEN ow.user_id IS NOT NULL THEN 'management' ELSE 'employee' END) member_role
 FROM businesses b JOIN organizations o ON o.id=b.organization_id
 LEFT JOIN business_members m ON m.organization_id=b.organization_id AND m.user_id=$1
 LEFT JOIN organization_owners ow ON ow.organization_id=b.organization_id AND ow.user_id=$1
 WHERE (m.active AND (m.all_outlets OR m.role IN ('management','investor') OR EXISTS(SELECT 1 FROM member_outlets a WHERE a.organization_id=b.organization_id AND a.user_id=$1 AND a.outlet_id=b.id)))
 OR (m.user_id IS NULL AND (ow.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM outlet_cashiers a WHERE a.outlet_id=b.id AND a.user_id=$1)))
 ) SELECT *,CASE member_role WHEN 'management' THEN 'owner' WHEN 'employee' THEN 'cashier' ELSE member_role END role FROM permissions ORDER BY organization_name,outlet_name`,
      [userId],
    )
  ).rows;
}
