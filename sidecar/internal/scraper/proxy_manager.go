package scraper

import (
	"sync"
)

type ProxyManager struct {
	proxies      []string
	currentIndex int
	mu           sync.RWMutex
}

func NewProxyManager(proxies []string) *ProxyManager {
	return &ProxyManager{
		proxies:      proxies,
		currentIndex: 0,
	}
}

func (pm *ProxyManager) GetProxy() string {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	if len(pm.proxies) == 0 {
		return ""
	}
	return pm.proxies[pm.currentIndex]
}

func (pm *ProxyManager) Rotate() {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if len(pm.proxies) == 0 {
		return
	}
	pm.currentIndex = (pm.currentIndex + 1) % len(pm.proxies)
}

func (pm *ProxyManager) SetProxies(proxies []string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.proxies = proxies
	pm.currentIndex = 0
}
