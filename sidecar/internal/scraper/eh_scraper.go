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
	"regexp"
	"encoding/json"

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

func (s *EhScraperService) ExtractGidToken(targetURL string) (int, string, error) {
	// Pattern: /g/(\d+)/([a-z0-9]+)/
	re := regexp.MustCompile(`/g/(\d+)/([a-z0-9]+)`)
	matches := re.FindStringSubmatch(targetURL)
	if len(matches) < 3 {
		return 0, "", fmt.Errorf("invalid gallery URL")
	}

	gid, _ := strconv.Atoi(matches[1])
	token := matches[2]
	return gid, token, nil
}

func (s *EhScraperService) FetchLibraryGallery(ctx context.Context, targetURL string) (*models.LibraryGallery, error) {
	gid, token, err := s.ExtractGidToken(targetURL)
	if err == nil {
		// Attempting via EH API
		metadata, err := s.fetchMetadataViaAPI(ctx, gid, token)
		if err == nil {
			return metadata, nil
		}
		fmt.Printf("API fetch failed: %v, falling back to HTML scraping\n", err)
	}

	// Fallback to HTML scraping
	return s.fetchMetadataViaScraping(ctx, targetURL)
}

func (s *EhScraperService) fetchMetadataViaAPI(ctx context.Context, gid int, token string) (*models.LibraryGallery, error) {
	type ApiRequest struct {
		Method    string      `json:"method"`
		Gidlist   [][]interface{} `json:"gidlist"`
		Namespace int         `json:"namespace"`
	}

	reqBody := ApiRequest{
		Method: "gdata",
		Gidlist: [][]interface{}{
			{gid, token},
		},
		Namespace: 1,
	}

	var result struct {
		Gmetadata []models.LibraryGallery `json:"gmetadata"`
	}

	resp, err := s.client.R().
		SetContext(ctx).
		SetBody(reqBody).
		Post("https://e-hentai.org/api.php")

	if err != nil {
		return nil, err
	}
	if resp.StatusCode() != http.StatusOK {
		return nil, fmt.Errorf("API Error: status %d", resp.StatusCode())
	}

	if err := json.Unmarshal(resp.Body(), &result); err != nil {
		return nil, err
	}

	return &result.Gmetadata[0], nil
}

func (s *EhScraperService) fetchMetadataViaScraping(ctx context.Context, targetURL string) (*models.LibraryGallery, error) {
	metadata := &models.LibraryGallery{}
	gid, token, _ := s.ExtractGidToken(targetURL)
	metadata.Gid = gid
	metadata.Token = token

	currentURL := targetURL
	var allImageLinks []string

	for p := 0; p < 1000; p++ { // Support up to 1000 pages (~40k images)
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

		// Extract basic metadata only from the first page
		if p == 0 {
			if gn := doc.Find("#gn"); gn.Length() > 0 {
				metadata.Title = strings.TrimSpace(gn.Text())
			}
			if gj := doc.Find("#gj"); gj.Length() > 0 {
				metadata.TitleJP = strings.TrimSpace(gj.Text())
			}
			if cat := doc.Find("div#gdc div").First(); cat.Length() > 0 {
				metadata.Category = strings.TrimSpace(cat.Text())
			}
			if up := doc.Find("div#gdn a"); up.Length() > 0 {
				metadata.Uploader = strings.TrimSpace(up.Text())
			}
			// Extract tags
			doc.Find("div#taglist tr").Each(func(i int, sel *goquery.Selection) {
				namespace := strings.TrimSuffix(strings.TrimSpace(sel.Find("td.tc").Text()), ":")
				sel.Find("div.gt, div.gtl").Each(func(j int, tagSel *goquery.Selection) {
					tagName := strings.TrimSpace(tagSel.Text())
					if namespace != "" {
						metadata.Tags = append(metadata.Tags, fmt.Sprintf("%s:%s", namespace, tagName))
					} else {
						metadata.Tags = append(metadata.Tags, tagName)
					}
				})
			})
		}

		// Extract image links from the current page
		doc.Find("div#gdt a").Each(func(i int, sel *goquery.Selection) {
			link, exists := sel.Attr("href")
			if exists && strings.Contains(link, "/s/") {
				allImageLinks = append(allImageLinks, link)
			}
		})

		// Find next page link in the pagination table (ptt)
		var nextPage string
		doc.Find("table.ptt td.ptds").Next().Find("a").Each(func(i int, sel *goquery.Selection) {
			nextPage, _ = sel.Attr("href")
		})

		if nextPage == "" {
			break
		}
		currentURL = nextPage
	}

	metadata.ImageLinks = allImageLinks
	metadata.Count = len(allImageLinks)

	return metadata, nil
}
