import os
import grpc
# Эти файлы будут сгенерированы Docker-ом на этапе сборки (см. Dockerfile)
import cloud_pb2
import cloud_pb2_grpc

COMPUTE_NODE_URL = os.getenv("COMPUTE_NODE_URL", "localhost:50051")

async def provision_instance_via_grpc(instance_id: str, tenant_id: str, vcpu: int, ram_mb: int, image: str) -> dict:
    """Асинхронный вызов Go микросервиса для создания ВМ"""
    async with grpc.aio.insecure_channel(COMPUTE_NODE_URL) as channel:
        stub = cloud_pb2_grpc.ComputeServiceStub(channel)
        request = cloud_pb2.CreateInstanceRequest(
            instance_id=instance_id,
            tenant_id=tenant_id,
            vcpu=vcpu,
            ram_mb=ram_mb,
            image=image
        )
        try:
            # Timeout must be long enough for first-time docker image pulls (Ubuntu ~30MB, Debian ~50MB)
            response = await stub.CreateInstance(request, timeout=120)
            return {
                "success": response.success,
                "message": response.message,
                "ip_address": response.ip_address
            }
        except grpc.aio.AioRpcError as e:
            return {"success": False, "message": f"gRPC Error: {e.details()}"}

async def delete_instance_via_grpc(instance_id: str, tenant_id: str) -> dict:
    """Асинхронный вызов Go микросервиса для удаления ВМ"""
    async with grpc.aio.insecure_channel(COMPUTE_NODE_URL) as channel:
        stub = cloud_pb2_grpc.ComputeServiceStub(channel)
        request = cloud_pb2.DeleteInstanceRequest(
            instance_id=instance_id,
            tenant_id=tenant_id
        )
        try:
            response = await stub.DeleteInstance(request, timeout=10.0)
            return {"success": response.success, "message": response.message}
        except grpc.aio.AioRpcError as e:
            return {"success": False, "message": f"gRPC Error: {e.details()}"}

async def get_container_stats_via_grpc(instance_id: str) -> dict:
    """Асинхронный вызов Go микросервиса для получения статистики контейнера"""
    async with grpc.aio.insecure_channel(COMPUTE_NODE_URL) as channel:
        stub = cloud_pb2_grpc.ComputeServiceStub(channel)
        request = cloud_pb2.ContainerStatsRequest(instance_id=instance_id)
        try:
            response = await stub.GetContainerStats(request, timeout=5.0)
            return {
                "success": True,
                "cpu_usage_percent": response.cpu_usage_percent,
                "ram_usage_mb": response.ram_usage_mb,
                "ram_limit_mb": response.ram_limit_mb,
                "network_rx_bytes": response.network_rx_bytes,
                "network_tx_bytes": response.network_tx_bytes
            }
        except grpc.aio.AioRpcError as e:
            return {"success": False, "message": f"gRPC Error: {e.details()}"}

async def get_node_stats_via_grpc() -> dict:
    """Асинхронный вызов Go микросервиса для получения статистики физической ноды"""
    async with grpc.aio.insecure_channel(COMPUTE_NODE_URL) as channel:
        stub = cloud_pb2_grpc.ComputeServiceStub(channel)
        request = cloud_pb2.NodeStatsRequest()
        try:
            response = await stub.GetNodeStats(request, timeout=5.0)
            return {
                "success": True,
                "cpu_usage_percent": response.cpu_usage_percent,
                "ram_usage_mb": response.ram_usage_mb,
                "ram_total_mb": response.ram_total_mb,
                "disk_usage_percent": response.disk_usage_percent,
                "containers_running": response.containers_running
            }
        except grpc.aio.AioRpcError as e:
            return {"success": False, "message": f"gRPC Error: {e.details()}"}

async def create_snapshot_via_grpc(instance_id: str, snapshot_name: str) -> dict:
    async with grpc.aio.insecure_channel(COMPUTE_NODE_URL) as channel:
        stub = cloud_pb2_grpc.ComputeServiceStub(channel)
        request = cloud_pb2.CreateSnapshotRequest(
            instance_id=instance_id,
            snapshot_name=snapshot_name
        )
        try:
            response = await stub.CreateSnapshot(request, timeout=60)
            return {
                "success": response.success,
                "message": response.message,
                "snapshot_image": response.snapshot_image,
                "size_bytes": response.size_bytes
            }
        except grpc.aio.AioRpcError as e:
            return {"success": False, "message": f"gRPC Error: {e.details()}"}

async def restore_snapshot_via_grpc(instance_id: str, snapshot_image: str, tenant_id: str, vcpu: int, ram_mb: int) -> dict:
    async with grpc.aio.insecure_channel(COMPUTE_NODE_URL) as channel:
        stub = cloud_pb2_grpc.ComputeServiceStub(channel)
        request = cloud_pb2.RestoreSnapshotRequest(
            instance_id=instance_id,
            snapshot_image=snapshot_image,
            tenant_id=tenant_id,
            vcpu=vcpu,
            ram_mb=ram_mb
        )
        try:
            response = await stub.RestoreSnapshot(request, timeout=60)
            return {
                "success": response.success,
                "message": response.message,
                "snapshot_image": response.snapshot_image,
                "ip_address": response.ip_address
            }
        except grpc.aio.AioRpcError as e:
            return {"success": False, "message": f"gRPC Error: {e.details()}"}