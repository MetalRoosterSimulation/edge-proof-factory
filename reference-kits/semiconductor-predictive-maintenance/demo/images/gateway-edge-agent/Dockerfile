# gateway-edge-agent — Losant Gateway Edge Agent tier (SUSE Industrial Edge).
# Ships the real `losant-mqtt` SDK; forwards ONLY derived scores to the Losant
# platform. The `make demo-losant` profile swaps this for `losant/edge-agent`.
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
RUN useradd -u 10001 -m app && chown -R app /app
USER app
EXPOSE 8081
ENTRYPOINT ["python", "-u", "app/gateway.py"]
