export const coreSchema = `
CREATE TABLE IF NOT EXISTS business_members (
 organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
 role text NOT NULL CHECK(role IN ('management','manager','employee','investor')),
 active boolean NOT NULL DEFAULT true, all_outlets boolean NOT NULL DEFAULT false,
 PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS member_outlets (
 organization_id uuid NOT NULL, user_id uuid NOT NULL, outlet_id uuid NOT NULL REFERENCES businesses(id),
 FOREIGN KEY(organization_id,user_id) REFERENCES business_members(organization_id,user_id),
 PRIMARY KEY(organization_id,user_id,outlet_id)
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='core-v1') THEN
 INSERT INTO business_members(organization_id,user_id,role,all_outlets)
 SELECT organization_id,user_id,'management',true FROM organization_owners ON CONFLICT DO NOTHING;
 INSERT INTO business_members(organization_id,user_id,role)
 SELECT DISTINCT b.organization_id,a.user_id,'employee' FROM outlet_cashiers a JOIN businesses b ON b.id=a.outlet_id ON CONFLICT DO NOTHING;
 INSERT INTO member_outlets(organization_id,user_id,outlet_id)
 SELECT b.organization_id,a.user_id,a.outlet_id FROM outlet_cashiers a JOIN businesses b ON b.id=a.outlet_id ON CONFLICT DO NOTHING;
 INSERT INTO schema_migrations(version) VALUES('core-v1');
 END IF;
END $$;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS operating_schedule jsonb NOT NULL DEFAULT '{"days":[0,1,2,3,4,5,6],"open":"08:00","close":"22:00","shifts":[{"name":"Shift 1","start":"08:00","end":"15:00"},{"name":"Shift 2","start":"15:00","end":"22:00"}]}'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cost_targets jsonb NOT NULL DEFAULT '{"salary":25,"operational":15,"irregular":5,"marketing":3}'::jsonb;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT 'Shift';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS business_date date;
UPDATE shifts s SET business_date=(s.opened_at AT TIME ZONE b.timezone)::date FROM businesses b WHERE b.id=s.business_id AND s.business_date IS NULL;
ALTER TABLE shifts ALTER COLUMN business_date SET NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'cash';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='core-channels-v1') THEN
 UPDATE orders SET channel=CASE WHEN payment_method='cash' THEN 'cash' ELSE 'qris' END;
 INSERT INTO schema_migrations(version) VALUES('core-channels-v1');
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS operational_documents (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id), user_id uuid REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('income','expense','refund')),
 channel text NOT NULL DEFAULT 'cash' CHECK(channel IN ('cash','gojek','grab','qris','transfer')),
 cost_group text NOT NULL DEFAULT 'daily' CHECK(cost_group IN ('daily','monthly','irregular')),
 category text NOT NULL DEFAULT 'other' CHECK(category IN ('materials','packaging','salary','operational','marketing','equipment','logistics','other')),
 amount numeric(18,0) NOT NULL CHECK(amount>=0), description text NOT NULL,
 reference text NOT NULL DEFAULT '', proof text NOT NULL DEFAULT '',
 account text NOT NULL DEFAULT 'safe' CHECK(account IN ('cash','safe','bank')),
 business_date date NOT NULL, shift_id uuid, source_key text NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','submitted','approved','returned','rejected','voided')),
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, review_note text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1, posted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,source_key), UNIQUE(business_id,id),
 FOREIGN KEY(business_id,shift_id) REFERENCES shifts(business_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS external_income_reference ON operational_documents(business_id,channel,reference)
 WHERE kind='income' AND source_key LIKE 'manual:%' AND reference<>'' AND status<>'voided';
CREATE TABLE IF NOT EXISTS income_receipts (
 id uuid PRIMARY KEY, business_id uuid NOT NULL, document_id uuid NOT NULL,
 gross numeric(18,0) NOT NULL CHECK(gross>0), net numeric(18,0) NOT NULL CHECK(net>=0 AND net<=gross),
 received_date date NOT NULL, reference text NOT NULL, user_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(business_id,document_id) REFERENCES operational_documents(business_id,id),
 UNIQUE(business_id,reference)
);
CREATE TABLE IF NOT EXISTS attendance (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id), user_id uuid NOT NULL REFERENCES users(id),
 business_date date NOT NULL, shift_label text NOT NULL, expected_start timestamptz,
 clock_in timestamptz NOT NULL DEFAULT now(), clock_out timestamptz, note text NOT NULL DEFAULT '',
 updated_by uuid REFERENCES users(id), CHECK(clock_out IS NULL OR clock_out>=clock_in)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_attendance ON attendance(user_id) WHERE clock_out IS NULL;
CREATE TABLE IF NOT EXISTS published_reports (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), outlet_id uuid REFERENCES businesses(id),
 month text NOT NULL, revision integer NOT NULL, snapshot jsonb NOT NULL,
 published_by uuid NOT NULL REFERENCES users(id), published_at timestamptz NOT NULL DEFAULT now(), note text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS report_revision ON published_reports(organization_id,COALESCE(outlet_id,'00000000-0000-0000-0000-000000000000'::uuid),month,revision);
CREATE TABLE IF NOT EXISTS dividend_plans (
 id uuid PRIMARY KEY, report_id uuid NOT NULL UNIQUE REFERENCES published_reports(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 amount numeric(18,0) NOT NULL CHECK(amount>=0), infaq numeric(18,0) NOT NULL DEFAULT 0 CHECK(infaq>=0),
 management_percent numeric(8,4) NOT NULL CHECK(management_percent>=0 AND management_percent<=100),
 investor_percent numeric(8,4) NOT NULL CHECK(investor_percent>=0 AND investor_percent<=100),
 allocations jsonb NOT NULL, note text NOT NULL DEFAULT '', created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(management_percent+investor_percent=100)
);
CREATE TABLE IF NOT EXISTS dividend_payments (
 id uuid PRIMARY KEY, plan_id uuid NOT NULL REFERENCES dividend_plans(id), user_id uuid NOT NULL REFERENCES users(id),
 amount numeric(18,0) NOT NULL CHECK(amount>0), paid_date date NOT NULL, reference text NOT NULL, proof text NOT NULL DEFAULT '',
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(plan_id,reference)
);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS core_mirrored boolean NOT NULL DEFAULT false;
ALTER TABLE operational_documents ADD COLUMN IF NOT EXISTS related_document uuid;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='core_related_document') THEN
 ALTER TABLE operational_documents ADD CONSTRAINT core_related_document FOREIGN KEY(business_id,related_document) REFERENCES operational_documents(business_id,id);
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS manual_refund_reference ON operational_documents(business_id,reference) WHERE kind='refund' AND source_key LIKE 'manual-refund:%';
CREATE INDEX IF NOT EXISTS core_documents_period ON operational_documents(business_id,business_date,status,kind);
CREATE INDEX IF NOT EXISTS core_receipts_document ON income_receipts(document_id,received_date);
CREATE INDEX IF NOT EXISTS core_attendance_outlet ON attendance(business_id,clock_in DESC);
CREATE INDEX IF NOT EXISTS core_reports_period ON published_reports(organization_id,month,revision DESC);
CREATE INDEX IF NOT EXISTS businesses_organization ON businesses(organization_id);
ALTER TABLE dividend_payments ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE dividend_payments ADD COLUMN IF NOT EXISTS account text CHECK(account IN ('safe','bank'));
`;
