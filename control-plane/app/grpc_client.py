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
            # Added 15s timeout to prevent control-plane hangs
            response = await stub.CreateInstance(request, timeout=15)
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