.PHONY: help build clean install

help:
	@echo "可用指令:"
	@echo "  make build   - 編譯 Go sidecar 二進位檔案"
	@echo "  make clean   - 清除編譯產物"
	@echo "  make install - 下載並整理 Go 依賴"

build:
	@echo "正在編譯 sidecar..."
	go build -o sidecar ./cmd/sidecar/main.go
	mkdir -p ../dist/sidecar
	cp sidecar ../dist/sidecar/


install:
	@echo "正在整理依賴..."
	go mod tidy

clean:
	rm -f sidecar
	rm -f sidecar.exe
