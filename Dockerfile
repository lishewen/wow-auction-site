FROM python:3.11-slim

WORKDIR /app

# 复制网站文件
COPY site/ ./site/
COPY data/ ./data/

# 暴露端口
EXPOSE 80

# 启动 HTTP 服务器
CMD ["python3", "-m", "http.server", "80", "--bind", "0.0.0.0", "--directory", "/app"]
