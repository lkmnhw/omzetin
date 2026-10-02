import type { Queryable } from "./db";
import { uid, post, businessDay } from "./domain";
export async function createOutlet(
  tx: Queryable,
  input: {
    organizationId: string;
    brand: string;
    name: string;
    timezone: string;
    demo: boolean;
    capital: number;
    copyFrom?: string;
  },
) {
  const outletId = uid();
  await tx.query(
    "INSERT INTO businesses(id,organization_id,name,outlet_name,timezone,demo) VALUES($1,$2,$3,$4,$5,$6)",
    [
      outletId,
      input.organizationId,
      input.brand,
      input.name,
      input.timezone,
      input.demo,
    ],
  );
  if (input.capital)
    await post(
      tx,
      outletId,
      businessDay(input.timezone),
      "opening-capital",
      "Modal pembukaan outlet",
      [
        { account: "safe", debit: input.capital },
        { account: "capital", credit: input.capital },
      ],
    );
  if (input.copyFrom) {
    const materials = (
        await tx.query("SELECT * FROM ingredients WHERE business_id=$1", [
          input.copyFrom,
        ])
      ).rows,
      ids = new Map<string, string>();
    for (const material of materials) {
      const newId = uid();
      ids.set(material.id, newId);
      await tx.query(
        "INSERT INTO ingredients(id,business_id,name,unit,minimum) VALUES($1,$2,$3,$4,$5)",
        [newId, outletId, material.name, material.unit, material.minimum],
      );
    }
    for (const p of (
      await tx.query("SELECT * FROM products WHERE business_id=$1", [
        input.copyFrom,
      ])
    ).rows) {
      await tx.query(
        "INSERT INTO products(id,business_id,name,category,description,price,emoji,color,recipe,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          uid(),
          outletId,
          p.name,
          p.category,
          p.description,
          p.price,
          p.emoji,
          p.color,
          JSON.stringify(
            p.recipe.map((r: any) => ({
              ...r,
              ingredientId: ids.get(r.ingredientId),
            })),
          ),
          p.active,
        ],
      );
    }
  }
  return outletId;
}
