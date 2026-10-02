export const schema = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS businesses (
 id uuid PRIMARY KEY, name text NOT NULL, outlet_name text NOT NULL,
 timezone text NOT NULL DEFAULT 'Asia/Makassar', closed_through date,
 demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 name text NOT NULL, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','cashier')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_attempts (
 key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 name text NOT NULL, category text NOT NULL, description text NOT NULL DEFAULT '',
 price numeric(18,0) NOT NULL CHECK(price>0), emoji text NOT NULL DEFAULT '☕',
 color text NOT NULL DEFAULT 'sage', recipe jsonb NOT NULL DEFAULT '[]',
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(business_id,id)
);
CREATE TABLE IF NOT EXISTS ingredients (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 name text NOT NULL, unit text NOT NULL, quantity numeric(20,6) NOT NULL DEFAULT 0,
 reserved numeric(20,6) NOT NULL DEFAULT 0, value numeric(24,6) NOT NULL DEFAULT 0,
 minimum numeric(20,6) NOT NULL DEFAULT 0,
 CHECK(quantity>=0 AND reserved>=0 AND reserved<=quantity AND value>=0 AND minimum>=0), UNIQUE(business_id,id)
);
CREATE TABLE IF NOT EXISTS shifts (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id), user_id uuid NOT NULL REFERENCES users(id),
 opening numeric(18,0) NOT NULL CHECK(opening>=0), opened_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz, expected numeric(24,6), counted numeric(18,0), difference numeric(24,6), note text NOT NULL DEFAULT '', UNIQUE(business_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON shifts(business_id) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 number bigint GENERATED ALWAYS AS IDENTITY, shift_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
 items jsonb NOT NULL, consumption jsonb NOT NULL, subtotal numeric(18,0) NOT NULL,
 discount numeric(18,0) NOT NULL DEFAULT 0, total numeric(18,0) NOT NULL CHECK(total>0),
 cost numeric(24,6) NOT NULL DEFAULT 0, payment_method text NOT NULL CHECK(payment_method IN ('cash','digital')),
 tendered numeric(18,0) NOT NULL, reference text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','fulfilled','cancelled','refunded')),
 service text NOT NULL CHECK(service IN ('dine_in','takeaway')), note text NOT NULL DEFAULT '',
 reason text NOT NULL DEFAULT '', business_date date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), fulfilled_at timestamptz, fulfilled_business_date date,
 FOREIGN KEY(business_id,shift_id) REFERENCES shifts(business_id,id), UNIQUE(business_id,id), UNIQUE(business_id,number)
);
CREATE INDEX IF NOT EXISTS orders_business_date ON orders(business_id,business_date,status);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilled_business_date date;
CREATE TABLE IF NOT EXISTS journal_entries (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 source_key text NOT NULL, description text NOT NULL, business_date date NOT NULL,
 shift_id uuid, order_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,source_key), UNIQUE(business_id,id),
 FOREIGN KEY(business_id,shift_id) REFERENCES shifts(business_id,id),
 FOREIGN KEY(business_id,order_id) REFERENCES orders(business_id,id)
);
CREATE TABLE IF NOT EXISTS journal_lines (
 id uuid PRIMARY KEY, business_id uuid NOT NULL, entry_id uuid NOT NULL,
 account text NOT NULL CHECK(account IN ('cash','safe','bank','clearing','inventory','advance','sales','discount','returns','cogs','expense','waste','variance','capital','payment_fee')),
 debit numeric(24,6) NOT NULL DEFAULT 0, credit numeric(24,6) NOT NULL DEFAULT 0,
 CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)),
 FOREIGN KEY(business_id,entry_id) REFERENCES journal_entries(business_id,id)
);
CREATE INDEX IF NOT EXISTS journal_business_account ON journal_lines(business_id,account);
CREATE TABLE IF NOT EXISTS stock_movements (
 id uuid PRIMARY KEY, business_id uuid NOT NULL, ingredient_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('opening','purchase','consumption','waste','stocktake')),
 quantity numeric(20,6) NOT NULL, value numeric(24,6) NOT NULL, note text NOT NULL,
 order_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(business_id,ingredient_id) REFERENCES ingredients(business_id,id),
 FOREIGN KEY(business_id,order_id) REFERENCES orders(business_id,id)
);
CREATE TABLE IF NOT EXISTS expenses (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id), category text NOT NULL,
 description text NOT NULL, amount numeric(18,0) NOT NULL CHECK(amount>0),
 account text NOT NULL CHECK(account IN ('cash','safe','bank')), business_date date NOT NULL,
 shift_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(business_id,shift_id) REFERENCES shifts(business_id,id)
);
CREATE TABLE IF NOT EXISTS settlements (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 gross numeric(18,0) NOT NULL CHECK(gross>0), fee numeric(18,0) NOT NULL CHECK(fee>=0 AND fee<gross),
 reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS idempotency_records (
 business_id uuid NOT NULL REFERENCES businesses(id), key text NOT NULL, request_hash text NOT NULL,
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(business_id,key)
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id), user_id uuid REFERENCES users(id),
 action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organizations (
 id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
INSERT INTO organizations(id,name) SELECT id,name FROM businesses WHERE organization_id IS NULL ON CONFLICT(id) DO NOTHING;
UPDATE businesses SET organization_id=id WHERE organization_id IS NULL;
ALTER TABLE businesses ALTER COLUMN organization_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS organization_owners (
 organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS outlet_cashiers (
 outlet_id uuid NOT NULL REFERENCES businesses(id), user_id uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(outlet_id,user_id)
);
-- Backfill only once so later assignments are not recreated by repeated schema runs.
CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='multioutlet-v1') THEN
 INSERT INTO organization_owners(organization_id,user_id) SELECT b.organization_id,u.id FROM users u JOIN businesses b ON b.id=u.business_id WHERE u.role='owner' ON CONFLICT DO NOTHING;
 INSERT INTO outlet_cashiers(outlet_id,user_id) SELECT business_id,id FROM users WHERE role='cashier' ON CONFLICT DO NOTHING;
 INSERT INTO schema_migrations(version) VALUES('multioutlet-v1');
 END IF;
END $$;
CREATE OR REPLACE FUNCTION verify_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid uuid; total_debit numeric; total_credit numeric; line_count integer;
BEGIN
 IF TG_TABLE_NAME='journal_entries' THEN eid := NEW.id; ELSE eid := COALESCE(NEW.entry_id, OLD.entry_id); END IF;
 SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0), count(*) INTO total_debit,total_credit,line_count FROM journal_lines WHERE entry_id=eid;
 IF line_count<2 OR total_debit<>total_credit THEN RAISE EXCEPTION 'Jurnal tidak seimbang'; END IF;
 RETURN NULL;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='balanced_entry') THEN
 CREATE CONSTRAINT TRIGGER balanced_entry AFTER INSERT ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_journal_balance();
 CREATE CONSTRAINT TRIGGER balanced_lines AFTER INSERT OR UPDATE OR DELETE ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_journal_balance();
 END IF;
END $$;
`;
