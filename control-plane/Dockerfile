FROM python:3.11-slim

WORKDIR /app

# Копируем файлы относительно корня проекта
COPY ./control-plane/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./control-plane/app /app/app
COPY ./proto /proto

# Компилируем gRPC контракты
RUN python -m grpc_tools.protoc -I/proto --python_out=/app --grpc_python_out=/app /proto/cloud.proto

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]