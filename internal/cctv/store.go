package cctv

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

func initSchema(db *sql.DB) error {
	const schema = `
CREATE TABLE IF NOT EXISTS settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	center_lat REAL NOT NULL DEFAULT 0,
	center_lng REAL NOT NULL DEFAULT 0,
	zoom INTEGER NOT NULL DEFAULT 2,
	corporate_name TEXT NOT NULL DEFAULT '',
	corporate_logo TEXT NOT NULL DEFAULT '',
	tile_url TEXT NOT NULL DEFAULT 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
	tile_attribution TEXT NOT NULL DEFAULT '&copy; OpenStreetMap contributors'
);
INSERT OR IGNORE INTO settings (id) VALUES (1);
UPDATE settings SET tile_url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' WHERE id = 1 AND tile_url = '';
UPDATE settings SET tile_attribution = '&copy; OpenStreetMap contributors' WHERE id = 1 AND tile_attribution = '';

CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cameras (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	lat REAL NOT NULL,
	lng REAL NOT NULL,
	stream TEXT NOT NULL DEFAULT '',
	url TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cameras_name ON cameras(name);
`

	if _, err := db.Exec(schema); err != nil {
		return err
	}

	// migrations for older DBs
	if _, err := db.Exec(`ALTER TABLE cameras ADD COLUMN url TEXT NOT NULL DEFAULT ''`); err != nil {
		// SQLite returns "duplicate column name: url" when already applied.
		if !strings.Contains(err.Error(), "duplicate column name") {
			return err
		}
	}

	return nil
}

func getSettings(db *sql.DB) (Settings, error) {
	var s Settings
	row := db.QueryRow(`
SELECT center_lat, center_lng, zoom, corporate_name, corporate_logo, tile_url, tile_attribution
FROM settings WHERE id = 1`)
	err := row.Scan(
		&s.CenterLat,
		&s.CenterLng,
		&s.Zoom,
		&s.CorporateName,
		&s.CorporateLogo,
		&s.TileURL,
		&s.TileAttribution,
	)
	return s, err
}

func updateSettings(db *sql.DB, s Settings) error {
	_, err := db.Exec(`
UPDATE settings
SET center_lat = ?, center_lng = ?, zoom = ?, corporate_name = ?, corporate_logo = ?, tile_url = ?, tile_attribution = ?
WHERE id = 1`,
		s.CenterLat,
		s.CenterLng,
		s.Zoom,
		s.CorporateName,
		s.CorporateLogo,
		s.TileURL,
		s.TileAttribution,
	)
	return err
}

func listCameras(db *sql.DB) ([]Camera, error) {
	rows, err := db.Query(`
SELECT id, name, description, lat, lng, stream, url
FROM cameras
ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Camera, 0)
	for rows.Next() {
		var c Camera
		if err = rows.Scan(&c.ID, &c.Name, &c.Description, &c.Lat, &c.Lng, &c.Stream, &c.URL); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func getCamera(db *sql.DB, id string) (Camera, error) {
	var c Camera
	row := db.QueryRow(`
SELECT id, name, description, lat, lng, stream, url
FROM cameras
WHERE id = ?`, id)
	err := row.Scan(&c.ID, &c.Name, &c.Description, &c.Lat, &c.Lng, &c.Stream, &c.URL)
	return c, err
}

func createCamera(db *sql.DB, c Camera) (Camera, error) {
	now := time.Now().Unix()
	c.ID = uuid.NewString()
	if c.Stream == "" && c.URL != "" {
		c.Stream = generateStreamName(c.ID)
	}
	_, err := db.Exec(`
INSERT INTO cameras (id, name, description, lat, lng, stream, url, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID,
		c.Name,
		c.Description,
		c.Lat,
		c.Lng,
		c.Stream,
		c.URL,
		now,
		now,
	)
	return c, err
}

func updateCamera(db *sql.DB, id string, c Camera) error {
	now := time.Now().Unix()
	res, err := db.Exec(`
UPDATE cameras
SET name = ?, description = ?, lat = ?, lng = ?, stream = ?, url = ?, updated_at = ?
WHERE id = ?`,
		c.Name,
		c.Description,
		c.Lat,
		c.Lng,
		c.Stream,
		c.URL,
		now,
		id,
	)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func deleteCamera(db *sql.DB, id string) error {
	res, err := db.Exec(`DELETE FROM cameras WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func importData(db *sql.DB, data Export) error {
	if data.Version == 0 {
		data.Version = 1
	}
	if data.Version != 1 {
		return errors.New("unsupported import format version")
	}

	if data.Settings.Zoom < 0 || data.Settings.Zoom > 22 {
		return errors.New("zoom must be between 0 and 22")
	}
	if !isFiniteFloat(data.Settings.CenterLat) || !isFiniteFloat(data.Settings.CenterLng) {
		return errors.New("invalid map center")
	}
	data.Settings.CenterLng = wrapLng(data.Settings.CenterLng)
	if data.Settings.CenterLat < -90 || data.Settings.CenterLat > 90 {
		return errors.New("invalid map center")
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
UPDATE settings
SET center_lat = ?, center_lng = ?, zoom = ?, corporate_name = ?, corporate_logo = ?, tile_url = ?, tile_attribution = ?
WHERE id = 1`,
		data.Settings.CenterLat,
		data.Settings.CenterLng,
		data.Settings.Zoom,
		data.Settings.CorporateName,
		data.Settings.CorporateLogo,
		data.Settings.TileURL,
		data.Settings.TileAttribution,
	)
	if err != nil {
		return err
	}

	if _, err = tx.Exec(`DELETE FROM cameras`); err != nil {
		return err
	}

	now := time.Now().Unix()
	stmt, err := tx.Prepare(`
INSERT INTO cameras (id, name, description, lat, lng, stream, url, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, c := range data.Cameras {
		if c.ID == "" {
			c.ID = uuid.NewString()
		}
		c.Name = strings.TrimSpace(c.Name)
		if c.Name == "" {
			return errors.New("camera name required")
		}
		if !isFiniteFloat(c.Lat) || !isFiniteFloat(c.Lng) {
			return errors.New("invalid camera coordinates")
		}
		c.Lng = wrapLng(c.Lng)
		if c.Lat < -90 || c.Lat > 90 {
			return errors.New("invalid camera coordinates")
		}
		c.Stream = strings.TrimSpace(c.Stream)
		c.URL = strings.TrimSpace(c.URL)
		if c.Stream == "" && c.URL != "" {
			c.Stream = generateStreamName(c.ID)
		}
		if _, err = stmt.Exec(c.ID, c.Name, c.Description, c.Lat, c.Lng, c.Stream, c.URL, now, now); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func generateStreamName(id string) string {
	s := strings.ReplaceAll(id, "-", "")
	if len(s) > 8 {
		s = s[:8]
	}
	if s == "" {
		return "cam"
	}
	return "cam-" + s
}
