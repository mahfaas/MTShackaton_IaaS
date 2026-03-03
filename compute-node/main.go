package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
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

	log.Printf("Received provision request for Instance ID: %s, Tenant: %s, Image: %s", req.InstanceId, req.TenantId, imageName)

	// 1. Pull Image (with early return on failure)
	out, err := s.dockerCli.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		log.Printf("Error pulling image %s: %v", imageName, err)
		return &pb.InstanceResponse{Success: false, Message: fmt.Sprintf("Failed to pull image: %v", err)}, nil
	}
	defer out.Close()
	io.Copy(io.Discard, out)

	// 2. Network Isolation (SDN emulation)
	networkName := fmt.Sprintf("tenant-%s", req.TenantId)
	networks, err := s.dockerCli.NetworkList(ctx, network.ListOptions{})
	var networkID string
	if err == nil {
		for _, n := range networks {
			if n.Name == networkName {
				networkID = n.ID
				break
			}
		}
	}

	if networkID == "" {
		res, err := s.dockerCli.NetworkCreate(ctx, networkName, network.CreateOptions{
			Driver: "bridge",
		})
		if err != nil {
			return &pb.InstanceResponse{Success: false, Message: fmt.Sprintf("Failed to create network: %v", err)}, nil
		}
		networkID = res.ID
	}

	memoryBytes := int64(req.RamMb) * 1024 * 1024
	nanoCpus := int64(req.Vcpu) * 1000000000

	hostConfig := &container.HostConfig{
		Resources: container.Resources{
			Memory:   memoryBytes,
			NanoCPUs: nanoCpus,
		},
	}

	netConfig := &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			networkName: {
				NetworkID: networkID,
			},
		},
	}

	containerName := fmt.Sprintf("iaas-vm-%s", req.InstanceId)

	resp, err := s.dockerCli.ContainerCreate(ctx, &container.Config{
		Image: imageName,
		Cmd:   []string{"tail", "-f", "/dev/null"},
	}, hostConfig, netConfig, nil, containerName)

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

func (s *server) DeleteInstance(ctx context.Context, req *pb.DeleteInstanceRequest) (*pb.InstanceResponse, error) {
	log.Printf("Received delete request for Instance ID: %s, Tenant: %s", req.InstanceId, req.TenantId)

	containerName := fmt.Sprintf("iaas-vm-%s", req.InstanceId)

	// Stop container (timeout 10s)
	timeout := 10
	err := s.dockerCli.ContainerStop(ctx, containerName, container.StopOptions{Timeout: &timeout})
	if err != nil {
		log.Printf("Warning: Failed to stop container %s: %v", containerName, err)
		// Try to force remove anyway
	}

	// Remove container
	err = s.dockerCli.ContainerRemove(ctx, containerName, container.RemoveOptions{
		Force:         true,
		RemoveVolumes: true,
	})

	if err != nil {
		log.Printf("Error: Failed to remove container %s: %v", containerName, err)
		return &pb.InstanceResponse{Success: false, Message: fmt.Sprintf("Failed to remove container: %v", err)}, nil
	}

	log.Printf("Successfully removed container %s", containerName)
	return &pb.InstanceResponse{Success: true, Message: "Deleted", IpAddress: ""}, nil
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
