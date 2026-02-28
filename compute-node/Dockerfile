FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache protoc protobuf-dev
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.28
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.2
ENV PATH="$PATH:/go/bin"

# Копируем модули и код относительно корня проекта
COPY ./compute-node/go.mod ./compute-node/go.sum ./
RUN go mod download

COPY ./compute-node/main.go ./
COPY ./proto /proto

# Компилируем .proto файл
RUN mkdir -p cloud
RUN protoc -I/proto --go_out=./cloud --go_opt=paths=source_relative \
    --go-grpc_out=./cloud --go-grpc_opt=paths=source_relative \
    /proto/cloud.proto

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o compute_node .

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/compute_node .
CMD ["./compute_node"]