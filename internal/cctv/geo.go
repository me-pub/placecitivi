package cctv

import "math"

func isFiniteFloat(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

// wrapLng normalizes longitude to [-180, 180).
func wrapLng(lng float64) float64 {
	lng = math.Mod(lng+180, 360)
	if lng < 0 {
		lng += 360
	}
	return lng - 180
}
