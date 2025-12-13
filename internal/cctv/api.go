package cctv

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/internal/streams"
)

type apiServer struct {
	db *sql.DB
}

func (s *apiServer) handlePublic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	settings, err := getSettings(s.db)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	cameras, err := listCameras(s.db)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	publicCameras := make([]PublicCamera, 0, len(cameras))
	for _, c := range cameras {
		publicCameras = append(publicCameras, PublicCamera{
			ID:          c.ID,
			Name:        c.Name,
			Description: c.Description,
			Lat:         c.Lat,
			Lng:         c.Lng,
			Stream:      c.Stream,
		})
	}

	api.ResponseJSON(w, PublicExport{
		Version:  1,
		Settings: settings,
		Cameras:  publicCameras,
	})
}

func (s *apiServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	if body.Username == "" || body.Password == "" {
		http.Error(w, "Username and password required", http.StatusBadRequest)
		return
	}

	userID, err := authenticate(s.db, body.Username, body.Password)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	token, expiresAt, err := createSession(userID, body.Username, 24*time.Hour)
	if err != nil {
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		Expires:  expiresAt,
	})

	api.ResponseJSON(w, map[string]any{"ok": true})
}

func (s *apiServer) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	c, err := r.Cookie(sessionCookieName)
	if err == nil && c.Value != "" {
		deleteSession(c.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		MaxAge:   -1,
	})

	api.ResponseJSON(w, map[string]any{"ok": true})
}

func (s *apiServer) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	sess, ok := requireAdmin(w, r)
	if !ok {
		return
	}

	api.ResponseJSON(w, map[string]any{
		"username": sess.Username,
	})
}

func (s *apiServer) handleSettings(w http.ResponseWriter, r *http.Request) {
	sess, ok := requireAdmin(w, r)
	if !ok {
		return
	}
	_ = sess

	switch r.Method {
	case http.MethodGet:
		settings, err := getSettings(s.db)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, settings)
	case http.MethodPut:
		var body Settings
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if body.Zoom < 0 || body.Zoom > 22 {
			http.Error(w, "Zoom must be between 0 and 22", http.StatusBadRequest)
			return
		}
		if !isFiniteFloat(body.CenterLat) || !isFiniteFloat(body.CenterLng) {
			http.Error(w, "Invalid map center", http.StatusBadRequest)
			return
		}

		body.CenterLng = wrapLng(body.CenterLng)
		if body.CenterLat < -90 || body.CenterLat > 90 {
			http.Error(w, "Invalid map center", http.StatusBadRequest)
			return
		}

		if err := updateSettings(s.db, body); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, map[string]any{"ok": true})
	default:
		http.Error(w, "", http.StatusMethodNotAllowed)
	}
}

func (s *apiServer) handleCameras(w http.ResponseWriter, r *http.Request) {
	_, ok := requireAdmin(w, r)
	if !ok {
		return
	}

	switch r.Method {
	case http.MethodGet:
		cameras, err := listCameras(s.db)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, cameras)
	case http.MethodPost:
		var body Camera
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		body.Stream = strings.TrimSpace(body.Stream)
		body.URL = strings.TrimSpace(body.URL)
		if body.Name == "" {
			http.Error(w, "Name required", http.StatusBadRequest)
			return
		}
		if !isFiniteFloat(body.Lat) || !isFiniteFloat(body.Lng) {
			http.Error(w, "Invalid coordinates", http.StatusBadRequest)
			return
		}

		body.Lng = wrapLng(body.Lng)
		if body.Lat < -90 || body.Lat > 90 {
			http.Error(w, "Invalid coordinates", http.StatusBadRequest)
			return
		}

		created, err := createCamera(s.db, body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err = syncStream(created); err != nil {
			_ = deleteCamera(s.db, created.ID)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		api.ResponseJSON(w, created)
	default:
		http.Error(w, "", http.StatusMethodNotAllowed)
	}
}

func (s *apiServer) handleCamera(w http.ResponseWriter, r *http.Request) {
	_, ok := requireAdmin(w, r)
	if !ok {
		return
	}

	// expects /api/cctv/admin/cameras/<id> (base_path may be prefixed)
	path := strings.TrimSuffix(r.URL.Path, "/")
	i := strings.LastIndex(path, "/")
	if i < 0 {
		http.Error(w, "Missing camera id", http.StatusBadRequest)
		return
	}
	id := strings.TrimSpace(path[i+1:])
	if id == "" || id == "cameras" {
		http.Error(w, "Missing camera id", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		c, err := getCamera(s.db, id)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, c)
	case http.MethodPut:
		existing, err := getCamera(s.db, id)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var body Camera
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		body.Stream = strings.TrimSpace(body.Stream)
		body.URL = strings.TrimSpace(body.URL)
		if body.Stream == "" && body.URL != "" {
			if existing.Stream != "" {
				body.Stream = existing.Stream
			} else {
				body.Stream = generateStreamName(id)
			}
		}
		if body.Name == "" {
			http.Error(w, "Name required", http.StatusBadRequest)
			return
		}
		if !isFiniteFloat(body.Lat) || !isFiniteFloat(body.Lng) {
			http.Error(w, "Invalid coordinates", http.StatusBadRequest)
			return
		}

		body.Lng = wrapLng(body.Lng)
		if body.Lat < -90 || body.Lat > 90 {
			http.Error(w, "Invalid coordinates", http.StatusBadRequest)
			return
		}
		if err = syncStream(Camera{ID: id, Stream: body.Stream, URL: body.URL}); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := updateCamera(s.db, id, body); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, map[string]any{"ok": true})
	case http.MethodDelete:
		if err := deleteCamera(s.db, id); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "Not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, map[string]any{"ok": true})
	default:
		http.Error(w, "", http.StatusMethodNotAllowed)
	}
}

func (s *apiServer) handleExport(w http.ResponseWriter, r *http.Request) {
	_, ok := requireAdmin(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	settings, err := getSettings(s.db)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	cameras, err := listCameras(s.db)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Disposition", "attachment; filename=cctv-backup.json")
	api.ResponsePrettyJSON(w, Export{
		Version:  1,
		Settings: settings,
		Cameras:  cameras,
	})
}

func (s *apiServer) handleImport(w http.ResponseWriter, r *http.Request) {
	_, ok := requireAdmin(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	var body Export
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if err := importData(s.db, body); err != nil {
		http.Error(w, fmt.Sprintf("Invalid backup: %s", err.Error()), http.StatusBadRequest)
		return
	}

	if err := syncAllStreams(s.db); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	api.ResponseJSON(w, map[string]any{"ok": true})
}

func (s *apiServer) handleUser(w http.ResponseWriter, r *http.Request) {
	sess, ok := requireAdmin(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPut {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	newUsername, err := updateUser(s.db, sess.UserID, body.Username, body.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// update current session username
	c, err := r.Cookie(sessionCookieName)
	if err == nil && c.Value != "" {
		sessionsMu.Lock()
		if s2, ok := sessions[c.Value]; ok {
			s2.Username = newUsername
			sessions[c.Value] = s2
		}
		sessionsMu.Unlock()
	}

	api.ResponseJSON(w, map[string]any{"ok": true, "username": newUsername})
}

func syncStream(c Camera) error {
	if c.URL == "" || c.Stream == "" {
		return nil
	}
	_, err := streams.Patch(c.Stream, c.URL)
	if err != nil {
		return fmt.Errorf("invalid camera url: %w", err)
	}
	return nil
}

func syncAllStreams(db *sql.DB) error {
	cameras, err := listCameras(db)
	if err != nil {
		return err
	}
	var firstErr error
	for _, c := range cameras {
		if err = syncStream(c); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
