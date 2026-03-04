package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
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

	// 1. Pull Image (try pull, fallback to local)
	out, err := s.dockerCli.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		// Pull failed — check if image exists locally (imported/snapshot images)
		_, _, inspectErr := s.dockerCli.ImageInspectWithRaw(ctx, imageName)
		if inspectErr != nil {
			log.Printf("Image %s not found locally and cannot pull: %v", imageName, err)
			return &pb.InstanceResponse{Success: false, Message: fmt.Sprintf("Failed to pull image: %v", err)}, nil
		}
		log.Printf("Image %s not pullable but found locally, proceeding", imageName)
	} else {
		defer out.Close()
		io.Copy(io.Discard, out)
	}

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

	// Determine if this is a web server image
	isWebServer := strings.Contains(imageName, "nginx")

	hostConfig := &container.HostConfig{
		Resources: container.Resources{
			Memory:   memoryBytes,
			NanoCPUs: nanoCpus,
		},
	}

	// For web server images, expose port 80 to a random host port
	exposedPorts := map[nat.Port]struct{}{}
	if isWebServer {
		exposedPorts["80/tcp"] = struct{}{}
		hostConfig.PortBindings = nat.PortMap{
			"80/tcp": []nat.PortBinding{
				{HostIP: "0.0.0.0", HostPort: "0"}, // 0 = random available port
			},
		}
	}

	netConfig := &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			networkName: {
				NetworkID: networkID,
			},
		},
	}

	containerName := fmt.Sprintf("iaas-vm-%s", req.InstanceId)

	// For web servers, use default CMD (starts nginx). For others, use tail keepalive.
	containerConfig := &container.Config{
		Image:        imageName,
		ExposedPorts: exposedPorts,
	}
	if !isWebServer {
		containerConfig.Cmd = []string{"tail", "-f", "/dev/null"}
	}

	resp, err := s.dockerCli.ContainerCreate(ctx, containerConfig, hostConfig, netConfig, nil, containerName)

	if err != nil {
		return &pb.InstanceResponse{Success: false, Message: fmt.Sprintf("Failed to create container: %v", err)}, nil
	}

	if err := s.dockerCli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return &pb.InstanceResponse{Success: false, Message: fmt.Sprintf("Failed to start container: %v", err)}, nil
	}

	inspect, err := s.dockerCli.ContainerInspect(ctx, resp.ID)
	ipAddress := "unknown"
	hostPort := ""
	if err == nil && inspect.NetworkSettings != nil {
		if netInfo, ok := inspect.NetworkSettings.Networks[networkName]; ok && netInfo.IPAddress != "" {
			ipAddress = netInfo.IPAddress
		} else if inspect.NetworkSettings.IPAddress != "" {
			ipAddress = inspect.NetworkSettings.IPAddress
		}

		if isWebServer {
			if portBindings, ok := inspect.NetworkSettings.Ports["80/tcp"]; ok && len(portBindings) > 0 {
				hostPort = portBindings[0].HostPort
			}
		}
	}

	message := "Running"
	if hostPort != "" {
		message = fmt.Sprintf("Running|port:%s", hostPort)
	}

	log.Printf("Instance %s provisioned successfully with IP: %s, hostPort: %s", req.InstanceId, ipAddress, hostPort)
	return &pb.InstanceResponse{Success: true, Message: message, IpAddress: ipAddress}, nil
}

func (s *server) DeleteInstance(ctx context.Context, req *pb.DeleteInstanceRequest) (*pb.InstanceResponse, error) {
	log.Printf("Received delete request for Instance ID: %s, Tenant: %s", req.InstanceId, req.TenantId)

	containerName := fmt.Sprintf("iaas-vm-%s", req.InstanceId)

	timeout := 10
	err := s.dockerCli.ContainerStop(ctx, containerName, container.StopOptions{Timeout: &timeout})
	if err != nil {
		log.Printf("Warning: Failed to stop container %s: %v", containerName, err)
	}

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

func (s *server) GetContainerStats(ctx context.Context, req *pb.ContainerStatsRequest) (*pb.ContainerStatsResponse, error) {
	containerName := fmt.Sprintf("iaas-vm-%s", req.InstanceId)

	stats, err := s.dockerCli.ContainerStats(ctx, containerName, false)
	if err != nil {
		return nil, fmt.Errorf("failed to get container stats: %v", err)
	}
	defer stats.Body.Close()

	var v *container.StatsResponse
	if err := json.NewDecoder(stats.Body).Decode(&v); err != nil {
		return nil, fmt.Errorf("failed to decode stats: %v", err)
	}

	cpuPercent := 0.0
	cpuDelta := float64(v.CPUStats.CPUUsage.TotalUsage - v.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(v.CPUStats.SystemUsage - v.PreCPUStats.SystemUsage)
	if systemDelta > 0.0 && cpuDelta > 0.0 {
		cpuPercent = (cpuDelta / systemDelta) * float64(len(v.CPUStats.CPUUsage.PercpuUsage)) * 100.0
	}

	ramMB := float64(v.MemoryStats.Usage) / (1024 * 1024)
	ramLimitMB := float64(v.MemoryStats.Limit) / (1024 * 1024)

	rxBytes := 0.0
	txBytes := 0.0
	for _, net := range v.Networks {
		rxBytes += float64(net.RxBytes)
		txBytes += float64(net.TxBytes)
	}

	return &pb.ContainerStatsResponse{
		CpuUsagePercent: cpuPercent,
		RamUsageMb:      ramMB,
		RamLimitMb:      ramLimitMB,
		NetworkRxBytes:  rxBytes,
		NetworkTxBytes:  txBytes,
	}, nil
}

// ===== REAL NODE STATS (reads from /proc) =====

func readCPUUsage() float64 {
	// Try host proc first, fallback to container /proc
	procPath := "/host/proc/stat"
	if _, err := os.Stat(procPath); os.IsNotExist(err) {
		procPath = "/proc/stat"
	}

	read := func() (idle, total uint64) {
		f, err := os.Open(procPath)
		if err != nil {
			return 0, 0
		}
		defer f.Close()
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "cpu ") {
				fields := strings.Fields(line)
				if len(fields) < 5 {
					return 0, 0
				}
				var sum uint64
				for i := 1; i < len(fields); i++ {
					val, _ := strconv.ParseUint(fields[i], 10, 64)
					sum += val
					if i == 4 { // idle is the 4th value (index 4)
						idle = val
					}
				}
				return idle, sum
			}
		}
		return 0, 0
	}

	idle1, total1 := read()
	time.Sleep(500 * time.Millisecond)
	idle2, total2 := read()

	idleDelta := float64(idle2 - idle1)
	totalDelta := float64(total2 - total1)
	if totalDelta == 0 {
		return 0
	}
	return ((totalDelta - idleDelta) / totalDelta) * 100.0
}

func readMemInfo() (usageMB, totalMB float64) {
	procPath := "/host/proc/meminfo"
	if _, err := os.Stat(procPath); os.IsNotExist(err) {
		procPath = "/proc/meminfo"
	}

	f, err := os.Open(procPath)
	if err != nil {
		return 0, 0
	}
	defer f.Close()

	vals := map[string]float64{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		key := strings.TrimSuffix(parts[0], ":")
		val, _ := strconv.ParseFloat(parts[1], 64)
		vals[key] = val // values in kB
	}

	totalMB = vals["MemTotal"] / 1024.0
	available := vals["MemAvailable"] / 1024.0
	usageMB = totalMB - available
	return
}

func readDiskUsage() float64 {
	path := "/host/rootfs"
	if _, err := os.Stat(path); os.IsNotExist(err) {
		path = "/"
	}

	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0
	}
	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bfree * uint64(stat.Bsize)
	if total == 0 {
		return 0
	}
	return float64(total-free) / float64(total) * 100.0
}

func (s *server) GetNodeStats(ctx context.Context, req *pb.NodeStatsRequest) (*pb.NodeStatsResponse, error) {
	containers, err := s.dockerCli.ContainerList(ctx, container.ListOptions{})
	running := 0
	if err == nil {
		running = len(containers)
	}

	cpuPercent := readCPUUsage()
	ramUsage, ramTotal := readMemInfo()
	diskPercent := readDiskUsage()

	return &pb.NodeStatsResponse{
		CpuUsagePercent:   cpuPercent,
		RamUsageMb:        ramUsage,
		RamTotalMb:        ramTotal,
		DiskUsagePercent:  diskPercent,
		ContainersRunning: int32(running),
	}, nil
}

// ===== SNAPSHOT MANAGEMENT =====

func (s *server) CreateSnapshot(ctx context.Context, req *pb.CreateSnapshotRequest) (*pb.SnapshotResponse, error) {
	containerName := fmt.Sprintf("iaas-vm-%s", req.InstanceId)
	snapshotImage := req.SnapshotName

	log.Printf("Creating snapshot '%s' for container %s", snapshotImage, containerName)

	// docker commit
	commitResp, err := s.dockerCli.ContainerCommit(ctx, containerName, container.CommitOptions{
		Reference: snapshotImage,
		Comment:   fmt.Sprintf("Snapshot of instance %s", req.InstanceId),
		Pause:     true,
	})
	if err != nil {
		log.Printf("Error creating snapshot: %v", err)
		return &pb.SnapshotResponse{Success: false, Message: fmt.Sprintf("Failed to create snapshot: %v", err)}, nil
	}

	// Get image size
	inspectImg, _, err := s.dockerCli.ImageInspectWithRaw(ctx, commitResp.ID)
	var sizeBytes int64
	if err == nil {
		sizeBytes = inspectImg.Size
	}

	log.Printf("Snapshot '%s' created successfully (size: %d bytes)", snapshotImage, sizeBytes)

	return &pb.SnapshotResponse{
		Success:       true,
		Message:       "Snapshot created",
		SnapshotImage: snapshotImage,
		SizeBytes:     sizeBytes,
	}, nil
}

func (s *server) RestoreSnapshot(ctx context.Context, req *pb.RestoreSnapshotRequest) (*pb.SnapshotResponse, error) {
	containerName := fmt.Sprintf("iaas-vm-%s", req.InstanceId)
	snapshotImage := req.SnapshotImage

	log.Printf("Restoring container %s from snapshot '%s' (original image: %s)", containerName, snapshotImage, req.Image)

	// 1. Stop and remove old container
	timeout := 5
	_ = s.dockerCli.ContainerStop(ctx, containerName, container.StopOptions{Timeout: &timeout})
	_ = s.dockerCli.ContainerRemove(ctx, containerName, container.RemoveOptions{Force: true, RemoveVolumes: true})

	// 2. Prepare network
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
		res, err := s.dockerCli.NetworkCreate(ctx, networkName, network.CreateOptions{Driver: "bridge"})
		if err != nil {
			return &pb.SnapshotResponse{Success: false, Message: fmt.Sprintf("Failed to create network: %v", err)}, nil
		}
		networkID = res.ID
	}

	memoryBytes := int64(req.RamMb) * 1024 * 1024
	nanoCpus := int64(req.Vcpu) * 1000000000

	// Use original image name for web server detection, not snapshot name
	isWebServer := strings.Contains(req.Image, "nginx")

	hostConfig := &container.HostConfig{
		Resources: container.Resources{
			Memory:   memoryBytes,
			NanoCPUs: nanoCpus,
		},
	}

	exposedPorts := map[nat.Port]struct{}{}
	if isWebServer {
		exposedPorts["80/tcp"] = struct{}{}
		hostConfig.PortBindings = nat.PortMap{
			"80/tcp": []nat.PortBinding{{HostIP: "0.0.0.0", HostPort: "0"}},
		}
	}

	netConfig := &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			networkName: {NetworkID: networkID},
		},
	}

	containerConfig := &container.Config{
		Image:        snapshotImage,
		ExposedPorts: exposedPorts,
	}
	if !isWebServer {
		containerConfig.Cmd = []string{"tail", "-f", "/dev/null"}
	}

	// 3. Create new container from snapshot image
	resp, err := s.dockerCli.ContainerCreate(ctx, containerConfig, hostConfig, netConfig, nil, containerName)
	if err != nil {
		return &pb.SnapshotResponse{Success: false, Message: fmt.Sprintf("Failed to create container from snapshot: %v", err)}, nil
	}

	// 4. Start
	if err := s.dockerCli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return &pb.SnapshotResponse{Success: false, Message: fmt.Sprintf("Failed to start restored container: %v", err)}, nil
	}

	// 5. Get IP and port
	inspect, err := s.dockerCli.ContainerInspect(ctx, resp.ID)
	ipAddress := "unknown"
	hostPort := ""
	if err == nil && inspect.NetworkSettings != nil {
		if netInfo, ok := inspect.NetworkSettings.Networks[networkName]; ok && netInfo.IPAddress != "" {
			ipAddress = netInfo.IPAddress
		} else if inspect.NetworkSettings.IPAddress != "" {
			ipAddress = inspect.NetworkSettings.IPAddress
		}

		if isWebServer {
			if portBindings, ok := inspect.NetworkSettings.Ports["80/tcp"]; ok && len(portBindings) > 0 {
				hostPort = portBindings[0].HostPort
			}
		}
	}

	message := "Restored from snapshot"
	if hostPort != "" {
		message = fmt.Sprintf("Restored|port:%s", hostPort)
	}

	log.Printf("Container %s restored from '%s', new IP: %s, hostPort: %s", containerName, snapshotImage, ipAddress, hostPort)

	return &pb.SnapshotResponse{
		Success:       true,
		Message:       message,
		SnapshotImage: snapshotImage,
		IpAddress:     ipAddress,
	}, nil
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
