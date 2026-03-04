FROM python:3.11-slim

WORKDIR /app

# Копируем файлы относительно корня проекта
COPY ./control-plane/requirements.txt .
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.5.1.tgz | tar xz --strip-components=1 -C /usr/local/bin docker/docker
RUN pip install --no-cache-dir -r requirements.txt

COPY ./control-plane/app /app/app
COPY ./proto /proto

# Компилируем gRPC контракты
RUN python -m grpc_tools.protoc -I/proto --python_out=/app --grpc_python_out=/app /proto/cloud.proto

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]