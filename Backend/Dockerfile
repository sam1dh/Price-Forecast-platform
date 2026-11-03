FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# migrate + seed on first boot so a fresh data/ volume self-populates; then serve.
CMD ["sh", "./entrypoint.sh"]
