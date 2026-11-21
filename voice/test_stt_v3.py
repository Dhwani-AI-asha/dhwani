import os
import requests
from dotenv import load_dotenv
load_dotenv()
KEY = os.getenv("GNANI_API_KEY")
AUDIO = "voice/test1_fixed.wav"
def run(label, data):
    with open(AUDIO, "rb") as f:
        r = requests.post(
            "https://api.vachana.ai/stt/v3",
            headers={"X-API-Key-ID": KEY},
            files={"audio_file": ("audio.wav", f, "audio/wav")},
            data=data,
            timeout=60,
        )
    j = r.json()
    print(label, "->", j.get("transcript"), "| model:", j.get("model"), "| latency:", j.get("end_to_end_latency"))
    if not j.get("success", True):
        print("   full response:", j)
run("A auto-detect     ", {"model": "prisma-v3.0", "language_code": "indic-auto"})
run("B hindi+digits    ", {"model": "prisma-v3.0", "language_code": "hi-IN", "format": "transcribe"})
run("C english+digits  ", {"model": "prisma-v3.0", "language_code": "en-IN", "format": "transcribe"})
run("D auto+digits     ", {"model": "prisma-v3.0", "language_code": "indic-auto", "format": "transcribe"})
