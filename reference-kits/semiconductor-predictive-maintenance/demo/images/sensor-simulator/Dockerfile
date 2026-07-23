# sensor-simulator — synthetic plasma-etch fab telemetry (OT device side).
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
RUN useradd -u 10001 -m app && chown -R app /app
USER app
ENTRYPOINT ["python", "-u", "app/simulate.py"]
