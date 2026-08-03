FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY app/ ./app/
RUN useradd -u 10001 -m app && chown -R app /app
USER app
ENTRYPOINT ["python", "-u", "-m", "app.server"]
