package api

import (
	"net/http"

	"github.com/AlexxIT/go2rtc/www"
)

func initStatic(staticDir string) {
	var root http.FileSystem
	if staticDir != "" {
		log.Info().Str("dir", staticDir).Msg("[api] serve static")
		root = http.Dir(staticDir)
	} else {
		root = http.FS(www.Static)
	}

	base := len(basePath)
	fileServer := http.FileServer(root)

	HandleFunc("", func(w http.ResponseWriter, r *http.Request) {
		// Remove base path before checking requested static file.
		staticPath := r.URL.Path
		if base > 0 && len(staticPath) >= base {
			staticPath = staticPath[base:]
		}

		// Protect stream management UI from public access (not required for playback).
		if staticPath == "/streams.html" && !IsAdminAuthenticated(r) {
			http.Redirect(w, r, basePath+"/admin.html", http.StatusFound)
			return
		}

		if base > 0 {
			r.URL.Path = r.URL.Path[base:]
		}
		fileServer.ServeHTTP(w, r)
	})
}
