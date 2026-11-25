PRAGMA foreign_keys = ON;
PRAGMA user_version = 1;

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color_hex TEXT NOT NULL DEFAULT '#8EACD0',
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
);

CREATE TABLE condition_labels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color_hex TEXT NOT NULL DEFAULT '#8EACD0',
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
);

CREATE TABLE workflow_labels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color_hex TEXT NOT NULL DEFAULT '#8EACD0',
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color_hex TEXT NOT NULL DEFAULT '#8EACD0',
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
);

CREATE TABLE people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    provenance TEXT NOT NULL
);

CREATE TABLE collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id),
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE items (
    id TEXT PRIMARY KEY,
    inventory_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id),
    collection_id TEXT REFERENCES collections(id),
    storage_location TEXT NOT NULL DEFAULT '',
    brand_label TEXT NOT NULL DEFAULT '',
    model_label TEXT NOT NULL DEFAULT '',
    identification_status TEXT NOT NULL DEFAULT 'offen'
        CHECK (identification_status IN ('offen', 'vermutet', 'belegt')),
    condition_description TEXT NOT NULL DEFAULT '',
    condition_id TEXT REFERENCES condition_labels(id),
    test_status TEXT NOT NULL DEFAULT 'ungeprueft'
        CHECK (test_status IN ('ungeprueft', 'teilweise_geprueft', 'geprueft')),
    workflow_id TEXT REFERENCES workflow_labels(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    deleted_at TEXT
);

CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    relative_path TEXT NOT NULL UNIQUE,
    original_filename TEXT NOT NULL,
    media_type TEXT NOT NULL,
    byte_count INTEGER NOT NULL CHECK (byte_count >= 0),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    collection_id TEXT REFERENCES collections(id),
    role TEXT NOT NULL DEFAULT 'original'
        CHECK (role IN ('original', 'bearbeitung', 'datenblatt', 'beleg')),
    derived_from_id TEXT REFERENCES assets(id),
    description TEXT NOT NULL DEFAULT '',
    imported_at TEXT NOT NULL
);
CREATE INDEX assets_sha256 ON assets(sha256);

CREATE TABLE item_assets (
    item_id TEXT NOT NULL REFERENCES items(id),
    asset_id TEXT NOT NULL REFERENCES assets(id),
    caption TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (item_id, asset_id)
);

CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('handschrift', 'rechnung', 'beleg', 'biografie', 'arbeitsnotiz')),
    author_id TEXT REFERENCES people(id),
    attribution TEXT NOT NULL DEFAULT 'offen'
        CHECK (attribution IN ('offen', 'laut_nutzer', 'belegt')),
    date_text TEXT NOT NULL DEFAULT '',
    verbatim_text TEXT NOT NULL DEFAULT '',
    reading_status TEXT NOT NULL DEFAULT 'offen'
        CHECK (reading_status IN ('offen', 'teilweise', 'geprueft')),
    interpretation TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    collection_id TEXT REFERENCES collections(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    deleted_at TEXT
);

CREATE TABLE item_tags (
    item_id TEXT NOT NULL REFERENCES items(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE note_assets (
    note_id TEXT NOT NULL REFERENCES notes(id),
    asset_id TEXT NOT NULL REFERENCES assets(id),
    region_description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (note_id, asset_id)
);

CREATE TABLE note_items (
    note_id TEXT NOT NULL REFERENCES notes(id),
    item_id TEXT NOT NULL REFERENCES items(id),
    relationship TEXT NOT NULL DEFAULT 'betrifft',
    PRIMARY KEY (note_id, item_id)
);

CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('datenblatt', 'hersteller', 'verkauf', 'angebot', 'archiv', 'nutzer', 'sonstiges')),
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    accessed_at TEXT,
    asset_id TEXT REFERENCES assets(id),
    citation_locator TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE findings (
    id TEXT PRIMARY KEY,
    item_id TEXT REFERENCES items(id),
    note_id TEXT REFERENCES notes(id),
    subject TEXT NOT NULL,
    claim TEXT NOT NULL,
    assessment TEXT NOT NULL CHECK (assessment IN ('beobachtung', 'vermutung', 'belegt', 'widerspruechlich')),
    reasoning TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE finding_sources (
    finding_id TEXT NOT NULL REFERENCES findings(id),
    source_id TEXT NOT NULL REFERENCES sources(id),
    relevance TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (finding_id, source_id)
);

CREATE TABLE valuations (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id),
    evaluated_at TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    low_minor INTEGER NOT NULL CHECK (low_minor >= 0),
    high_minor INTEGER NOT NULL CHECK (high_minor >= low_minor),
    assumed_condition TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    buyer_groups TEXT NOT NULL DEFAULT '',
    buyer_motivation TEXT NOT NULL DEFAULT '',
    advantages TEXT NOT NULL DEFAULT '',
    disadvantages TEXT NOT NULL DEFAULT '',
    CHECK (length(currency) = 3)
);

CREATE TABLE valuation_sources (
    valuation_id TEXT NOT NULL REFERENCES valuations(id),
    source_id TEXT NOT NULL REFERENCES sources(id),
    comparison_notes TEXT NOT NULL,
    PRIMARY KEY (valuation_id, source_id)
);

CREATE TABLE sale_events (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id),
    occurred_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('entscheidung', 'angebot', 'reservierung', 'verkauf', 'zahlung', 'versand', 'rueckgabe')),
    platform TEXT NOT NULL DEFAULT '',
    amount_minor INTEGER CHECK (amount_minor >= 0),
    fees_minor INTEGER CHECK (fees_minor >= 0),
    shipping_minor INTEGER CHECK (shipping_minor >= 0),
    currency TEXT NOT NULL DEFAULT 'EUR' CHECK (length(currency) = 3),
    external_reference TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT ''
);

CREATE INDEX items_collection ON items(collection_id);
CREATE INDEX items_status ON items(workflow_id);
CREATE INDEX findings_item ON findings(item_id);
CREATE INDEX sale_events_item ON sale_events(item_id, occurred_at);
