package main

import (
	"fmt"
	"os"

	"sidecar/internal/api"
	"sidecar/internal/pkg/logger"

	"github.com/gin-gonic/gin"
)

func main() {
	// Transition to Release mode for Gin in production
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	
	// Add Logger and Recovery middleware
	r.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		// Custom format to match the Electron expected log structure if needed
		// For now just standard Gin logger
		return fmt.Sprintf("[GIN] %s | %d | %s | %s | %s %s\n",
			param.TimeStamp.Format("2006/01/02 - 15:04:05"),
			param.StatusCode,
			param.Latency,
			param.ClientIP,
			param.Method,
			param.Path,
		)
	}))
	r.Use(gin.Recovery())

	handler := api.NewAPIHandler()

	r.GET("/health", handler.HealthCheck)
	r.POST("/config", handler.UpdateConfig)
	r.GET("/image/fetch", handler.FetchImage)
	r.GET("/gallery/metadata", handler.GetGalleryMetadata)
	r.GET("/tasks/fetch", handler.FetchTasks)

	port := os.Getenv("SIDECAR_PORT")
	if port == "" {
		port = "8000"
	}

	logger.Info("Starting Go Sidecar", map[string]interface{}{"port": port})
	
	err := r.Run("127.0.0.1:" + port)
	if err != nil {
		logger.Fatal("Failed to start sidecar", map[string]interface{}{"error": err.Error()})
	}
}
