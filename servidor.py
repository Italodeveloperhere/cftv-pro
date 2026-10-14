# -*- coding: utf-8 -*-
"""Servidor CFTV — serve o index e salva cameras.json."""
import http.server, socketserver, json, os, sys, threading, webbrowser, time

PORT = 8000
ARQUIVO_JSON = 'cameras.json'

class CFTVHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200); self.end_headers()

    def do_POST(self):
        if self.path == '/salvar':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length).decode('utf-8')
                data = json.loads(body)
                with open(ARQUIVO_JSON, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "total": len(data)}).encode('utf-8'))
                from datetime import datetime
                print(f"  ✅ [{datetime.now().strftime('%H:%M:%S')}] cameras.json salvo ({len(data)})")
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode('utf-8'))
                print(f"  ❌ Erro: {e}")
        else:
            self.send_error(404)

def abrir_navegador():
    time.sleep(1)
    try:
        webbrowser.open(f'http://localhost:{PORT}/index.html')
        print(f"  🌐 Navegador aberto")
    except Exception as e:
        print(f"  👉 Abra manualmente: http://localhost:{PORT}/index.html")

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print("\n" + "="*60)
    print("  🎥 SERVIDOR CFTV LOCAL")
    print("="*60)
    print(f"  📁 Pasta: {os.getcwd()}")
    print(f"  🌐 URL:   http://localhost:{PORT}/index.html")
    print(f"  🛑 Para parar: Ctrl + C")
    print("="*60 + "\n")
    threading.Thread(target=abrir_navegador, daemon=True).start()
    try:
        with socketserver.TCPServer(("", PORT), CFTVHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  🛑 Servidor parado.\n"); sys.exit(0)