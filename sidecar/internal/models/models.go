package models

type Config struct {
	Cookies            string   `json:"cookies"`
	Proxies            []string `json:"proxies"`
	ScanThreadCnt      int      `json:"scan_thread_cnt"`
	DownloadThreadCnt  int      `json:"download_thread_cnt"`
}

type LinkInfo struct {
	Title string `json:"title"`
	Link  string `json:"link"`
}

type GalleryMetadata struct {
	Title      string   `json:"title"`
	TitleJP    string   `json:"title_jp"`
	ImageLinks []string `json:"image_links"`
	Count      int      `json:"count"`
}
