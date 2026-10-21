FROM python:3.13-slim
WORKDIR /app
COPY pyproject.toml ./
COPY wayline_traffic ./wayline_traffic
RUN pip install --no-cache-dir . && useradd -r worker
USER worker
EXPOSE 9464
HEALTHCHECK --interval=15s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9464/health')"
CMD ["wayline-traffic-worker"]
