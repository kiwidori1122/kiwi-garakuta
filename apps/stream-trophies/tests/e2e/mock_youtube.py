import json, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
CH="UC"+"a"*22; VID="abcdefghijk"
state={"live":False,"ended":False,"chat":[],"calls":[],"quota":False}
class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def send(self,code,obj):
        b=json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if "chat" in body: state["chat"]+=body.pop("chat")
        state.update(body); self.send(200,{"ok":True})
    def do_GET(self):
        u=urlparse(self.path); q=parse_qs(u.query); r=u.path.strip("/")
        if r=="state": return self.send(200,state)
        state["calls"].append(r)
        if q.get("key",[""])[0]!="test-key": return self.send(400,{"error":{"errors":[{"reason":"keyInvalid"}]}})
        if state["quota"]: return self.send(403,{"error":{"errors":[{"reason":"quotaExceeded"}]}})
        if r=="channels": return self.send(200,{"items":[{"id":CH}]} if q.get("forHandle",[""])[0]=="@example" else {"items":[]})
        if r=="playlistItems": return self.send(200,{"items":[{"contentDetails":{"videoId":"oldvideo123"}},{"contentDetails":{"videoId":VID}}]})
        if r=="videos":
            items=[{"id":"oldvideo123","snippet":{"channelId":CH,"title":"昔の配信","liveBroadcastContent":"none"},"liveStreamingDetails":{"actualStartTime":"x","actualEndTime":"y"}}]
            if state["live"]: items.append({"id":VID,"snippet":{"channelId":CH,"channelTitle":"テストch","title":"テスト配信","liveBroadcastContent":"live"},"liveStreamingDetails":{"actualStartTime":"x","activeLiveChatId":"chat1"}})
            return self.send(200,{"items":[i for i in items if i["id"] in q["id"][0].split(",")]})
        if r=="liveChat/messages":
            if state["ended"]: return self.send(403,{"error":{"errors":[{"reason":"liveChatEnded"}]}})
            items=state["chat"]; state["chat"]=[]
            return self.send(200,{"items":items,"nextPageToken":"tok%d"%len(state["calls"]),"pollingIntervalMillis":2000})
        self.send(404,{})
ThreadingHTTPServer(("127.0.0.1",8899),H).serve_forever()
