package cctv

type Settings struct {
	CenterLat       float64 `json:"center_lat"`
	CenterLng       float64 `json:"center_lng"`
	Zoom            int     `json:"zoom"`
	CorporateName   string  `json:"corporate_name"`
	CorporateLogo   string  `json:"corporate_logo"`
	TileURL         string  `json:"tile_url"`
	TileAttribution string  `json:"tile_attribution"`
}

type Camera struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	Stream      string  `json:"stream"`
	URL         string  `json:"url"`
}

type Export struct {
	Version  int      `json:"version"`
	Settings Settings `json:"settings"`
	Cameras  []Camera `json:"cameras"`
}

type PublicCamera struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	Stream      string  `json:"stream"`
}

type PublicExport struct {
	Version  int            `json:"version"`
	Settings Settings       `json:"settings"`
	Cameras  []PublicCamera `json:"cameras"`
}
