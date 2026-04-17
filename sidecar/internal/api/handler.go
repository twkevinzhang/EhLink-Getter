package api

import (
	"context"
	"net/http"
	"sync"
	"time"

	"sidecar/internal/models"
	"sidecar/internal/scraper"
	"sidecar/internal/pkg/logger"

	"github.com/gin-gonic/gin"
)

type APIHandler struct {
	config       models.Config
	proxyManager *scraper.ProxyManager
	mu           sync.RWMutex
}

func NewAPIHandler() *APIHandler {
	return &APIHandler{
		config:       models.Config{},
		proxyManager: scraper.NewProxyManager([]string{}),
	}
}

func (h *APIHandler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *APIHandler) UpdateConfig(c *gin.Context) {
	var newConfig models.Config
	if err := c.ShouldBindJSON(&newConfig); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.mu.Lock()
	h.config = newConfig
	h.proxyManager.SetProxies(newConfig.Proxies)
	h.mu.Unlock()

	c.JSON(http.StatusOK, gin.H{"status": "updated", "config": newConfig})
}

func (h *APIHandler) getScraper() *scraper.EhScraperService {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return scraper.NewEhScraperService(h.config.Cookies, h.proxyManager.GetProxy())
}

func (h *APIHandler) FetchImage(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url parameter is required"})
		return
	}

	scraperService := h.getScraper()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	imgBytes, contentType, err := scraperService.FetchImage(ctx, targetURL)
	if err != nil {
		logger.Error("Fetch Image Error", map[string]interface{}{"url": targetURL, "error": err.Error()})
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Data(http.StatusOK, contentType, imgBytes)
}

func (h *APIHandler) GetGalleryMetadata(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url parameter is required"})
		return
	}

	scraperService := h.getScraper()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	metadata, err := scraperService.FetchGalleryMetadata(ctx, targetURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, metadata)
}

func (h *APIHandler) FetchTasks(c *gin.Context) {
	targetURL := c.Query("url")
	next := c.Query("next")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url parameter is required"})
		return
	}

	scraperService := h.getScraper()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	result, err := scraperService.FetchPageWithToken(ctx, targetURL, next)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}
