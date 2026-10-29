CREATE TABLE records (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('profile','meal','water','activity','measurement','checkin','food')),
  date TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  version INTEGER NOT NULL CHECK(version > 0),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
  updated_at TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  operation_hash TEXT NOT NULL,
  PRIMARY KEY(user_id, id)
);
CREATE INDEX records_by_user_date ON records(user_id,date);
CREATE TABLE operations (
  user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation_hash TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY(user_id,operation_id)
);
CREATE TRIGGER receipt_insert AFTER INSERT ON records BEGIN
  INSERT INTO operations VALUES (NEW.user_id,NEW.operation_id,NEW.id,NEW.operation_hash,NEW.version);
END;
CREATE TRIGGER receipt_update AFTER UPDATE ON records BEGIN
  INSERT INTO operations VALUES (NEW.user_id,NEW.operation_id,NEW.id,NEW.operation_hash,NEW.version);
END;
