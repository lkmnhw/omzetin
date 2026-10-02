import type { Queryable } from "./db";
export async function accessibleOutlets(db: Queryable, userId: string) {
  return (
    await db.query(
      `SELECT b.id,b.organization_id,b.outlet_name,b.timezone,o.name organization_name,
 CASE WHEN EXISTS(SELECT 1 FROM organization_owners m WHERE m.organization_id=b.organization_id AND m.user_id=$1) THEN 'owner' ELSE 'cashier' END role
 FROM businesses b JOIN organizations o ON o.id=b.organization_id
 WHERE EXISTS(SELECT 1 FROM organization_owners m WHERE m.organization_id=b.organization_id AND m.user_id=$1)
 OR EXISTS(SELECT 1 FROM outlet_cashiers m WHERE m.outlet_id=b.id AND m.user_id=$1)
 ORDER BY o.created_at,b.created_at,b.outlet_name`,
      [userId],
    )
  ).rows;
}
