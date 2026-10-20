CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash    text UNIQUE,
  display_name  text,
  is_guest      boolean NOT NULL DEFAULT false,
  trust_score   real NOT NULL DEFAULT 0.5 CHECK (trust_score BETWEEN 0 AND 1),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saved_places (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('home', 'work', 'fav')),
  name        text NOT NULL,
  address     text,
  geom        geography (Point, 4326) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saved_places_one_home_work ON saved_places (user_id, kind) WHERE kind IN ('home', 'work');
CREATE INDEX saved_places_user ON saved_places (user_id);

CREATE TABLE trips (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  route_id     text NOT NULL,
  origin       geography (Point, 4326) NOT NULL,
  destination  geography (Point, 4326) NOT NULL,
  distance_m   integer NOT NULL,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'cancelled')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz
);
CREATE INDEX trips_user_started ON trips (user_id, started_at DESC);

CREATE TABLE reports (
  id           uuid PRIMARY KEY,
  type         text NOT NULL CHECK (type IN ('traffic', 'police', 'crash', 'hazard', 'closure', 'camera')),
  geom         geography (Point, 4326) NOT NULL,
  heading      smallint CHECK (heading BETWEEN 0 AND 360),
  reporter_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  status       text NOT NULL CHECK (status IN ('active', 'expired')),
  confidence   real NOT NULL,
  created_at   timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_geom ON reports USING gist (geom);
CREATE INDEX reports_created ON reports (created_at DESC);

CREATE TABLE report_votes (
  report_id    uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  still_there  boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id)
);

-- Historic baseline speeds per OSM edge and hour of week (filled by the traffic pipeline, Phase 3).
CREATE TABLE edge_speeds_hourly (
  edge_id       bigint NOT NULL,
  hour_of_week  smallint NOT NULL CHECK (hour_of_week BETWEEN 0 AND 167),
  p50_kmh       real NOT NULL,
  samples       integer NOT NULL,
  PRIMARY KEY (edge_id, hour_of_week)
);
