import asyncio, json, os, time, wave
import websockets
from dotenv import load_dotenv
load_dotenv()
KEY = os.getenv("GNANI_API_KEY")
WAV = "voice/test1_fixed.wav"
HEADERS = {
    "x-api-key-id": KEY,
    "model": "prisma-v3.0",
    "language_code": "indic-auto",
    "x-sample-rate": "16000",
      "format": "transcribe",
}
async def main():
    with wave.open(WAV, "rb") as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
        pcm = w.readframes(w.getnframes())
    async with websockets.connect(
        "wss://api.vachana.ai/stt/v3/stream", additional_headers=HEADERS
    ) as ws:
        t0 = time.time()
        async def send():
            for i in range(0, len(pcm), 1024):
                chunk = pcm[i:i + 1024]
                if len(chunk) < 1024:
                    chunk += b"\x00" * (1024 - len(chunk))
                await ws.send(chunk)
                await asyncio.sleep(0.032)
            # silence at the end so the server detects the end of speech
            for _ in range(40):
                await ws.send(b"\x00" * 1024)
                await asyncio.sleep(0.032)
            await ws.send(json.dumps({"type": "commit"}))
        async def recv():
            try:
                while True:
                    raw = await asyncio.wait_for(ws.recv(), timeout=6)
                    print(round(time.time() - t0, 2), "s:", raw)
            except (asyncio.TimeoutError, websockets.ConnectionClosed):
                pass
        await asyncio.gather(send(), recv())
asyncio.run(main())
