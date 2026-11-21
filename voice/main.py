import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
import websockets

# Load environment variables from project root .env without logging or printing the key
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# Gnani API key read from .env - never printed or logged
GNANI_API_KEY = os.getenv("GNANI_API_KEY")

# Upstream Gnani STT streaming endpoint
GNANI_WS_URL = "wss://api.vachana.ai/stt/v3/stream"

# Headers copied from voice/test_stream.py
HEADERS = {
    "x-api-key-id": GNANI_API_KEY,
    "model": "prisma-v3.0",
    "language_code": "hi-IN",
    "x-sample-rate": "16000",
    "format": "transcribe",
}

app = FastAPI(title="Voice STT Backend")


@app.get("/")
@app.get("/test")
@app.get("/test.html")
async def get_test_page():
    """Serve voice/test.html for testing in the browser."""
    html_path = Path(__file__).resolve().parent / "test.html"
    return FileResponse(html_path, media_type="text/html")


@app.websocket("/ws/stt")
async def websocket_stt_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint:
    - Receives raw binary PCM audio (16-bit, 16 kHz, mono) from browser.
    - Streams audio to Gnani STT in 1024-byte frames.
    - Forwards each transcript as {"type": "segment", "text": "..."}.
    - Emits joined turn {"type": "turn", "text": "..."} after 1.2s without new speech.
    - Reconnects once if Gnani disconnects and emits {"type": "error", "message": "..."}.
    """
    await websocket.accept()

    audio_queue = asyncio.Queue()
    turn_segments = []
    turn_timer = None
    client_closed = False

    # Emit joined turn after 1.2s silence (without new speech)
    async def schedule_turn():
        try:
            await asyncio.sleep(1.2)
            if turn_segments and not client_closed:
                turn_text = " ".join(turn_segments).strip()
                turn_segments.clear()
                if turn_text:
                    await websocket.send_json({"type": "turn", "text": turn_text})
        except asyncio.CancelledError:
            pass

    # Read binary audio chunks from browser WebSocket
    async def browser_reader():
        nonlocal client_closed
        try:
            while True:
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                raw_bytes = msg.get("bytes")
                if raw_bytes:
                    await audio_queue.put(raw_bytes)
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            client_closed = True
            await audio_queue.put(None)  # Sentinel to stop sender

    browser_task = asyncio.create_task(browser_reader())

    pcm_buffer = bytearray()
    reconnect_count = 0
    max_reconnects = 1

    while not client_closed:
        try:
            # Connect to Gnani STT WebSocket
            async with websockets.connect(
                GNANI_WS_URL, additional_headers=HEADERS
            ) as gnani_ws:

                # Send audio in 1024-byte frames to Gnani
                async def send_to_gnani():
                    nonlocal pcm_buffer
                    while not client_closed:
                        chunk = await audio_queue.get()
                        if chunk is None:
                            # Stream ended: pad remaining buffer to 1024 bytes and send
                            if len(pcm_buffer) > 0:
                                remainder = len(pcm_buffer) % 1024
                                if remainder != 0:
                                    pcm_buffer.extend(b"\x00" * (1024 - remainder))
                                while len(pcm_buffer) >= 1024:
                                    await gnani_ws.send(bytes(pcm_buffer[:1024]))
                                    pcm_buffer = pcm_buffer[1024:]
                            # Commit stream to finalize transcription
                            try:
                                await gnani_ws.send(json.dumps({"type": "commit"}))
                            except Exception:
                                pass
                            break

                        pcm_buffer.extend(chunk)
                        while len(pcm_buffer) >= 1024:
                            frame = bytes(pcm_buffer[:1024])
                            pcm_buffer = pcm_buffer[1024:]
                            await gnani_ws.send(frame)

                # Receive messages from Gnani and forward segments/turns
                async def recv_from_gnani():
                    nonlocal turn_timer
                    while not client_closed:
                        raw = await gnani_ws.recv()
                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        msg_type = msg.get("type")
                        if msg_type == "speech_start":
                            # Speech detected: cancel pending turn timeout
                            if turn_timer and not turn_timer.done():
                                turn_timer.cancel()
                        elif msg_type == "transcript":
                            text = msg.get("text", "").strip()
                            if text:
                                # Forward segment to browser
                                await websocket.send_json({"type": "segment", "text": text})
                                turn_segments.append(text)
                                # Reset/schedule 1.2s turn timer
                                if turn_timer and not turn_timer.done():
                                    turn_timer.cancel()
                                turn_timer = asyncio.create_task(schedule_turn())

                send_task = asyncio.create_task(send_to_gnani())
                recv_task = asyncio.create_task(recv_from_gnani())

                # Wait until one completes or fails
                done, pending = await asyncio.wait(
                    [send_task, recv_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for t in pending:
                    t.cancel()

                # Re-raise any network/socket exceptions for reconnection handling
                for t in done:
                    if not t.cancelled():
                        exc = t.exception()
                        if exc:
                            raise exc

                break  # Normal completion

        except (websockets.ConnectionClosed, OSError):
            if client_closed:
                break
            # Reconnect once if Gnani disconnects
            if reconnect_count < max_reconnects:
                reconnect_count += 1
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Gnani connection lost. Reconnecting once...",
                    })
                except Exception:
                    break
                await asyncio.sleep(0.5)
                continue
            else:
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Gnani disconnected.",
                    })
                except Exception:
                    pass
                break
        except Exception as e:
            if not client_closed:
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Server error: {str(e)}",
                    })
                except Exception:
                    pass
            break

    # Clean up background tasks
    browser_task.cancel()
    if turn_timer and not turn_timer.done():
        turn_timer.cancel()

    # If segments remain when closing, send final turn
    if turn_segments and not client_closed:
        final_turn = " ".join(turn_segments).strip()
        turn_segments.clear()
        if final_turn:
            try:
                await websocket.send_json({"type": "turn", "text": final_turn})
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
