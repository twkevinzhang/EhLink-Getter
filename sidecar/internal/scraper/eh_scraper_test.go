package scraper

import (
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func TestParseListIncludesRealGalleryIdentity(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(`
		<table class="itg">
			<tr><td><a href="https://e-hentai.org/g/123456/a1b2c3d4e5/"><div class="glink">Example Gallery</div></a><div>42 pages</div></td></tr>
		</table>
	`))
	if err != nil {
		t.Fatal(err)
	}

	items := NewEhScraperService("", "").ParseList(doc)
	if len(items) != 1 {
		t.Fatalf("expected one item, got %d", len(items))
	}
	if items[0].Gid != 123456 || items[0].Token != "a1b2c3d4e5" {
		t.Fatalf("unexpected gallery identity: gid=%d token=%q", items[0].Gid, items[0].Token)
	}
}

func TestParseListDropsLinksWithoutGalleryIdentity(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(`
		<table class="itg">
			<tr><td><a href="https://e-hentai.org/tag/example"><div class="glink">Not a gallery</div></a></td></tr>
		</table>
	`))
	if err != nil {
		t.Fatal(err)
	}

	items := NewEhScraperService("", "").ParseList(doc)
	if len(items) != 0 {
		t.Fatalf("expected invalid gallery links to be omitted, got %d", len(items))
	}
}
