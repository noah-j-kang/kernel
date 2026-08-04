CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_keys (
    key_hash VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

CREATE TABLE wallets (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    usd_balance NUMERIC(15, 2) DEFAULT 100000.00,
    cookie_balance NUMERIC(15, 4) DEFAULT 0.0000,
    margin_usd NUMERIC(15, 2) DEFAULT 0.00,
    cookie_perp NUMERIC(15, 4) DEFAULT 0.0000,
    cookie_perp_entry NUMERIC(15, 4) DEFAULT 0.0000,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id UUID REFERENCES users(id),
    seller_id UUID REFERENCES users(id),
    instrument_id VARCHAR(50) DEFAULT 'COOKIE-USD-SPOT',
    price NUMERIC(10, 2) NOT NULL,
    quantity NUMERIC(15, 4) NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_executions_time ON executions(executed_at DESC);
CREATE INDEX idx_executions_buyer ON executions(buyer_id);
CREATE INDEX idx_executions_seller ON executions(seller_id);
