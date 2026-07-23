# edge-inference — on-prem predictive-maintenance inference (SUSE AI analog).
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
RUN useradd -u 10001 -m app && chown -R app /app
USER app
EXPOSE 8080
ENTRYPOINT ["python", "-u", "-m", "app.service"]
