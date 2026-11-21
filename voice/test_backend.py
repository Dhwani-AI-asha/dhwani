"""
Integration test for voice/main.py WebSocket /ws/stt endpoint.
Streams voice/test1_fixed.wav as raw 16-bit 16kHz mono PCM and verifies:
- segments are received
- joined turn is received after 1.2s silence
"""
import asyncio
import json
import wave
import uvicorn
import websockets
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voice.main import app

HOST = "127.0.0.1"
PORT = 8001
WAV_PATH = "voice/test1_fixed.wav"


async def run_test():
    # Start uvicorn server in background
    config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())

    # Wait for server to start
    await asyncio.sleep(1.0)

    try:
        # Load test PCM audio
        with wave.open(WAV_PATH, "rb") as w:
            assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
            pcm_data = w.readframes(w.getnframes())

        ws_url = f"ws://{HOST}:{PORT}/ws/stt"
        received_segments = []
        received_turns = []

        async with websockets.connect(ws_url) as ws:
            async def send_audio():
                # Send audio in chunks simulating the browser AudioWorklet
                chunk_size = 512  # 256 samples (16ms)
                for i in range(0, len(pcm_data), chunk_size):
                    await ws.send(pcm_data[i:i + chunk_size])
                    await asyncio.sleep(0.016)
                # Stream finished; wait for speech recognition and 1.2s silence timer to finalize
                await asyncio.sleep(3.0)
                await ws.close()

            async def recv_messages():
                try:
                    while True:
                        msg_raw = await ws.recv()
                        msg = json.loads(msg_raw)
                        print(f"Test received: {msg}")
                        if msg.get("type") == "segment":
                            received_segments.append(msg.get("text"))
                        elif msg.get("type") == "turn":
                            received_turns.append(msg.get("text"))
                except websockets.ConnectionClosed:
                    pass

            await asyncio.gather(send_audio(), recv_messages())

        print(f"\n--- Verification ---")
        print(f"Segments received: {len(received_segments)} -> {received_segments}")
        print(f"Turns received: {len(received_turns)} -> {received_turns}")

        assert len(received_segments) > 0, "Expected at least 1 segment"
        assert len(received_turns) > 0, "Expected at least 1 joined turn"
        print("ALL TESTS PASSED SUCCESSFULLY!")

    finally:
        server.should_exit = True
        await server_task


if __name__ == "__main__":
    asyncio.run(run_test())
