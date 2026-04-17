package scraper

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

func (s *EhScraperService) FetchImage(ctx context.Context, targetURL string) ([]byte, string, error) {
	url := targetURL

	// Smart Resolver: If it's an image page, parse the real image URL
	if strings.Contains(url, "/s/") {
		resp, err := s.client.R().
			SetContext(ctx).
			SetHeaders(s.buildHeaders()).
			Get(url)
		
		if err != nil {
			return nil, "", err
		}
		if resp.StatusCode() != http.StatusOK {
			return nil, "", fmt.Errorf("failed to fetch image page: %d", resp.StatusCode())
		}

		doc, err := goquery.NewDocumentFromReader(strings.NewReader(resp.String()))
		if err != nil {
			return nil, "", err
		}

		realImgURL, exists := doc.Find("img#img").Attr("src")
		if !exists {
			return nil, "", fmt.Errorf("could not find real image URL in page")
		}
		url = realImgURL
	}

	resp, err := s.client.R().
		SetContext(ctx).
		SetHeaders(s.buildHeaders()).
		Get(url)

	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode() != http.StatusOK {
		return nil, "", fmt.Errorf("failed to fetch image: %d", resp.StatusCode())
	}

	contentType := resp.Header().Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}

	return resp.Body(), contentType, nil
}
