package cctv

import (
	"database/sql"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/rs/zerolog"

	_ "modernc.org/sqlite"
)

func Init() {
	var cfg struct {
		Mod struct {
			Enabled       bool   `yaml:"enabled"`
			DBPath        string `yaml:"db_path"`
			AdminUsername string `yaml:"admin_username"`
			AdminPassword string `yaml:"admin_password"`
		} `yaml:"cctv"`
	}

	cfg.Mod.Enabled = true
	cfg.Mod.DBPath = "cctv.sqlite"
	cfg.Mod.AdminUsername = "admin"
	cfg.Mod.AdminPassword = "admin"

	app.LoadConfig(&cfg)

	if !cfg.Mod.Enabled {
		return
	}

	log = app.GetLogger("cctv")
	log.Info().Str("db", cfg.Mod.DBPath).Msg("[cctv] init")

	var err error
	db, err = sql.Open("sqlite", cfg.Mod.DBPath)
	if err != nil {
		log.Error().Err(err).Msg("[cctv] open db")
		return
	}

	if err = initSchema(db); err != nil {
		log.Error().Err(err).Msg("[cctv] init schema")
		return
	}

	if err = ensureAdminUser(db, cfg.Mod.AdminUsername, cfg.Mod.AdminPassword); err != nil {
		log.Error().Err(err).Msg("[cctv] ensure admin user")
		return
	}

	srv := &apiServer{db: db}

	api.HandleFunc("api/cctv/public", srv.handlePublic)

	api.HandleFunc("api/cctv/admin/login", srv.handleLogin)
	api.HandleFunc("api/cctv/admin/logout", srv.handleLogout)
	api.HandleFunc("api/cctv/admin/me", srv.handleMe)

	api.HandleFunc("api/cctv/admin/settings", srv.handleSettings)
	api.HandleFunc("api/cctv/admin/cameras", srv.handleCameras)
	api.HandleFunc("api/cctv/admin/cameras/", srv.handleCamera)
	api.HandleFunc("api/cctv/admin/export", srv.handleExport)
	api.HandleFunc("api/cctv/admin/import", srv.handleImport)
	api.HandleFunc("api/cctv/admin/user", srv.handleUser)

	if err = syncAllStreams(db); err != nil {
		log.Warn().Err(err).Msg("[cctv] sync streams")
	}
}

var (
	log zerolog.Logger
	db  *sql.DB
)
