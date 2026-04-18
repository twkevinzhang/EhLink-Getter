package scraper

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"sidecar/internal/models"
	"strconv"

	"github.com/PuerkitoBio/goquery"
	"github.com/go-resty/resty/v2"
)

type EhScraperService struct {
	client *resty.Client
	cookies string
}

func NewEhScraperService(cookies string, proxy string) *EhScraperService {
	client := resty.New()
	client.SetTimeout(30 * time.Second)
	client.SetHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	
	if proxy != "" {
		client.SetProxy(proxy)
	}

	return &EhScraperService{
		client: client,
		cookies: cookies,
	}
}

func (s *EhScraperService) buildHeaders() map[string]string {
	headers := make(map[string]string)
	if s.cookies != "" {
		headers["Cookie"] = s.cookies
	}
	return headers
}

func (s *EhScraperService) ParseList(doc *goquery.Document) []models.LinkInfo {
	var results []models.LinkInfo

	// 1. Standard (Minimal+, Compact, Extended) - Usually has div.glink
	doc.Find("div.glink").Each(func(i int, sel *goquery.Selection) {
		aTag := sel.ParentFiltered("a")
		if aTag.Length() == 0 {
			aTag = sel.Closest("a")
		}
		
		href, exists := aTag.Attr("href")
		if exists {
			results = append(results, models.LinkInfo{
				Title: strings.TrimSpace(sel.Text()),
				Link:  href,
			})
		}
	})

	// 2. Minimal view (table rows)
	if len(results) == 0 {
		doc.Find("td.gl3c.glname").Each(func(i int, sel *goquery.Selection) {
			aTag := sel.Find("a")
			divGlink := sel.Find("div.glink")
			href, exists := aTag.Attr("href")
			if exists && divGlink.Length() > 0 {
				results = append(results, models.LinkInfo{
					Title: strings.TrimSpace(divGlink.Text()),
					Link:  href,
				})
			}
		})
	}

	// 3. Thumbnail view
	if len(results) == 0 {
		doc.Find("div.gl1t").Each(func(i int, sel *goquery.Selection) {
			aTag := sel.Find("div.gl2t a")
			if aTag.Length() == 0 {
				aTag = sel.Find("a")
			}
			
			href, exists := aTag.Attr("href")
			if exists {
				title, _ := aTag.Attr("title")
				if title == "" {
					title = strings.TrimSpace(aTag.Text())
				}
				results = append(results, models.LinkInfo{
					Title: title,
					Link:  href,
				})
			}
		})
	}

	return results
}

func (s *EhScraperService) FetchPageWithToken(ctx context.Context, targetURL string, nextToken string) (map[string]interface{}, error) {
	reqURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}

	// Apply the token to the URL correctly
	if nextToken != "" {
		query := reqURL.Query()
		// Token is now formatted as "key=value" from our helper
		if strings.Contains(nextToken, "=") {
			parts := strings.SplitN(nextToken, "=", 2)
			if len(parts) == 2 {
				query.Set(parts[0], parts[1])
			}
		} else {
			// Backward compatibility: try to guess
			_, err := strconv.Atoi(nextToken)
			if err == nil {
				query.Set("page", nextToken)
			} else {
				query.Set("next", nextToken)
			}
		}
		reqURL.RawQuery = query.Encode()
	}

	resp, err := s.client.R().
		SetContext(ctx).
		SetHeaders(s.buildHeaders()).
		Get(reqURL.String())

	if err != nil {
		return nil, err
	}
	if resp.StatusCode() != http.StatusOK {
		return nil, fmt.Errorf("EH Fetch Error: status %d", resp.StatusCode())
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(resp.String()))
	if err != nil {
		return nil, err
	}

	items := s.ParseList(doc)

	// Find next page/token
	var nextVal string

	// DEBUG: Trace all navigation-like links
	doc.Find("a").Each(func(i int, sel *goquery.Selection) {
		href, exists := sel.Attr("href")
		if !exists {
			return
		}

		text := strings.ToLower(strings.TrimSpace(sel.Text()))
		id, _ := sel.Attr("id")

		// Broad match for any "Next" or ">" related links
		isNextMatch := id == "dnext" || 
			text == ">" || 
			text == "»" || 
			strings.Contains(text, "next") ||
			(sel.HasClass("ptp") && text == ">")

		if isNextMatch {
			token := extractToken(href)
			if token != "" {
				nextVal = token
				fmt.Printf("DEBUG: Found next token '%s' (text='%s')\n", nextVal, text)
			}
		}
	})

	// Fallback to ptt specific logic (older/gallery view)
	if nextVal == "" {
		doc.Find("table.ptt td.ptds").Next().Find("a").First().Each(func(i int, sel *goquery.Selection) {
			href, exists := sel.Attr("href")
			if exists {
				nextVal = extractToken(href)
				if nextVal != "" {
					fmt.Printf("DEBUG: Found next token '%s' via ptds-next fallback\n", nextVal)
				}
			}
		})
	}

	if nextVal == "" {
		fmt.Println("DEBUG: No next token found on this page")
	}

	return map[string]interface{}{
		"items": items,
		"next":  nextVal,
	}, nil
}

// Helper to extract next/page/from/prev token from URL AND its parameter name
func extractToken(href string) string {
	parseURL := href
	if strings.HasPrefix(href, "?") {
		parseURL = "https://e-hentai.org/" + href
	}
	
	u, err := url.Parse(parseURL)
	if err != nil {
		return ""
	}
	
	qs := u.Query()
	// Priority: next > jump > page > from > prev
	keys := []string{"next", "jump", "page", "from", "prev"}
	for _, key := range keys {
		if val := qs.Get(key); val != "" {
			// Return formatted as "key=value" so FetchPageWithToken knows what to do
			return key + "=" + val
		}
	}
	return ""
}

func (s *EhScraperService) FetchGalleryMetadata(ctx context.Context, targetURL string) (*models.GalleryMetadata, error) {
	var allImageLinks []string
	currentURL := targetURL
	title := "Unknown"
	titleJP := ""

	for p := 0; p < 200; p++ {
		resp, err := s.client.R().
			SetContext(ctx).
			SetHeaders(s.buildHeaders()).
			Get(currentURL)

		if err != nil || resp.StatusCode() != http.StatusOK {
			break
		}

		doc, err := goquery.NewDocumentFromReader(strings.NewReader(resp.String()))
		if err != nil {
			break
		}

		// Extract metadata from first page
		if p == 0 {
			if gn := doc.Find("#gn"); gn.Length() > 0 {
				title = strings.TrimSpace(gn.Text())
			}
			if gj := doc.Find("#gj"); gj.Length() > 0 {
				titleJP = strings.TrimSpace(gj.Text())
			}
		}

		// Find image page links
		doc.Find("div#gdt a").Each(func(i int, sel *goquery.Selection) {
			link, exists := sel.Attr("href")
			if exists && strings.Contains(link, "/s/") {
				allImageLinks = append(allImageLinks, link)
			}
		})

		// Find next page link
		var nextPage string
		doc.Find("table.ptt td.ptds").Next().Find("a").Each(func(i int, sel *goquery.Selection) {
			nextPage, _ = sel.Attr("href")
		})

		if nextPage == "" {
			break
		}
		currentURL = nextPage
	}

	return &models.GalleryMetadata{
		Title:      title,
		TitleJP:    titleJP,
		ImageLinks: allImageLinks,
		Count:      len(allImageLinks),
	}, nil
}
