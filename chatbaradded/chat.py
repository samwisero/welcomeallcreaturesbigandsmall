from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # 1. Read the incoming message from your wooden website
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        body = json.loads(post_data.decode('utf-8'))
        messages = body.get("messages", [])

        # 2. Grab your secure OpenRouter key from the Vercel Vault
        api_key = os.environ.get("OPENROUTER_API_KEY")

        # 3. Pack up the request for OpenRouter
        url = "https://openrouter.ai/api/v1/chat/completions"
        payload = {
            "model": "thedrummer/skyfall-36b-v2",
            "messages": messages,
            "temperature": 0.8
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

        # 4. Send to OpenRouter and wait for the response
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
        
        try:
            with urllib.request.urlopen(req) as response:
                res_data = response.read()
                
            # 5. Send the AI's reply back to your website!
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(res_data)
            
        except Exception as e:
            # If something goes wrong, tell the website
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
