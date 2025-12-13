package api

import (
	"net/http"
	"net/http/httptest"
)

// IsAdminAuthenticated returns true if the request is authenticated either by:
// - API basic auth (api.username / api.password), or
// - CCTV admin session (cctv_session cookie).
func IsAdminAuthenticated(r *http.Request) bool {
	if hasValidBasicAuth(r) {
		return true
	}
	return hasValidCCTVSession(r)
}

func hasValidBasicAuth(r *http.Request) bool {
	if authUser == "" {
		return false
	}
	u, p, ok := r.BasicAuth()
	if !ok {
		return false
	}
	return u == authUser && p == authPass
}

func hasValidCCTVSession(r *http.Request) bool {
	// Validate session by calling existing handler without importing the CCTV package
	// (avoids an internal import cycle).
	path := basePath + "/api/cctv/admin/me"

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, path, nil)
	if err != nil {
		return false
	}

	// Forward cookies from the original request.
	if cookie := r.Header.Get("Cookie"); cookie != "" {
		req.Header.Set("Cookie", cookie)
	} else {
		for _, c := range r.Cookies() {
			req.AddCookie(c)
		}
	}

	rr := httptest.NewRecorder()
	http.DefaultServeMux.ServeHTTP(rr, req)
	return rr.Code == http.StatusOK
}

