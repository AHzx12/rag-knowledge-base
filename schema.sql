CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536),
    filename TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    source_filename TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(name, source_filename)
);

CREATE TABLE IF NOT EXISTS relationships (
    id SERIAL PRIMARY KEY,
    source_entity TEXT NOT NULL,
    relation TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    source_filename TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_entity);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_entity);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
