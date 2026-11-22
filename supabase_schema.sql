-- ================================================================
-- Smartflo CRM & Dialer Supabase PostgreSQL Schema
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ================================================================

-- 1. Custom Datapoints Schema Definitions
CREATE TABLE IF NOT EXISTS contact_fields_meta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_key TEXT UNIQUE NOT NULL,          -- e.g. 'gender', 'community', 'stream', 'school'
    label TEXT NOT NULL,                     -- e.g. 'Gender', 'Community / Caste', 'Stream'
    field_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'select', 'number'
    options JSONB DEFAULT '[]'::jsonb,       -- e.g. ["Science", "Commerce", "Arts"]
    is_filter_enabled BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default configurable datapoints
INSERT INTO contact_fields_meta (field_key, label, field_type, options, is_filter_enabled, display_order)
VALUES 
    ('gender', 'Gender', 'select', '["Male", "Female", "Other"]'::jsonb, true, 1),
    ('community', 'Community / Category', 'select', '["General", "OBC", "SC", "ST", "EWS"]'::jsonb, true, 2),
    ('stream', 'Academic Stream', 'select', '["Science", "Commerce", "Arts", "Vocational"]'::jsonb, true, 3),
    ('school', 'School / College', 'text', '[]'::jsonb, true, 4),
    ('city', 'City / District', 'text', '[]'::jsonb, true, 5),
    ('marks', 'Marks / Score', 'number', '[]'::jsonb, true, 6)
ON CONFLICT (field_key) DO NOTHING;

-- 2. Master Contacts Directory (100k - 200k Leads)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) DEFAULT '',
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_calls_count INTEGER DEFAULT 0,
    last_call_status VARCHAR(50),
    last_call_time TIMESTAMPTZ,
    last_dtmf VARCHAR(10),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- High-speed B-Tree on phone and GIN index on attributes for instant multi-datapoint filtering
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts (phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_attributes_gin ON contacts USING GIN (attributes jsonb_path_ops);

-- 3. Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'idle',
    concurrency INTEGER DEFAULT 5,
    ivr_id VARCHAR(50) DEFAULT '89733',
    ivr_name VARCHAR(255) DEFAULT 'DTMF Test IVR',
    api_key TEXT,
    did_mode VARCHAR(50) DEFAULT 'round_robin',
    single_did VARCHAR(50) DEFAULT '917965561295',
    inter_call_delay INTEGER DEFAULT 3,
    audience_filters JSONB DEFAULT '[]'::jsonb,
    total_leads INTEGER DEFAULT 0,
    completed_leads INTEGER DEFAULT 0,
    answered_leads INTEGER DEFAULT 0,
    missed_leads INTEGER DEFAULT 0,
    dtmf_leads INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Campaign Leads (Execution Queue for Outbound Calls)
CREATE TABLE IF NOT EXISTS campaign_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id VARCHAR(50) REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    duration INTEGER DEFAULT 0,
    dtmf VARCHAR(10),
    caller_did VARCHAR(50),
    call_time TIMESTAMPTZ,
    ref_id VARCHAR(100),
    call_id VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camp_leads_cid_status ON campaign_leads (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_camp_leads_contact ON campaign_leads (contact_id);
CREATE INDEX IF NOT EXISTS idx_camp_leads_phone ON campaign_leads (campaign_id, phone_number);

-- 5. Lifetime Call History Timeline
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    campaign_id VARCHAR(50) REFERENCES campaigns(id) ON DELETE SET NULL,
    campaign_name VARCHAR(255),
    phone_number VARCHAR(20) NOT NULL,
    caller_did VARCHAR(50),
    status VARCHAR(50) NOT NULL,
    duration INTEGER DEFAULT 0,
    dtmf VARCHAR(10),
    ivr_id VARCHAR(50),
    ivr_name VARCHAR(255),
    call_time TIMESTAMPTZ DEFAULT NOW(),
    recording_url TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_contact ON call_logs (contact_id, call_time DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_phone ON call_logs (phone_number, call_time DESC);

-- 6. Helper Function for Dynamic JSONB Audience Count and Extraction
CREATE OR REPLACE FUNCTION filter_contacts_count(filter_rules JSONB)
RETURNS INTEGER AS $$
DECLARE
    rule JSONB;
    where_sql TEXT := 'WHERE 1=1 ';
    key_name TEXT;
    op_name TEXT;
    val_text TEXT;
    res_count INTEGER;
BEGIN
    FOR rule IN SELECT * FROM jsonb_array_elements(filter_rules)
    LOOP
        key_name := quote_literal(rule->>'field');
        op_name := rule->>'operator';
        val_text := rule->>'value';

        IF op_name = 'equals' THEN
            where_sql := where_sql || ' AND (attributes->>' || key_name || ') = ' || quote_literal(val_text);
        ELSIF op_name = 'not_equals' THEN
            where_sql := where_sql || ' AND ((attributes->>' || key_name || ') IS NULL OR (attributes->>' || key_name || ') != ' || quote_literal(val_text) || ')';
        ELSIF op_name = 'contains' THEN
            where_sql := where_sql || ' AND (attributes->>' || key_name || ') ILIKE ' || quote_literal('%' || val_text || '%');
        ELSIF op_name = 'in' THEN
            -- value is array e.g. ["Science", "Commerce"]
            where_sql := where_sql || ' AND (attributes->' || key_name || ') ?| ARRAY(SELECT jsonb_array_elements_text(' || quote_literal(rule->'values'::text)::jsonb || '))';
        END IF;
    END LOOP;

    EXECUTE 'SELECT count(*) FROM contacts ' || where_sql INTO res_count;
    RETURN res_count;
END;
$$ LANGUAGE plpgsql;

-- 7. Grant Permissions & Enable Open Access for API Keys
ALTER TABLE contact_fields_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on contact_fields_meta" ON contact_fields_meta;
CREATE POLICY "Allow all on contact_fields_meta" ON contact_fields_meta FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on contacts" ON contacts;
CREATE POLICY "Allow all on contacts" ON contacts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on campaigns" ON campaigns;
CREATE POLICY "Allow all on campaigns" ON campaigns FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on campaign_leads" ON campaign_leads;
CREATE POLICY "Allow all on campaign_leads" ON campaign_leads FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on call_logs" ON call_logs;
CREATE POLICY "Allow all on call_logs" ON call_logs FOR ALL USING (true) WITH CHECK (true);
