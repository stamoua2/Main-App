// Schéma PostgreSQL — idempotent (CREATE TABLE IF NOT EXISTS), exécuté au
// démarrage. Conçu pour être extensible : les tables des passes 2 et 3
// (Square, visites/routes, inventaire, finances, marketing) sont déjà
// présentes avec leurs colonnes de base.

export const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT NOT NULL DEFAULT 'St-Amour du Vert',
    company_address TEXT NOT NULL DEFAULT 'L''Ange-Gardien (Québec)',
    company_email TEXT NOT NULL DEFAULT 'info@stamourduvert.com',
    company_phone TEXT NOT NULL DEFAULT '819-598-7891',
    taxes_enabled BOOLEAN NOT NULL DEFAULT false,
    tps_rate NUMERIC(8,6) NOT NULL DEFAULT 0.05,
    tvq_rate NUMERIC(8,6) NOT NULL DEFAULT 0.09975,
    tps_number TEXT NOT NULL DEFAULT '',
    tvq_number TEXT NOT NULL DEFAULT '',
    estimate_validity_days INTEGER NOT NULL DEFAULT 30,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS packages (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    visits TEXT NOT NULL DEFAULT '',
    tagline TEXT NOT NULL DEFAULT '',
    popular BOOLEAN NOT NULL DEFAULT false,
    position INTEGER NOT NULL DEFAULT 0,
    price_cents INTEGER,
    active BOOLEAN NOT NULL DEFAULT true
  )`,

  `CREATE TABLE IF NOT EXISTS package_items (
    id SERIAL PRIMARY KEY,
    package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL
  )`,

  // Catalogue des services affichés sur stamourduvert.com (9 services).
  `CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true
  )`,

  `CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address_line TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    province TEXT NOT NULL DEFAULT 'QC',
    postal_code TEXT NOT NULL DEFAULT '',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    lot_area_m2 DOUBLE PRECISION,
    package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'actif',
    notes TEXT NOT NULL DEFAULT '',
    square_customer_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS client_followups (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // Estimations et factures (table unifiée; conversion estimation → facture).
  `CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('estimation', 'facture')),
    number TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'brouillon',
    issued_on DATE NOT NULL DEFAULT CURRENT_DATE,
    taxes_enabled BOOLEAN NOT NULL DEFAULT false,
    tps_rate NUMERIC(8,6) NOT NULL DEFAULT 0.05,
    tvq_rate NUMERIC(8,6) NOT NULL DEFAULT 0.09975,
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    tps_cents INTEGER NOT NULL DEFAULT 0,
    tvq_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    deposit_cents INTEGER NOT NULL DEFAULT 0,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    converted_from_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    square_invoice_id TEXT,
    square_payment_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS document_lines (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
    unit_price_cents INTEGER NOT NULL DEFAULT 0,
    amount_cents INTEGER NOT NULL DEFAULT 0
  )`,

  // ---- Passe 2 : soumissions web, visites planifiées, routes ----
  `CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    sector TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'nouveau',
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 45,
    services TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'planifiee',
    route_position INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '',
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // ---- Passe 3 : inventaire, commandes, finances, marketing ----
  `CREATE TABLE IF NOT EXISTS inventory_items (
    id SERIAL PRIMARY KEY,
    sku TEXT,
    name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manuel',
    unit TEXT NOT NULL DEFAULT 'unité',
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    cost_cents INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    delta NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS supplier_orders (
    id SERIAL PRIMARY KEY,
    supplier TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'brouillon',
    ordered_on DATE,
    received_on DATE,
    total_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'général',
    amount_cents INTEGER NOT NULL DEFAULT 0,
    spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    launch_on DATE,
    status TEXT NOT NULL DEFAULT 'planifiee',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // ---- Connexion par nom d'utilisateur ----
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT ''`,
  // Rattrapage des comptes créés avant l'ajout : partie locale du courriel.
  `UPDATE users SET username = lower(split_part(email, '@', 1)) WHERE username = ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(lower(username))`,

  // ---- Passe 2 : ajouts (idempotents) ----
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS square_location_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS base_address TEXT NOT NULL DEFAULT '33, chemin du Graphite, L''Ange-Gardien (Québec) J8L 3J6'`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS base_latitude DOUBLE PRECISION`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS base_longitude DOUBLE PRECISION`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS square_public_url TEXT`,

  // Journal des événements webhook Square (idempotence).
  `CREATE TABLE IF NOT EXISTS square_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '',
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // ---- Passe 3 : ajouts (idempotents) ----
  `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`,

  `CREATE TABLE IF NOT EXISTS supplier_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
    description TEXT NOT NULL DEFAULT '',
    quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
    unit_cost_cents INTEGER NOT NULL DEFAULT 0,
    amount_cents INTEGER NOT NULL DEFAULT 0
  )`,

  // Revenus saisis manuellement (les factures payées comptent aussi comme revenus).
  `CREATE TABLE IF NOT EXISTS revenues (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    received_on DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(spent_on)`,
  `CREATE INDEX IF NOT EXISTS idx_revenues_date ON revenues(received_on)`,

  // Site web de l'entreprise (affiché sur les PDF).
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_website TEXT NOT NULL DEFAULT 'www.stamourduvert.com'`,

  // ---- Calculateur de prix des forfaits ----
  // Nombre de visites (numérique), coût fixe par visite (déplacement,
  // main-d'œuvre) et marge de profit par défaut, ajustables par forfait.
  `ALTER TABLE packages ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE packages ADD COLUMN IF NOT EXISTS visit_cost_cents INTEGER NOT NULL DEFAULT 2500`,
  `ALTER TABLE packages ADD COLUMN IF NOT EXISTS margin_pct NUMERIC(6,2) NOT NULL DEFAULT 55`,

  // Produits appliqués par forfait : dose par 100 m², contenance du format
  // acheté et nombre d'applications par saison. Le coût vient du produit
  // d'inventaire lié (item_id) ou, à défaut, de unit_cost_cents.
  `CREATE TABLE IF NOT EXISTS package_products (
    id SERIAL PRIMARY KEY,
    package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
    label TEXT NOT NULL DEFAULT '',
    dose_per_100m2 NUMERIC(12,4) NOT NULL DEFAULT 0,
    dose_unit TEXT NOT NULL DEFAULT 'kg',
    format_quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
    applications INTEGER NOT NULL DEFAULT 1,
    unit_cost_cents INTEGER,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_package_products_pkg ON package_products(package_id)`,

  // ---- Contrats ----
  // Le cycle complet est estimation → contrat → facture(s). Le contrat est le
  // document central : envoyé au client via Square (facture avec acompte), il
  // porte les services de la saison et génère les visites du calendrier.
  `ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_kind_check`,
  `ALTER TABLE documents ADD CONSTRAINT documents_kind_check
     CHECK (kind IN ('estimation', 'contrat', 'facture'))`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL`,
  // Visites rattachées à un contrat (générées à sa création, ajustables).
  `ALTER TABLE visits ADD COLUMN IF NOT EXISTS document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_visits_document ON visits(document_id)`,

  // Acompte par défaut (% du total, ajustable document par document).
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS deposit_pct NUMERIC(6,2) NOT NULL DEFAULT 50`,

  // ---- Numérotation des documents : compteur persistant ----
  // Les numéros (EST-/CON-/FAC-) ne doivent JAMAIS être réémis, même après la
  // suppression d'un document — sinon un nouveau document reprend un numéro déjà
  // utilisé dans Square (facture annulée mais numéro conservé) → « invoice number
  // already used ». On tient donc un compteur par préfixe/année qui n'est jamais
  // décrémenté, plutôt que de calculer « max + 1 » sur les documents existants.
  `CREATE TABLE IF NOT EXISTS document_counters (
    prefix TEXT NOT NULL,
    year INTEGER NOT NULL,
    last_seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year)
  )`,
  // Amorçage à partir des documents déjà présents (une seule fois par clé).
  `INSERT INTO document_counters (prefix, year, last_seq)
     SELECT split_part(number, '-', 1), split_part(number, '-', 2)::int,
            max(split_part(number, '-', 3)::int)
     FROM documents WHERE number LIKE '___-____-%'
     GROUP BY 1, 2
     ON CONFLICT (prefix, year) DO NOTHING`,
  // Nombre d'envois Square effectués pour ce document : garantit un
  // invoice_number unique à chaque (ré)envoi vers Square.
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS square_send_count INTEGER NOT NULL DEFAULT 0`,

  // ---- Commandes fournisseurs : taxes et livraison ----
  `ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS shipping_cents INTEGER NOT NULL DEFAULT 4500`,
  `ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS taxes_enabled BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS tps_cents INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE supplier_orders ADD COLUMN IF NOT EXISTS tvq_cents INTEGER NOT NULL DEFAULT 0`,

  // ---- Catégories de produits (gérables dans l'app) ----
  `CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  // Alimente la liste avec les catégories déjà présentes dans l'inventaire.
  `INSERT INTO product_categories (name)
     SELECT DISTINCT category FROM inventory_items WHERE category <> ''
     ON CONFLICT (name) DO NOTHING`,

  // ---- Marketing IA ----
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS objective TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tone TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_prompt TEXT NOT NULL DEFAULT ''`,
  // Image générée, stockée en data URL (base64).
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS image_data TEXT NOT NULL DEFAULT ''`,

  // ---- Revenus : synchronisation des paiements Square ----
  `ALTER TABLE revenues ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manuel'`,
  `ALTER TABLE revenues ADD COLUMN IF NOT EXISTS square_payment_id TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_revenues_square_payment
     ON revenues(square_payment_id) WHERE square_payment_id IS NOT NULL`,

  `CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_document_lines_doc ON document_lines(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_package_items_pkg ON package_items(package_id)`,
  `CREATE INDEX IF NOT EXISTS idx_visits_client ON visits(client_id)`,

  // ---- Tâches & relances ----
  // Rappels de suivi (relancer une estimation, appeler un client, planifier un
  // service). Peut être rattachée à un client et/ou à un document. « due_on »
  // porte l'échéance; « done » marque l'achèvement.
  `CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    due_on DATE,
    done BOOLEAN NOT NULL DEFAULT false,
    priority TEXT NOT NULL DEFAULT 'normale',
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_on)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id)`,

  `INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
];
