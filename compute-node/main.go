package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"google.golang.org/grpc"

	pb "compute-node/cloud"
)

type server struct {
	pb.UnimplementedComputeServiceServer
	dockerCli *client.Client
}

func (s *server) CreateInstance(ctx context.Context, req *pb.CreateInstanceRequest) (*pb.InstanceResponse, error) {

	imageName := req.Image
	if imageName == "alpine" || imageName == "ubuntu" {
		imageName += ":latest"
	}

	log.Printf("Received provision request for Instance ID: %s, Image: %s, %d vCPU, %d MB RAM", req.InstanceId, imageName, req.Vcpu, req.RamMb)

	out, err := s.dockerCli.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		log.Printf("Error pulling image: %v", err)
	} else {

		defer out.Close()
		io.Copy(io.Discard, out)
	}

	memoryBytes := int64(req.RamMb) * 1024 * 1024
	nanoCpus := int64(req.Vcpu) * 1000000000

	hostConfig := &container.HostConfig{
		Resources: container.Resources{
			Memory:   memoryBytes,
			NanoCPUs: nanoCpus,
		},
	}

	containerName := fmt.Sprintf("iaas-vm-%s", req.InstanceId)

	resp, err := s.dockerCli.ContainerCreate(ctx, &container.Config{
		Image: imageName,
		Cmd:   []string{"tail", "-f", "/dev/null"},
	}, hostConfig, nil, nil, containerName)

	if err != nil {
		return &pb.InstanceResponse{Success: false, Message: fmt.Sprintf("Failed to create container: %v", err)}, nil
	}

	if err := s.dockerCli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return &pb.InstanceResponse{Success: false, Message: fmt.Sprintf("Failed to start container: %v", err)}, nil
	}

	inspect, err := s.dockerCli.ContainerInspect(ctx, resp.ID)
	ipAddress := "unknown"
	if err == nil && inspect.NetworkSettings != nil {
		ipAddress = inspect.NetworkSettings.IPAddress
	}

	log.Printf("Instance %s provisioned successfully with IP: %s", req.InstanceId, ipAddress)
	return &pb.InstanceResponse{Success: true, Message: "Running", IpAddress: ipAddress}, nil
}

func main() {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatalf("Failed to create Docker client: %v", err)
	}

	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("Failed to listen on port 50051: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterComputeServiceServer(s, &server{dockerCli: cli})

	log.Println("Compute Node is running on port 50051...")
	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve gRPC: %v", err)
	}
}
