import type { Database, Queryable } from "./db";
import { uid, post, businessDay, D, fixed } from "./domain";
import { passwordHash } from "./security";
export async function createBusiness(
  tx: Queryable,
  input: {
    name: string;
    outlet: string;
    owner: string;
    email: string;
    passwordHash: string;
    demo?: boolean;
    capital?: number;
  },
) {
  const bid = uid(),
    user = uid(),
    organization = uid();
  await tx.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
    organization,
    input.name,
  ]);
  await tx.query(
    "INSERT INTO businesses(id,name,outlet_name,demo,organization_id) VALUES($1,$2,$3,$4,$5)",
    [bid, input.name, input.outlet, !!input.demo, organization],
  );
  await tx.query(
    "INSERT INTO users(id,business_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5,'owner')",
    [user, bid, input.owner, input.email, input.passwordHash],
  );
  await tx.query(
    "INSERT INTO organization_owners(organization_id,user_id) VALUES($1,$2)",
    [organization, user],
  );
  if (input.capital)
    await post(
      tx,
      bid,
      businessDay(),
      "opening-capital",
      "Saldo pembukaan kas brankas",
      [
        { account: "safe", debit: input.capital },
        { account: "capital", credit: input.capital },
      ],
    );
  return { businessId: bid, userId: user };
}
export async function seedDemo(db: Database) {
  if ((await db.query("SELECT id FROM businesses LIMIT 1")).rows.length) return;
  const pw = await passwordHash(db, "OmzetinDemo123!");
  await db.transaction(async (tx) => {
    const { businessId: bid } = await createBusiness(tx, {
      name: "Studio Rasa",
      outlet: "Outlet Makassar",
      owner: "Pemilik Demo",
      email: "demo@omzetin.local",
      passwordHash: pw,
      demo: true,
      capital: 2000000,
    });
    const materials = [
      ["Biji kopi", "g", 3000, 210000, 300],
      ["Susu segar", "ml", 10000, 200000, 1500],
      ["Gula aren", "ml", 2000, 80000, 300],
      ["Matcha", "g", 500, 150000, 60],
      ["Cokelat", "g", 1000, 100000, 150],
      ["Croissant", "pcs", 20, 160000, 5],
      ["Cup dan tutup", "pcs", 100, 60000, 15],
    ] as const;
    const ids: string[] = [];
    let total = D(0);
    for (const [name, unit, quantity, value, minimum] of materials) {
      const id = uid();
      ids.push(id);
      total = total.plus(value);
      await tx.query(
        "INSERT INTO ingredients(id,business_id,name,unit,quantity,value,minimum) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, bid, name, unit, quantity, value, minimum],
      );
      await tx.query(
        "INSERT INTO stock_movements(id,business_id,ingredient_id,kind,quantity,value,note) VALUES($1,$2,$3,'opening',$4,$5,'Stok pembukaan demo')",
        [uid(), bid, id, quantity, value],
      );
    }
    await post(
      tx,
      bid,
      businessDay(),
      "opening-stock",
      "Persediaan pembukaan demo",
      [
        { account: "inventory", debit: fixed(total) },
        { account: "capital", credit: fixed(total) },
      ],
    );
    const products = [
      [
        "Kopi Susu Aren",
        "Kopi",
        24000,
        "☕",
        "sand",
        "Espresso, susu segar, gula aren",
        [
          [0, 18],
          [1, 150],
          [2, 25],
          [6, 1],
        ],
      ],
      [
        "Americano",
        "Kopi",
        20000,
        "☕",
        "coffee",
        "Espresso dengan air, bersih dan ringan",
        [
          [0, 18],
          [6, 1],
        ],
      ],
      [
        "Caffè Latte",
        "Kopi",
        26000,
        "☕",
        "cream",
        "Espresso dan susu yang lembut",
        [
          [0, 18],
          [1, 180],
          [6, 1],
        ],
      ],
      [
        "Matcha Latte",
        "Nonkopi",
        28000,
        "🍵",
        "sage",
        "Matcha premium dengan susu segar",
        [
          [3, 5],
          [1, 180],
          [6, 1],
        ],
      ],
      [
        "Chocolate",
        "Nonkopi",
        26000,
        "🍫",
        "cocoa",
        "Cokelat pekat dan susu segar",
        [
          [4, 25],
          [1, 150],
          [6, 1],
        ],
      ],
      [
        "Butter Croissant",
        "Makanan",
        22000,
        "🥐",
        "peach",
        "Pastry mentega dengan lapisan renyah",
        [[5, 1]],
      ],
    ] as const;
    for (const [
      name,
      category,
      price,
      emoji,
      color,
      description,
      recipe,
    ] of products)
      await tx.query(
        "INSERT INTO products(id,business_id,name,category,price,emoji,color,description,recipe) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          uid(),
          bid,
          name,
          category,
          price,
          emoji,
          color,
          description,
          JSON.stringify(
            recipe.map(([i, q]) => ({
              ingredientId: ids[i],
              quantity: String(q),
            })),
          ),
        ],
      );
  });
}
