import asyncio
import json
import socket
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.future import select

from app.database import AsyncSessionLocal
from app.models.base import User, TenantMember, Instance
from app.core.security import decode_access_token

router = APIRouter(prefix="/terminal", tags=["terminal"])
logger = logging.getLogger(__name__)

DOCKER_SOCKET = "/var/run/docker.sock"


def docker_api(method, path, body=None):
    """Make a raw HTTP request to the Docker daemon via Unix socket."""
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect(DOCKER_SOCKET)

    headers = "Host: localhost\r\n"
    body_bytes = b""
    if body:
        body_bytes = json.dumps(body).encode()
        headers += f"Content-Type: application/json\r\nContent-Length: {len(body_bytes)}\r\n"

    request = f"{method} {path} HTTP/1.1\r\n{headers}\r\n".encode() + body_bytes
    sock.sendall(request)

    # Read response
    response = b""
    while True:
        try:
            chunk = sock.recv(8192)
            if not chunk:
                break
            response += chunk
            # Check if we have the full response
            if b"\r\n\r\n" in response:
                header_end = response.index(b"\r\n\r\n") + 4
                header_part = response[:header_end].decode()
                # For chunked encoding, check for end
                if "Transfer-Encoding: chunked" in header_part:
                    if response.endswith(b"0\r\n\r\n"):
                        break
                    # Read a bit more for short responses
                    try:
                        sock.settimeout(0.5)
                        extra = sock.recv(8192)
                        if extra:
                            response += extra
                    except socket.timeout:
                        pass
                    break
                elif "Content-Length:" in header_part:
                    for line in header_part.split("\r\n"):
                        if line.startswith("Content-Length:"):
                            cl = int(line.split(":")[1].strip())
                            body_part = response[header_end:]
                            if len(body_part) >= cl:
                                break
                    else:
                        continue
                    break
                else:
                    break
        except socket.timeout:
            break

    sock.close()

    # Parse response
    if b"\r\n\r\n" in response:
        header_part, body_part = response.split(b"\r\n\r\n", 1)
        status_line = header_part.decode().split("\r\n")[0]
        status_code = int(status_line.split(" ")[1])

        # Handle chunked encoding
        if b"Transfer-Encoding: chunked" in header_part:
            # Simple chunked decode
            decoded = b""
            remaining = body_part
            while remaining:
                if b"\r\n" not in remaining:
                    break
                size_str, remaining = remaining.split(b"\r\n", 1)
                size = int(size_str, 16)
                if size == 0:
                    break
                decoded += remaining[:size]
                remaining = remaining[size + 2:]  # skip \r\n
            body_part = decoded

        try:
            return status_code, json.loads(body_part)
        except (json.JSONDecodeError, ValueError):
            return status_code, body_part.decode(errors="replace")
    return 500, "No response"


def docker_exec_create(container_id, cmd="/bin/sh"):
    """Create a Docker exec instance."""
    status, data = docker_api("POST", f"/containers/{container_id}/exec", {
        "AttachStdin": True,
        "AttachStdout": True,
        "AttachStderr": True,
        "Tty": True,
        "Cmd": [cmd]
    })
    if status == 201:
        return data.get("Id")
    return None


def docker_exec_start_socket(exec_id):
    """Start Docker exec and return the raw socket for bidirectional I/O."""
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect(DOCKER_SOCKET)

    body = json.dumps({"Tty": True}).encode()
    request = (
        f"POST /exec/{exec_id}/start HTTP/1.1\r\n"
        f"Host: localhost\r\n"
        f"Content-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Connection: Upgrade\r\n"
        f"Upgrade: tcp\r\n"
        f"\r\n"
    ).encode() + body

    sock.sendall(request)

    # Read HTTP response headers
    header_data = b""
    while b"\r\n\r\n" not in header_data:
        chunk = sock.recv(4096)
        if not chunk:
            break
        header_data += chunk

    # After headers, the socket is now a raw stream to the exec process
    # Extract any data that came after the headers
    if b"\r\n\r\n" in header_data:
        _, extra = header_data.split(b"\r\n\r\n", 1)
    else:
        extra = b""

    return sock, extra


def docker_inspect(container_name):
    """Inspect a container by name."""
    status, data = docker_api("GET", f"/containers/{container_name}/json")
    if status == 200:
        return data
    return None


@router.websocket("/ws/{instance_id}")
async def terminal_ws(websocket: WebSocket, instance_id: str, token: str = Query(...)):
    """WebSocket terminal: browser ↔ Docker exec ↔ /bin/sh"""

    # 1. Authenticate via JWT
    payload = decode_access_token(token)
    if not payload:
        await websocket.accept()
        await websocket.send_text("\r\n\x1b[1;31m✗ Authentication failed\x1b[0m\r\n")
        await websocket.close()
        return

    user_id = payload.get("sub")

    # 2. Verify instance exists and user has access
    async with AsyncSessionLocal() as db:
        inst_result = await db.execute(
            select(Instance).where(Instance.id == instance_id)
        )
        instance = inst_result.scalar_one_or_none()

        if not instance:
            await websocket.accept()
            await websocket.send_text("\r\n\x1b[1;31m✗ Instance not found\x1b[0m\r\n")
            await websocket.close()
            return

        # Check tenant membership or admin role
        member_result = await db.execute(
            select(TenantMember).where(
                TenantMember.user_id == user_id,
                TenantMember.tenant_id == instance.tenant_id
            )
        )
        member = member_result.scalar_one_or_none()

        if not member:
            user_result = await db.execute(select(User).where(User.id == user_id))
            user_obj = user_result.scalar_one_or_none()
            if not user_obj or user_obj.role.value != "ADMIN":
                await websocket.accept()
                await websocket.send_text("\r\n\x1b[1;31m✗ Not authorized\x1b[0m\r\n")
                await websocket.close()
                return

    # 3. Check container exists and is running
    container_name = f"iaas-vm-{instance_id}"
    loop = asyncio.get_event_loop()

    inspect_data = await loop.run_in_executor(None, docker_inspect, container_name)
    if not inspect_data:
        await websocket.accept()
        await websocket.send_text(f"\r\n\x1b[1;31m✗ Container not found: {container_name}\x1b[0m\r\n")
        await websocket.close()
        return

    container_id = inspect_data["Id"]
    container_status = inspect_data.get("State", {}).get("Status", "unknown")

    if container_status != "running":
        await websocket.accept()
        await websocket.send_text(f"\r\n\x1b[1;31m✗ Container is {container_status}\x1b[0m\r\n")
        await websocket.close()
        return

    # 4. Create exec instance
    exec_id = await loop.run_in_executor(None, docker_exec_create, container_id)
    if not exec_id:
        await websocket.accept()
        await websocket.send_text("\r\n\x1b[1;31m✗ Failed to create exec session\x1b[0m\r\n")
        await websocket.close()
        return

    # 5. Start exec and get raw socket
    try:
        docker_sock, initial_data = await loop.run_in_executor(
            None, docker_exec_start_socket, exec_id
        )
    except Exception as e:
        await websocket.accept()
        await websocket.send_text(f"\r\n\x1b[1;31m✗ Failed to start exec: {e}\x1b[0m\r\n")
        await websocket.close()
        return

    # 6. Accept WebSocket and start bidirectional pipe
    await websocket.accept()

    if initial_data:
        await websocket.send_bytes(initial_data)

    # Bidirectional pipe
    async def docker_to_ws():
        while True:
            try:
                data = await loop.run_in_executor(None, _blocking_recv, docker_sock)
                if data is None:
                    break
                if data:
                    await websocket.send_bytes(data)
            except Exception:
                break

    async def ws_to_docker():
        while True:
            try:
                message = await websocket.receive()
                if message.get("type") == "websocket.disconnect":
                    break
                data = message.get("bytes") or (message.get("text", "").encode() if message.get("text") else b"")
                if data:
                    await loop.run_in_executor(None, docker_sock.sendall, data)
            except WebSocketDisconnect:
                break
            except Exception:
                break

    try:
        done, pending = await asyncio.wait(
            [asyncio.create_task(docker_to_ws()), asyncio.create_task(ws_to_docker())],
            return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
    except Exception:
        pass
    finally:
        try:
            docker_sock.close()
        except Exception:
            pass


def _blocking_recv(sock):
    """Blocking recv with select timeout."""
    import select as sel
    try:
        ready, _, _ = sel.select([sock], [], [], 1.0)
        if ready:
            data = sock.recv(4096)
            return data if data else None
        return b""
    except Exception:
        return None
