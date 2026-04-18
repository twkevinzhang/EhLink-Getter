package models

type Config struct {
	Cookies            string   `json:"cookies"`
	Proxies            []string `json:"proxies"`
}

type LinkInfo struct {
	Title string `json:"title"`
	Link  string `json:"link"`
}

type LibraryGallery struct {
	Gid        int      `json:"gid"`
	Token      string   `json:"token"`
	Title      string   `json:"title"`
	TitleJP    string   `json:"title_jpn"`
	Category   string   `json:"category"`
	Thumb      string   `json:"thumb"`
	Uploader   string   `json:"uploader"`
	Posted     string   `json:"posted"`
	Filecount  string   `json:"filecount"`
	Filesize   int      `json:"filesize"`
	Expunged   bool     `json:"expunged"`
	Rating     string   `json:"rating"`
	Torrentcount string   `json:"torrentcount"`
	Tags       []string `json:"tags"`
	ImageLinks []string `json:"image_links"`
	Count      int      `json:"count"`
}
