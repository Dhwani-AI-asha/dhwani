import os
from dotenv import load_dotenv
from gnani.stt import GnaniSTTClient
load_dotenv()
client = GnaniSTTClient(api_key=os.getenv("GNANI_API_KEY"))
result = client.transcribe("voice/test1_fixed.wav", language_code="hi-IN")
print(result)
