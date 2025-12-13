package cctv

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "cctv_session"

type session struct {
	UserID    int64
	Username  string
	ExpiresAt time.Time
}

var (
	sessionsMu sync.Mutex
	sessions   = map[string]session{}
)

func createSession(userID int64, username string, ttl time.Duration) (token string, expiresAt time.Time, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", time.Time{}, err
	}

	token = hex.EncodeToString(b)
	expiresAt = time.Now().Add(ttl)

	sessionsMu.Lock()
	sessions[token] = session{
		UserID:    userID,
		Username:  username,
		ExpiresAt: expiresAt,
	}
	sessionsMu.Unlock()

	return token, expiresAt, nil
}

func deleteSession(token string) {
	sessionsMu.Lock()
	delete(sessions, token)
	sessionsMu.Unlock()
}

func getSession(r *http.Request) (session, bool) {
	c, err := r.Cookie(sessionCookieName)
	if err != nil || c.Value == "" {
		return session{}, false
	}

	sessionsMu.Lock()
	defer sessionsMu.Unlock()

	s, ok := sessions[c.Value]
	if !ok {
		return session{}, false
	}
	if time.Now().After(s.ExpiresAt) {
		delete(sessions, c.Value)
		return session{}, false
	}
	return s, true
}

func requireAdmin(w http.ResponseWriter, r *http.Request) (session, bool) {
	s, ok := getSession(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return session{}, false
	}
	return s, true
}

func ensureAdminUser(db *sql.DB, username, password string) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(1) FROM users`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	if username == "" {
		username = "admin"
	}
	if password == "" {
		password = "admin"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	now := time.Now().Unix()
	_, err = db.Exec(`
INSERT INTO users (username, password_hash, created_at, updated_at)
VALUES (?, ?, ?, ?)`,
		username,
		string(hash),
		now,
		now,
	)
	return err
}

func authenticate(db *sql.DB, username, password string) (userID int64, err error) {
	var hash string
	row := db.QueryRow(`SELECT id, password_hash FROM users WHERE username = ?`, username)
	if err = row.Scan(&userID, &hash); err != nil {
		return 0, err
	}

	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return 0, errors.New("invalid credentials")
	}
	return userID, nil
}

func updateUser(db *sql.DB, userID int64, username, password string) (newUsername string, err error) {
	if username == "" && password == "" {
		return "", errors.New("username or password required")
	}

	if username != "" {
		if _, err = db.Exec(`UPDATE users SET username = ?, updated_at = ? WHERE id = ?`, username, time.Now().Unix(), userID); err != nil {
			return "", err
		}
		newUsername = username
	} else {
		if err = db.QueryRow(`SELECT username FROM users WHERE id = ?`, userID).Scan(&newUsername); err != nil {
			return "", err
		}
	}

	if password != "" {
		hash, hashErr := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if hashErr != nil {
			return "", hashErr
		}
		if _, err = db.Exec(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, string(hash), time.Now().Unix(), userID); err != nil {
			return "", err
		}
	}

	return newUsername, nil
}
