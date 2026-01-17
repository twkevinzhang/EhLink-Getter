# 定義虛擬環境路徑 (相對於 sidecar 資料夾)
VENV_BIN = ../.venv/bin
PYTHON = $(VENV_BIN)/python
PIP = $(VENV_BIN)/pip

.PHONY: help install clean

help:
	@echo "可用指令:"
	@echo "  make install - 使用 uv 更新安裝依賴套件"
	@echo "  make clean   - 清除 python 快取文件"

install:
	@echo "正在安裝 sidecar 依賴..."
	uv pip install -r requirements.txt

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
