import type { Queryable } from "./db";
import type { User } from "./app";
import { syncOperationalDocuments } from "./core";

/** Reconcile legacy documents at migration/startup, without duplicating ledger postings. */
export async function reconcileCore(tx: Queryable) {
  const outlets = (
    await tx.query(
      `SELECT b.id,b.organization_id,COALESCE((SELECT m.user_id FROM business_members m WHERE m.organization_id=b.organization_id AND m.role='management' AND m.active ORDER BY m.user_id LIMIT 1),(SELECT u.id FROM users u WHERE u.business_id=b.id ORDER BY u.created_at LIMIT 1)) user_id FROM businesses b ORDER BY b.organization_id,b.id`,
    )
  ).rows;
  for (const outlet of outlets) {
    if (!outlet.user_id) continue;
    await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
      outlet.organization_id,
    ]);
    await tx.query("SELECT id FROM businesses WHERE id=$1 FOR UPDATE", [
      outlet.id,
    ]);
    await syncOperationalDocuments(tx, outlet.id, {
      id: outlet.user_id,
      business_id: outlet.id,
      organization_id: outlet.organization_id,
      role: "owner",
    } as User);
  }
}
